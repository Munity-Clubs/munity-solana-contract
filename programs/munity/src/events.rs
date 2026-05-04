use anchor_lang::prelude::*;

#[event]
pub struct PlatformInitialized {
    pub owner: Pubkey,
    pub platform_royalty_wallet: Pubkey,
    pub fee_bps: u64,
    pub program_version: u8,
}

#[event]
pub struct FeeChanged {
    pub old_fee: u64,
    pub new_fee: u64,
}

#[event]
pub struct OwnerProposed {
    pub current_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct OwnerProposalCancelled {
    pub current_owner: Pubkey,
    pub cancelled_pending_owner: Pubkey,
}

#[event]
pub struct OwnerAccepted {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct PlatformRoyaltyWalletChanged {
    pub old_wallet: Pubkey,
    pub new_wallet: Pubkey,
}

#[event]
pub struct CommunityRegistered {
    pub by: Pubkey,
    pub id: u64,
    pub mint: Pubkey,
    pub registry: Pubkey,
}

#[event]
pub struct CommunityMetadataChanged {
    pub registry: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct CommunityPriceChanged {
    pub registry: Pubkey,
    pub old_price: u64,
    pub new_price: u64,
}

#[event]
pub struct CommunityDiscountChanged {
    pub registry: Pubkey,
    pub old_discount: u64,
    pub new_discount: u64,
}

#[event]
pub struct CommunitySupplyAdded {
    pub registry: Pubkey,
    pub added: u64,
    pub new_remaining: u64,
}

#[event]
pub struct CommunityWhitelistRootChanged {
    pub registry: Pubkey,
    pub old_root: [u8; 32],
    pub new_root: [u8; 32],
}

#[event]
pub struct CommunityMaxPerWalletChanged {
    pub registry: Pubkey,
    pub old_cap: Option<u64>,
    pub new_cap: Option<u64>,
}

#[event]
pub struct NftPurchased {
    pub buyer: Pubkey,
    pub registry: Pubkey,
    pub amount: u64,
    pub paid_lamports: u64,
    pub creator_share: u64,
    pub platform_share: u64,
    pub whitelisted: bool,
}
