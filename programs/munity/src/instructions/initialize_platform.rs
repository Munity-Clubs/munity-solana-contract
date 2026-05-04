use anchor_lang::prelude::*;

use crate::constants::{COUNTER_SEED, PLATFORM_SEED, PROGRAM_VERSION, BASE};
use crate::errors::ErrorCode;
use crate::events::PlatformInitialized;
use crate::state::{GlobalCounter, PlatformConfig};

pub(crate) fn handler(
    ctx: Context<InitializePlatform>,
    owner: Pubkey,
    platform_royalty_wallet: Pubkey,
    fee_bps: u16,
    pyth_sol_usd_feed_id: [u8; 32],
) -> Result<()> {
    require!(owner != Pubkey::default(), ErrorCode::InvalidNewOwner);
    require!(
        platform_royalty_wallet != Pubkey::default(),
        ErrorCode::InvalidPlatformRoyaltyWallet
    );
    require!((fee_bps as u64) <= BASE, ErrorCode::InvalidFee);

    let cfg = &mut ctx.accounts.platform_config;
    cfg.owner = owner;
    cfg.platform_royalty_wallet = platform_royalty_wallet;
    cfg.community_fee = fee_bps;
    cfg.program_version = PROGRAM_VERSION;
    cfg.pending_owner = None;
    cfg.pyth_sol_usd_feed_id = pyth_sol_usd_feed_id;
    cfg.bump = ctx.bumps.platform_config;
    cfg.initialized = true;

    let counter = &mut ctx.accounts.global_counter;
    counter.count = 0;
    counter.bump = ctx.bumps.global_counter;

    emit!(PlatformInitialized {
        owner,
        platform_royalty_wallet,
        fee_bps: fee_bps as u64,
        program_version: PROGRAM_VERSION,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        space = 8 + PlatformConfig::INIT_SPACE,
        seeds = [PLATFORM_SEED],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = signer,
        space = 8 + GlobalCounter::INIT_SPACE,
        seeds = [COUNTER_SEED],
        bump,
    )]
    pub global_counter: Account<'info, GlobalCounter>,
    pub system_program: Program<'info, System>,
}
