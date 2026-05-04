use anchor_lang::prelude::*;

use crate::constants::{MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN, REGISTRY_SEED};
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
    registry.name = name;
    registry.symbol = symbol;
    registry.uri = uri;

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
    )]
    pub registry: Account<'info, Registry>,
}
