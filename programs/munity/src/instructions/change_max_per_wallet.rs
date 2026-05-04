use anchor_lang::prelude::*;

use crate::constants::REGISTRY_SEED;
use crate::errors::ErrorCode;
use crate::events::CommunityMaxPerWalletChanged;
use crate::state::Registry;

pub(crate) fn handler(ctx: Context<ChangeMaxPerWallet>, new_cap: Option<u64>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let old = registry.max_per_wallet;
    registry.max_per_wallet = new_cap;

    emit!(CommunityMaxPerWalletChanged {
        registry: registry.key(),
        old_cap: old,
        new_cap,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ChangeMaxPerWallet<'info> {
    #[account(address = registry.creator @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [REGISTRY_SEED, &registry.id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
}
