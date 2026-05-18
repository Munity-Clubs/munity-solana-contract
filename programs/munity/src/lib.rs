#![allow(unexpected_cfgs, deprecated)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;

declare_id!("4PeTcJYm5rPj4AU3Lq72nhpbyUxny2vJDTW6XUdpDDpk");

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Munity v2",
    project_url: "https://munity.club",
    contacts: "email:security@munity.club,link:https://twitter.com/munityclub",
    policy: "https://github.com/kidofthenorth/Munity-Smart-Contracts/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/kidofthenorth/Munity-Smart-Contracts",
    source_release: "v2.0.1",
    auditors: "None",
    acknowledgements: "The following researchers have responsibly disclosed vulnerabilities: (none yet)"
}

#[program]
pub mod munity {
    use super::*;

    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        owner: Pubkey,
        platform_royalty_wallet: Pubkey,
        fee_bps: u16,
        pyth_sol_usd_feed_id: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_platform::handler(
            ctx,
            owner,
            platform_royalty_wallet,
            fee_bps,
            pyth_sol_usd_feed_id,
        )
    }

    pub fn change_community_fee(
        ctx: Context<ChangeCommunityFee>,
        new_fee_bps: u16,
    ) -> Result<()> {
        instructions::change_community_fee::handler(ctx, new_fee_bps)
    }

    pub fn propose_owner(ctx: Context<ProposeOwner>, new_owner: Pubkey) -> Result<()> {
        instructions::propose_owner::handler(ctx, new_owner)
    }

    pub fn accept_owner(ctx: Context<AcceptOwner>) -> Result<()> {
        instructions::accept_owner::handler(ctx)
    }

    pub fn cancel_pending_owner(ctx: Context<CancelPendingOwner>) -> Result<()> {
        instructions::cancel_pending_owner::handler(ctx)
    }

    pub fn set_platform_royalty_wallet(
        ctx: Context<SetPlatformRoyaltyWallet>,
        new_wallet: Pubkey,
    ) -> Result<()> {
        instructions::set_platform_royalty_wallet::handler(ctx, new_wallet)
    }

    pub fn register_community(
        ctx: Context<RegisterCommunity>,
        args: RegisterCommunityArgs,
    ) -> Result<u64> {
        instructions::register_community::handler(ctx, args)
    }

    pub fn change_metadata(
        ctx: Context<ChangeMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::change_metadata::handler(ctx, name, symbol, uri)
    }

    pub fn change_price(ctx: Context<ChangePrice>, new_price: u64) -> Result<()> {
        instructions::change_price::handler(ctx, new_price)
    }

    pub fn change_discount(ctx: Context<ChangeDiscount>, new_discount: u16) -> Result<()> {
        instructions::change_discount::handler(ctx, new_discount)
    }

    pub fn add_supply(ctx: Context<AddSupply>, amount: u64) -> Result<()> {
        instructions::add_supply::handler(ctx, amount)
    }

    pub fn change_max_per_wallet(
        ctx: Context<ChangeMaxPerWallet>,
        new_cap: Option<u64>,
    ) -> Result<()> {
        instructions::change_max_per_wallet::handler(ctx, new_cap)
    }

    pub fn set_whitelist_root(
        ctx: Context<SetWhitelistRoot>,
        new_root: [u8; 32],
        new_discount_bps: u16,
    ) -> Result<()> {
        instructions::set_whitelist_root::handler(ctx, new_root, new_discount_bps)
    }

    pub fn buy_nft(
        ctx: Context<BuyNft>,
        id: u64,
        amount: u64,
        merkle_proof: Option<Vec<[u8; 32]>>,
    ) -> Result<()> {
        instructions::buy_nft::handler(ctx, id, amount, merkle_proof)
    }
}
