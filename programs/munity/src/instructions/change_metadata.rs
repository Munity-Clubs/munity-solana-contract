use anchor_lang::prelude::*;
use anchor_spl::metadata::{
    mpl_token_metadata::types::DataV2, update_metadata_accounts_v2, Metadata, MetadataAccount,
    UpdateMetadataAccountsV2,
};
use anchor_spl::token::Mint;

use crate::constants::{
    MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN, MINT_AUTHORITY_SEED, REGISTRY_SEED,
};
use crate::errors::ErrorCode;
use crate::events::CommunityMetadataChanged;
use crate::state::Registry;

pub(crate) fn handler(
    ctx: Context<ChangeMetadata>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    require!(name.len() <= MAX_NAME_LEN, ErrorCode::NameTooLong);
    require!(symbol.len() <= MAX_SYMBOL_LEN, ErrorCode::SymbolTooLong);
    require!(uri.len() <= MAX_URI_LEN, ErrorCode::UriTooLong);

    let registry = &mut ctx.accounts.registry;
    registry.name = name.clone();
    registry.symbol = symbol.clone();
    registry.uri = uri.clone();

    // Preserve creators + royalty bps from the existing on-chain Metaplex
    // metadata. Pulling creators from PlatformConfig.platform_royalty_wallet
    // would retroactively rotate already-minted communities when the platform
    // royalty wallet changes — locked decision, see
    // docs/SOLANA_V2_DEFERRED.md → set_platform_royalty_wallet semantics.
    let existing = &ctx.accounts.metadata_account;
    let data = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: existing.seller_fee_basis_points,
        creators: existing.creators.clone(),
        collection: existing.collection.clone(),
        uses: existing.uses.clone(),
    };

    let mint_authority_bump = ctx.bumps.mint_authority;
    let mint_authority_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[mint_authority_bump]];
    let signer_seeds = &[mint_authority_seeds];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_metadata_program.to_account_info(),
        UpdateMetadataAccountsV2 {
            metadata: ctx.accounts.metadata_account.to_account_info(),
            update_authority: ctx.accounts.mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    update_metadata_accounts_v2(cpi_ctx, None, Some(data), None, None)?;

    emit!(CommunityMetadataChanged {
        registry: registry.key(),
        by: ctx.accounts.signer.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ChangeMetadata<'info> {
    #[account(address = registry.creator @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &registry.id.to_le_bytes()],
        bump = registry.bump,
        constraint = registry.mint == mint.key() @ ErrorCode::InvalidMint,
    )]
    pub registry: Account<'info, Registry>,

    pub mint: Account<'info, Mint>,

    /// CHECK: PDA used as metadata update authority; verified by seeds.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump,
    )]
    pub mint_authority: AccountInfo<'info>,

    #[account(mut)]
    pub metadata_account: Account<'info, MetadataAccount>,

    pub token_metadata_program: Program<'info, Metadata>,
}
