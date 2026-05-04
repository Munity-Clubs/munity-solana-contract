use anchor_lang::prelude::*;

use crate::constants::PLATFORM_SEED;
use crate::errors::ErrorCode;
use crate::events::OwnerProposed;
use crate::state::PlatformConfig;

pub(crate) fn handler(ctx: Context<ProposeOwner>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), ErrorCode::InvalidNewOwner);
    let cfg = &mut ctx.accounts.platform_config;
    require!(cfg.initialized, ErrorCode::ProgramNotInitialized);

    cfg.pending_owner = Some(new_owner);

    emit!(OwnerProposed {
        current_owner: cfg.owner,
        pending_owner: new_owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ProposeOwner<'info> {
    #[account(address = platform_config.owner @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}
