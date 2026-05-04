use anchor_lang::prelude::*;

use crate::constants::{BASE, REGISTRY_SEED};
use crate::errors::ErrorCode;
use crate::events::CommunityWhitelistRootChanged;
use crate::state::Registry;

pub(crate) fn handler(
    ctx: Context<SetWhitelistRoot>,
    new_root: [u8; 32],
    new_discount_bps: u16,
) -> Result<()> {
    require!(
        (new_discount_bps as u64) <= BASE,
        ErrorCode::InvalidWhitelistDiscount
    );

    let registry = &mut ctx.accounts.registry;
    let old = registry.whitelist_root;
    registry.whitelist_root = new_root;
    registry.whitelist_discount_bps = new_discount_bps;

    emit!(CommunityWhitelistRootChanged {
        registry: registry.key(),
        old_root: old,
        new_root,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetWhitelistRoot<'info> {
    #[account(address = registry.creator @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [REGISTRY_SEED, &registry.id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
}
