use anchor_lang::prelude::*;

use crate::constants::REGISTRY_SEED;
use crate::errors::ErrorCode;
use crate::events::CommunitySupplyAdded;
use crate::state::Registry;

pub(crate) fn handler(ctx: Context<AddSupply>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::AmountCantBeZero);

    let registry = &mut ctx.accounts.registry;
    let new_remaining = registry
        .remaining_supply
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    registry.remaining_supply = new_remaining;

    emit!(CommunitySupplyAdded {
        registry: registry.key(),
        added: amount,
        new_remaining,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AddSupply<'info> {
    #[account(address = registry.creator @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [REGISTRY_SEED, &registry.id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
}
