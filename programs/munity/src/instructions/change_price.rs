use anchor_lang::prelude::*;

use crate::constants::REGISTRY_SEED;
use crate::errors::ErrorCode;
use crate::events::CommunityPriceChanged;
use crate::state::Registry;

pub(crate) fn handler(ctx: Context<ChangePrice>, new_price: u64) -> Result<()> {
    require!(new_price > 0, ErrorCode::PriceCantBeZero);

    let registry = &mut ctx.accounts.registry;
    let old = registry.price_value;
    registry.price_value = new_price;

    emit!(CommunityPriceChanged {
        registry: registry.key(),
        old_price: old,
        new_price,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ChangePrice<'info> {
    #[account(address = registry.creator @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [REGISTRY_SEED, &registry.id.to_le_bytes()],
        bump = registry.bump,
    )]
    pub registry: Account<'info, Registry>,
}
