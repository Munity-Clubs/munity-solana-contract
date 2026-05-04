use anchor_lang::prelude::*;

use crate::constants::{BASE, PLATFORM_SEED};
use crate::errors::ErrorCode;
use crate::events::FeeChanged;
use crate::state::PlatformConfig;

pub(crate) fn handler(ctx: Context<ChangeCommunityFee>, new_fee_bps: u16) -> Result<()> {
    require!((new_fee_bps as u64) <= BASE, ErrorCode::InvalidFee);
    let cfg = &mut ctx.accounts.platform_config;
    require!(cfg.initialized, ErrorCode::ProgramNotInitialized);

    let old = cfg.community_fee;
    cfg.community_fee = new_fee_bps;

    emit!(FeeChanged {
        old_fee: old as u64,
        new_fee: new_fee_bps as u64,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ChangeCommunityFee<'info> {
    #[account(address = platform_config.owner @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}
