use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};

use crate::constants::{
    BASE, EMPTY_MERKLE_ROOT, MINT_AUTHORITY_SEED, MINT_STATE_SEED, PLATFORM_SEED, REGISTRY_SEED,
};
use crate::errors::ErrorCode;
use crate::events::NftPurchased;
use crate::state::{MintState, PlatformConfig, PriceMode, Registry};
use crate::utils::{transfer_lamports, verify_merkle_proof};

pub(crate) fn handler(
    ctx: Context<BuyNft>,
    _id: u64,
    amount: u64,
    merkle_proof: Option<Vec<[u8; 32]>>,
) -> Result<()> {
    require!(amount > 0, ErrorCode::AmountCantBeZero);

    let platform_config = &ctx.accounts.platform_config;
    require!(platform_config.initialized, ErrorCode::ProgramNotInitialized);
    require!(
        (platform_config.community_fee as u64) <= BASE,
        ErrorCode::InvalidFee
    );

    let registry = &ctx.accounts.registry;
    require!(
        registry.remaining_supply >= amount,
        ErrorCode::InsufficientSupply
    );

    let buyer_key = ctx.accounts.signer.key();
    let registry_key = registry.key();

    let mint_state = &mut ctx.accounts.mint_state;
    if mint_state.buyer == Pubkey::default() {
        mint_state.buyer = buyer_key;
        mint_state.registry = registry_key;
        mint_state.bump = ctx.bumps.mint_state;
    } else {
        require_keys_eq!(mint_state.buyer, buyer_key, ErrorCode::Unauthorized);
        require_keys_eq!(mint_state.registry, registry_key, ErrorCode::Unauthorized);
    }
    let new_mints = mint_state
        .mints
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    if let Some(cap) = registry.max_per_wallet {
        require!(new_mints <= cap, ErrorCode::MintCapExceeded);
    }
    mint_state.mints = new_mints;

    let (whitelisted, discount_per_mille) = if registry.whitelist_root == EMPTY_MERKLE_ROOT {
        (false, registry.discount as u64)
    } else {
        let proof = merkle_proof.ok_or(ErrorCode::InvalidMerkleProof)?;
        let ok = verify_merkle_proof(&buyer_key, &proof, &registry.whitelist_root);
        require!(ok, ErrorCode::InvalidMerkleProof);
        (true, registry.whitelist_discount_bps as u64)
    };

    let unit_price_lamports: u64 = match registry.price_mode {
        PriceMode::FixedLamports => registry.price_value,
        PriceMode::UsdPegged => return Err(error!(ErrorCode::InvalidPriceMode)),
    };

    let total_before_discount = unit_price_lamports
        .checked_mul(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    let community_fee = platform_config.community_fee as u64;

    let (creator_share, platform_share, total_paid) = if discount_per_mille >= BASE {
        (0u64, 0u64, 0u64)
    } else {
        let discount_amount = (total_before_discount as u128)
            .checked_mul(discount_per_mille as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BASE as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        let total_after_discount = total_before_discount
            .checked_sub(discount_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        let platform_share = (total_after_discount as u128)
            .checked_mul(community_fee as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BASE as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        let creator_share = total_after_discount
            .checked_sub(platform_share)
            .ok_or(ErrorCode::MathOverflow)?;
        (creator_share, platform_share, total_after_discount)
    };

    if creator_share > 0 {
        transfer_lamports(
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.creator_account.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            creator_share,
        )?;
    }
    if platform_share > 0 {
        transfer_lamports(
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.platform_owner_account.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            platform_share,
        )?;
    }

    let mint_authority_bump = ctx.bumps.mint_authority;
    let mint_authority_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[mint_authority_bump]];
    let signer_seeds = &[mint_authority_seeds];

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.buyer_token_account.to_account_info(),
        authority: ctx.accounts.mint_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    mint_to(cpi_ctx, amount)?;

    let registry = &mut ctx.accounts.registry;
    registry.remaining_supply = registry
        .remaining_supply
        .checked_sub(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    emit!(NftPurchased {
        buyer: buyer_key,
        registry: registry_key,
        amount,
        paid_lamports: total_paid,
        creator_share,
        platform_share,
        whitelisted,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct BuyNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        address = registry.mint @ ErrorCode::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA used as mint authority.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump,
    )]
    pub mint_authority: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + MintState::INIT_SPACE,
        seeds = [MINT_STATE_SEED, signer.key().as_ref(), registry.key().as_ref()],
        bump,
    )]
    pub mint_state: Account<'info, MintState>,

    /// CHECK: must equal `registry.creator`. Receives the creator share.
    #[account(
        mut,
        address = registry.creator @ ErrorCode::InvalidCreatorAccount,
    )]
    pub creator_account: AccountInfo<'info>,

    /// CHECK: must equal `platform_config.owner`. Receives the platform fee.
    #[account(
        mut,
        address = platform_config.owner @ ErrorCode::InvalidPlatformOwnerAccount,
    )]
    pub platform_owner_account: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
