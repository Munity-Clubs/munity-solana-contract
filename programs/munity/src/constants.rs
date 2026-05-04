use anchor_lang::prelude::*;

pub const PROGRAM_VERSION: u8 = 2;

pub const BASE: u64 = 1000;

pub const ROYALTY_FEE_BPS: u16 = 450;

pub const PLATFORM_SEED: &[u8] = b"platform";
pub const REGISTRY_SEED: &[u8] = b"registry";
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
pub const MINT_SEED: &[u8] = b"mint";
pub const COUNTER_SEED: &[u8] = b"global_counter";
pub const MINT_STATE_SEED: &[u8] = b"mint_state";
pub const METADATA_PREFIX: &str = "metadata";

pub const MAX_NAME_LEN: usize = 64;
pub const MAX_SYMBOL_LEN: usize = 16;
pub const MAX_URI_LEN: usize = 200;

pub const MERKLE_LEAF_PREFIX: u8 = 0x00;
pub const MERKLE_NODE_PREFIX: u8 = 0x01;

pub const MAX_PYTH_STALENESS_SECS: u64 = 60;
pub const MAX_PYTH_CONF_BPS: u64 = 50;

pub const CREATOR_SHARE: u8 = 80;
pub const PLATFORM_ROYALTY_SHARE: u8 = 20;

#[constant]
pub const EMPTY_MERKLE_ROOT: [u8; 32] = [0u8; 32];
