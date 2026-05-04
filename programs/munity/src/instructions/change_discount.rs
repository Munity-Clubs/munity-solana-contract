use anchor_lang::prelude::*;

use crate::constants::{BASE, REGISTRY_SEED};
use crate::errors::ErrorCode;
use crate::events::CommunityDiscountChanged;
use crate::state::Registry;

pub(crate) fn handler(ctx: Context<ChangeDiscount>, new_discount: u16) -> Result<()> {
    require!((new_discount as u64) <= BASE, ErrorCode::InvalidDiscount);

    let registry = &mut ctx.accounts.registry;
    let old = registry.discount;
    registry.discount = new_discount;

    emit!(CommunityDiscountChanged {
        registry: registry.key(),
        old_discount: old as u64,
        new_discount: new_discount as u64,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ChangeDiscount<'info> {
    #[account(address = registry.creator @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [REGISTRY_SEED, &registry.id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
}
