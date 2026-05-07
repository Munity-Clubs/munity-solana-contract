use anchor_lang::prelude::*;
use anchor_spl::metadata::{
    create_metadata_accounts_v3,
    mpl_token_metadata::types::{Creator, DataV2},
    sign_metadata, CreateMetadataAccountsV3, Metadata, SignMetadata,
};
use anchor_spl::token::{Mint, Token};

use crate::constants::{
    BASE, COUNTER_SEED, CREATOR_SHARE, MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN,
    MINT_AUTHORITY_SEED, MINT_SEED, PLATFORM_ROYALTY_SHARE, PLATFORM_SEED, REGISTRY_SEED,
    ROYALTY_FEE_BPS,
};
use crate::errors::ErrorCode;
use crate::events::CommunityRegistered;
use crate::state::{CreatorSplit, GlobalCounter, PlatformConfig, PriceMode, Registry};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterCommunityArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub supply: u64,
    pub price_mode: PriceMode,
    pub price_value: u64,
    pub discount: u16,
    pub max_per_wallet: Option<u64>,
    pub whitelist_root: [u8; 32],
    pub whitelist_discount_bps: u16,
    /// Optional collaborator royalty splits. `None` (or `Some(vec![signer @ 80])`)
    /// preserves the legacy solo-creator shape. With splits, 1..=4 entries must
    /// sum to `CREATOR_SHARE` (80), include the signer, contain no duplicates,
    /// and exclude the default Pubkey. Platform royalty (`PLATFORM_ROYALTY_SHARE` = 20)
    /// is always appended; total entries ≤ 5 (Metaplex max).
    pub creator_splits: Option<Vec<CreatorSplit>>,
}

pub(crate) fn handler(ctx: Context<RegisterCommunity>, args: RegisterCommunityArgs) -> Result<u64> {
    let RegisterCommunityArgs {
        name,
        symbol,
        uri,
        supply,
        price_mode,
        price_value,
        discount,
        max_per_wallet,
        whitelist_root,
        whitelist_discount_bps,
        creator_splits,
    } = args;

    require!(name.len() <= MAX_NAME_LEN, ErrorCode::NameTooLong);
    require!(symbol.len() <= MAX_SYMBOL_LEN, ErrorCode::SymbolTooLong);
    require!(uri.len() <= MAX_URI_LEN, ErrorCode::UriTooLong);
    require!(supply > 0, ErrorCode::SupplyCantBeZero);
    require!(price_value > 0, ErrorCode::PriceCantBeZero);
    require!((discount as u64) <= BASE, ErrorCode::InvalidDiscount);
    require!(
        (whitelist_discount_bps as u64) <= BASE,
        ErrorCode::InvalidWhitelistDiscount
    );
    require!(
        matches!(price_mode, PriceMode::FixedLamports),
        ErrorCode::InvalidPriceMode
    );

    let counter = &mut ctx.accounts.counter;
    counter.count = counter
        .count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    let id = counter.count;

    let snap_pyth_feed_id = match price_mode {
        PriceMode::FixedLamports => [0u8; 32],
        PriceMode::UsdPegged => ctx.accounts.platform_config.pyth_sol_usd_feed_id,
    };

    let registry = &mut ctx.accounts.registry;
    registry.id = id;
    registry.mint = ctx.accounts.mint.key();
    registry.creator = ctx.accounts.signer.key();
    registry.remaining_supply = supply;
    registry.price_mode = price_mode;
    registry.price_value = price_value;
    registry.pyth_feed_id = snap_pyth_feed_id;
    registry.discount = discount;
    registry.whitelist_root = whitelist_root;
    registry.whitelist_discount_bps = whitelist_discount_bps;
    registry.max_per_wallet = max_per_wallet;
    registry.name = name.clone();
    registry.symbol = symbol.clone();
    registry.uri = uri.clone();
    registry.bump = ctx.bumps.registry;

    let signer_key = ctx.accounts.signer.key();
    let mut creators_vec: Vec<Creator> = match creator_splits {
        None => {
            // Backward compatible: solo creator gets the full CREATOR_SHARE.
            vec![Creator {
                address: signer_key,
                verified: false,
                share: CREATOR_SHARE,
            }]
        }
        Some(splits) => {
            require!(
                !splits.is_empty() && splits.len() <= 4,
                ErrorCode::InvalidCreatorSplits
            );
            let total: u32 = splits.iter().map(|s| s.share as u32).sum();
            require!(
                total == CREATOR_SHARE as u32,
                ErrorCode::InvalidCreatorSplits
            );
            // Signer MUST be in the creators list — sign_metadata below requires
            // the signer to be a creator (Metaplex enforces this).
            require!(
                splits.iter().any(|s| s.address == signer_key),
                ErrorCode::InvalidCreatorSplits
            );
            for (i, s) in splits.iter().enumerate() {
                require!(
                    s.address != Pubkey::default(),
                    ErrorCode::InvalidCreatorSplits
                );
                for s2 in splits.iter().skip(i + 1) {
                    require!(s.address != s2.address, ErrorCode::InvalidCreatorSplits);
                }
            }
            splits
                .iter()
                .map(|s| Creator {
                    address: s.address,
                    verified: false,
                    share: s.share,
                })
                .collect()
        }
    };

    // Platform royalty entry is always appended; creators cannot opt out.
    creators_vec.push(Creator {
        address: ctx.accounts.platform_config.platform_royalty_wallet,
        verified: false,
        share: PLATFORM_ROYALTY_SHARE,
    });
    let creators = Some(creators_vec);

    let data = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: ROYALTY_FEE_BPS,
        creators,
        collection: None,
        uses: None,
    };

    let mint_authority_bump = ctx.bumps.mint_authority;
    let mint_authority_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[mint_authority_bump]];
    let signer_seeds = &[mint_authority_seeds];

    let cpi_program = ctx.accounts.token_metadata_program.to_account_info();
    let cpi_accounts = CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        mint_authority: ctx.accounts.mint_authority.to_account_info(),
        update_authority: ctx.accounts.mint_authority.to_account_info(),
        payer: ctx.accounts.signer.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    // is_mutable = true so creators can edit name/symbol/uri post-mint via
    // change_metadata. Update authority is the mint_authority PDA — so only
    // the program (and only when the Registry creator signs change_metadata)
    // can mutate the on-chain Metaplex metadata.
    create_metadata_accounts_v3(cpi_ctx, data, true, true, None)?;

    let cpi_program = ctx.accounts.token_metadata_program.to_account_info();
    let cpi_accounts = SignMetadata {
        creator: ctx.accounts.signer.to_account_info(),
        metadata: ctx.accounts.metadata_account.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    sign_metadata(cpi_ctx)?;

    emit!(CommunityRegistered {
        by: ctx.accounts.signer.key(),
        id,
        mint: ctx.accounts.mint.key(),
        registry: registry.key(),
    });

    Ok(id)
}

#[derive(Accounts)]
pub struct RegisterCommunity<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
        constraint = platform_config.initialized @ ErrorCode::ProgramNotInitialized,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [COUNTER_SEED],
        bump = counter.bump,
    )]
    pub counter: Account<'info, GlobalCounter>,

    #[account(
        init,
        payer = signer,
        space = 8 + Registry::INIT_SPACE,
        seeds = [REGISTRY_SEED, &(counter.count + 1).to_le_bytes()],
        bump,
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        init,
        payer = signer,
        seeds = [MINT_SEED, &(counter.count + 1).to_le_bytes()],
        bump,
        mint::decimals = 0,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA used as mint authority for the program; verified by seeds.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump,
    )]
    pub mint_authority: AccountInfo<'info>,

    /// CHECK: validated by Metaplex CPI (Metaplex enforces canonical metadata PDA derivation).
    #[account(mut)]
    pub metadata_account: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
