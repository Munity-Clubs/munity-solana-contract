use anchor_lang::prelude::*;

use crate::constants::PLATFORM_SEED;
use crate::errors::ErrorCode;
use crate::events::OwnerAccepted;
use crate::state::PlatformConfig;

pub(crate) fn handler(ctx: Context<AcceptOwner>) -> Result<()> {
    let cfg = &mut ctx.accounts.platform_config;
    require!(cfg.initialized, ErrorCode::ProgramNotInitialized);
    let pending = cfg.pending_owner.ok_or(ErrorCode::NoPendingOwner)?;
    require_keys_eq!(
        ctx.accounts.signer.key(),
        pending,
        ErrorCode::OwnerProposalMismatch
    );
    let old = cfg.owner;
    cfg.owner = pending;
    cfg.pending_owner = None;

    emit!(OwnerAccepted {
        old_owner: old,
        new_owner: pending,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptOwner<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}
