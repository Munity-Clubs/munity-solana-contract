use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Platform is not initialized")]
    ProgramNotInitialized,
    #[msg("Platform is already initialized")]
    AlreadyInitialized,
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("Fee must be <= BASE (1000)")]
    InvalidFee,
    #[msg("Discount must be <= BASE (1000)")]
    InvalidDiscount,
    #[msg("Whitelist discount must be <= BASE (1000)")]
    InvalidWhitelistDiscount,
    #[msg("Price must be > 0")]
    PriceCantBeZero,
    #[msg("Supply must be > 0")]
    SupplyCantBeZero,
    #[msg("Amount must be > 0")]
    AmountCantBeZero,
    #[msg("Mint amount exceeds remaining supply")]
    InsufficientSupply,
    #[msg("Per-wallet mint cap exceeded")]
    MintCapExceeded,
    #[msg("Name string exceeds MAX_NAME_LEN")]
    NameTooLong,
    #[msg("Symbol string exceeds MAX_SYMBOL_LEN")]
    SymbolTooLong,
    #[msg("URI string exceeds MAX_URI_LEN")]
    UriTooLong,
    #[msg("Provided account does not match Registry.creator")]
    InvalidCreatorAccount,
    #[msg("Provided account does not match PlatformConfig.owner")]
    InvalidPlatformOwnerAccount,
    #[msg("Provided account does not match PlatformConfig.platform_royalty_wallet")]
    InvalidPlatformRoyaltyWallet,
    #[msg("Provided mint does not match Registry.mint")]
    InvalidMint,
    #[msg("Whitelist root is empty; no merkle proof should be provided")]
    UnexpectedMerkleProof,
    #[msg("Merkle proof verification failed")]
    InvalidMerkleProof,
    #[msg("Pending owner mismatch")]
    OwnerProposalMismatch,
    #[msg("No pending owner to accept")]
    NoPendingOwner,
    #[msg("New owner cannot be default Pubkey")]
    InvalidNewOwner,
    #[msg("Pyth oracle data is stale")]
    OraclePriceStale,
    #[msg("Pyth oracle confidence interval is too wide")]
    OraclePriceUnreliable,
    #[msg("Pyth oracle returned a non-positive price")]
    OraclePriceInvalid,
    #[msg("Pyth feed id mismatch")]
    InvalidPythFeed,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid price mode for the requested operation")]
    InvalidPriceMode,
    #[msg("Creator splits must be 1..=4 entries summing to CREATOR_SHARE (80) with the signer included; no duplicates or default pubkeys")]
    InvalidCreatorSplits,
}
