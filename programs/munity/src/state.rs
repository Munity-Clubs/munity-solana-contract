use anchor_lang::prelude::*;

use crate::constants::{MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PriceMode {
    FixedLamports,
    UsdPegged,
}

/// One creator entry passed to `register_community` when splitting the creator
/// royalty share across multiple collaborators (music drops, art collabs, etc.).
/// Not stored on-chain — only used as an input arg; persisted-to-Metaplex via
/// the DataV2 creators array.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub struct CreatorSplit {
    pub address: Pubkey,
    pub share: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub owner: Pubkey,
    pub platform_royalty_wallet: Pubkey,
    pub community_fee: u16,
    pub program_version: u8,
    pub pending_owner: Option<Pubkey>,
    pub pyth_sol_usd_feed_id: [u8; 32],
    pub bump: u8,
    pub initialized: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Registry {
    pub id: u64,
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub remaining_supply: u64,
    pub price_mode: PriceMode,
    pub price_value: u64,
    pub pyth_feed_id: [u8; 32],
    pub discount: u16,
    pub whitelist_root: [u8; 32],
    pub whitelist_discount_bps: u16,
    pub max_per_wallet: Option<u64>,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,
    #[max_len(MAX_URI_LEN)]
    pub uri: String,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MintState {
    pub buyer: Pubkey,
    pub registry: Pubkey,
    pub mints: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalCounter {
    pub count: u64,
    pub bump: u8,
}
