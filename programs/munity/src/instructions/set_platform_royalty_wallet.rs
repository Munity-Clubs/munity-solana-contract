use anchor_lang::prelude::*;

use crate::constants::PLATFORM_SEED;
use crate::errors::ErrorCode;
use crate::events::PlatformRoyaltyWalletChanged;
use crate::state::PlatformConfig;

pub(crate) fn handler(ctx: Context<SetPlatformRoyaltyWallet>, new_wallet: Pubkey) -> Result<()> {
    require!(
        new_wallet != Pubkey::default(),
        ErrorCode::InvalidPlatformRoyaltyWallet
    );
    let cfg = &mut ctx.accounts.platform_config;
    require!(cfg.initialized, ErrorCode::ProgramNotInitialized);

    let old = cfg.platform_royalty_wallet;
    cfg.platform_royalty_wallet = new_wallet;

    emit!(PlatformRoyaltyWalletChanged {
        old_wallet: old,
        new_wallet,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetPlatformRoyaltyWallet<'info> {
    #[account(address = platform_config.owner @ ErrorCode::Unauthorized)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}
