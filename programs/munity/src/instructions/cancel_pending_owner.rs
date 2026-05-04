use anchor_lang::prelude::*;

use crate::constants::PLATFORM_SEED;
use crate::errors::ErrorCode;
use crate::events::OwnerProposalCancelled;
use crate::state::PlatformConfig;

pub(crate) fn handler(ctx: Context<CancelPendingOwner>) -> Result<()> {
    let cfg = &mut ctx.accounts.platform_config;
    require!(cfg.initialized, ErrorCode::ProgramNotInitialized);
    let prev = cfg.pending_owner.ok_or(ErrorCode::NoPendingOwner)?;
    cfg.pending_owner = None;

    emit!(OwnerProposalCancelled {
        current_owner: cfg.owner,
        cancelled_pending_owner: prev,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelPendingOwner<'info> {
    #[account(address = platform_config.owner @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}
