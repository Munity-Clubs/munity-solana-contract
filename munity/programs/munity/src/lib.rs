use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3, update_metadata_accounts_v2, CreateMetadataAccountsV3,
        Metadata, UpdateMetadataAccountsV2,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::instructions::VerifyBuilder;
use mpl_token_metadata::types::{Creator, DataV2, VerificationArgs};

declare_id!("34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa");

pub const PREFIX: &str = "metadata";
pub const PLATFORM_SEED: &[u8] = b"platform";
pub const REGISTRY_SEED: &[u8] = b"registry";
pub const WHITELIST_SEED: &[u8] = b"whitelist";
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
pub const COUNTER_SEED: &[u8] = b"global_counter";
pub const MINT_SEED: &[u8] = b"mint";

/// Used for percent-based calculations, like discount. 1000 = 100%
pub const BASE: u64 = 1000;

/// A constant representing a predefined royalty fee for each community (basis points).
pub const ROYALTYFEE: u16 = 45; // 4.5%

/// Max number of NFTs a user can HOLD/MINT per community (checked against ATA balance)
pub const LIMIT: u64 = 50;

fn find_metadata_account(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PREFIX.as_bytes(),
            mpl_token_metadata::ID.as_ref(),
            mint.as_ref(),
        ],
        &mpl_token_metadata::ID,
    )
}

#[program]
pub mod munity {
    use super::*;

    // ===================== Platform (owner + fee) =====================

    /// Initializes platform config PDA with owner and default fee (45 => 4.5%).
    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        let cfg = &mut ctx.accounts.platform_config;
        cfg.owner = ctx.accounts.signer.key();
        cfg.community_fee = 45;
        cfg.initialized = true;
        cfg.bump = ctx.bumps.platform_config;
        Ok(())
    }

    /// onlyOwner: change the platform community fee (0..=BASE).
    pub fn change_community_fee(ctx: Context<ModifyPlatform>, new_fees: u64) -> Result<()> {
        let cfg = &mut ctx.accounts.platform_config;
        require!(cfg.initialized, ErrorCode::ProgramNotInitialized);
        require_keys_eq!(
            ctx.accounts.signer.key(),
            cfg.owner,
            ErrorCode::Unauthorized
        );
        require!(new_fees <= BASE, ErrorCode::InvalidFee);

        let old = cfg.community_fee;
        cfg.community_fee = new_fees;

        emit!(FeeChanged {
            old_fee: old,
            new_fee: new_fees
        });
        Ok(())
    }

    /// onlyOwner: transfer platform ownership.
    pub fn change_owner(ctx: Context<ModifyPlatform>, new_owner: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.platform_config;
        require!(cfg.initialized, ErrorCode::ProgramNotInitialized);
        require_keys_eq!(
            ctx.accounts.signer.key(),
            cfg.owner,
            ErrorCode::Unauthorized
        );

        let old = cfg.owner;
        cfg.owner = new_owner;

        emit!(OwnerChanged {
            old_owner: old,
            new_owner
        });
        Ok(())
    }

    // ===================== Communities =====================

    pub fn register_community(
        ctx: Context<RegisterCommunity>,
        name: String,
        symbol: String,
        uri: String,
        supply: u64,
        price: u64,
        discount: u64,
    ) -> Result<u64> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        // ✅ Input validations
        require!(price > 0, ErrorCode::PriceCantBeZero);
        require!(supply > 0, ErrorCode::SupplyCantBeZero);
        require!(discount <= BASE, ErrorCode::InvalidDiscount);

        // ---------- increment global id ----------
        let counter = &mut ctx.accounts.counter;
        counter.count += 1;
        let id = counter.count;

        // ---------- write registry ----------
        let registry = &mut ctx.accounts.registry;
        registry.id = id;
        registry.mint = ctx.accounts.mint.key();
        registry.bump = ctx.bumps.registry;
        registry.remaining_supply = supply;
        registry.creator = ctx.accounts.signer.key();
        registry.price = price;
        registry.uri = uri.clone();
        registry.discount = discount;
        registry.name = name.clone();
        registry.symbol = symbol.clone();

        // ---------- metadata with royalties ----------
        // Create with verified = false (avoid 0x36). We verify right after.
        let creators = Some(vec![Creator {
            address: ctx.accounts.signer.key(),
            verified: false,
            share: 100,
        }]);

        let data = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: ROYALTYFEE,
            creators,
            collection: None,
            uses: None,
        };

        // PDA signer for metadata (mint/update authorities)
        let mint_bump = ctx.bumps.mint_authority;
        let signer_seeds = &[MINT_AUTHORITY_SEED, &[mint_bump]];
        let signer = &[&signer_seeds[..]];

        let mut metadata_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.mint_authority.to_account_info(), // PDA
                update_authority: ctx.accounts.mint_authority.to_account_info(), // PDA
                payer: ctx.accounts.signer.to_account_info(),                  // creator pays
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer,
        );

        // Optional remaining account (creator). Not required for creation since verified=false.
        metadata_ctx =
            metadata_ctx.with_remaining_accounts(vec![ctx.accounts.signer.to_account_info()]);

        create_metadata_accounts_v3(metadata_ctx, data, true, true, None)?;

        // ---------- verify creator (so royalties are honored by marketplaces) ----------
        // Build the Verify instruction and invoke it. Creator (signer) must sign.
        let ix = VerifyBuilder::new()
            .metadata(ctx.accounts.metadata_account.key())
            .authority(ctx.accounts.signer.key()) // the creator
            .verification_args(VerificationArgs::CreatorV1)
            .instruction();

        // Include the Instructions sysvar required by mpl-token-metadata Verify
        invoke(
            &ix,
            &[
                ctx.accounts.metadata_account.to_account_info(),
                ctx.accounts.signer.to_account_info(), // signer
                ctx.accounts.sysvar_instructions.to_account_info(), // required
            ],
        )?;

        emit!(CommunityRegistered {
            by: ctx.accounts.signer.key(),
            id,
        });

        Ok(id)
    }

    pub fn buy_nft(ctx: Context<BuyNFT>, id: u64, amount: u64) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );
        require!(amount > 0, ErrorCode::SupplyCantBeZero);

        let registry = &mut ctx.accounts.registry;

        require!(
            registry.mint != Pubkey::default(),
            ErrorCode::MintNotRegistered
        );
        require_keys_eq!(
            ctx.accounts.mint.key(),
            registry.mint,
            ErrorCode::InvalidMintForId
        );
        require!(
            registry.remaining_supply >= amount,
            ErrorCode::InsufficientSupply
        );

        // --- enforce per-user holding/mint limit (decimals=0) ---
        let current_balance: u64 = ctx.accounts.user_token_account.amount;
        let after_mint = current_balance
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
        require!(after_mint <= LIMIT, ErrorCode::LimitExceeded);

        // --- pricing / discount rules ---
        // Creator mints FREE.
        let buyer_pk = ctx.accounts.buyer.key();
        let mut unit_price = if buyer_pk == registry.creator {
            0
        } else {
            registry.price
        };

        // If not creator, apply whitelist discount when a valid whitelist PDA is supplied.
        if buyer_pk != registry.creator {
            if let Some(ai) = &ctx.accounts.whitelist_entry {
                // expected PDA = [WHITELIST_SEED, id_le, buyer]
                let expected = Pubkey::find_program_address(
                    &[WHITELIST_SEED, &id.to_le_bytes(), buyer_pk.as_ref()],
                    ctx.program_id,
                )
                .0;
                if ai.key() == expected && !ai.data_is_empty() {
                    // discount = % off; if discount == BASE => free
                    if registry.discount >= BASE {
                        unit_price = 0;
                    } else {
                        let discount_amt = unit_price
                            .checked_mul(registry.discount)
                            .ok_or(ErrorCode::Overflow)?
                            / BASE;
                        unit_price = unit_price.saturating_sub(discount_amt);
                    }
                }
            }
        }

        let total = unit_price.checked_mul(amount).ok_or(ErrorCode::Overflow)?;

        // --- split funds: fee to platform owner, remainder to creator ---
        // (On Solana there is no msg.value/overpay; we just pull exactly what we need.)
        if total > 0 {
            let fee = total
                .checked_mul(ctx.accounts.platform_config.community_fee)
                .ok_or(ErrorCode::Overflow)?
                / BASE;
            let to_creator = total.checked_sub(fee).ok_or(ErrorCode::Overflow)?;

            // Transfer from buyer -> creator
            transfer_lamports(
                &ctx.accounts.buyer,
                &ctx.accounts.creator_account,
                &ctx.accounts.system_program,
                to_creator,
            )?;

            // Transfer from buyer -> platform owner
            transfer_lamports(
                &ctx.accounts.buyer,
                &ctx.accounts.platform_owner_account,
                &ctx.accounts.system_program,
                fee,
            )?;
        }

        // --- proceed with mint ---
        registry.remaining_supply = registry
            .remaining_supply
            .checked_sub(amount)
            .ok_or(ErrorCode::Overflow)?;

        let bump = ctx.bumps.mint_authority;
        let signer_seeds = &[MINT_AUTHORITY_SEED, &[bump]];
        let signer = &[&signer_seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        );

        mint_to(cpi_ctx, amount)?;

        emit!(ItemBought {
            id,
            by: buyer_pk,
            amount
        });

        Ok(())
    }

    /// Change **name, symbol, uri** in the Registry **and** on-chain Metadata.
    /// Keeps creator VERIFIED by passing the creator as a signer and setting verified=true.
    pub fn change_metadata(
        ctx: Context<ChangeMetadata>,
        id: u64,
        new_name: String,
        new_symbol: String,
        new_uri: String,
    ) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        let registry = &mut ctx.accounts.registry;

        // Only creator can update
        require_keys_eq!(
            ctx.accounts.signer.key(),
            registry.creator,
            ErrorCode::Unauthorized
        );

        // Update local storage
        registry.name = new_name.clone();
        registry.symbol = new_symbol.clone();
        registry.uri = new_uri.clone();

        // Build DataV2 and keep creator verified=true.
        let creators = Some(vec![Creator {
            address: registry.creator,
            verified: true, // stays verified
            share: 100,
        }]);

        let new_data = DataV2 {
            name: new_name.clone(),
            symbol: new_symbol.clone(),
            uri: new_uri.clone(),
            seller_fee_basis_points: ROYALTYFEE,
            creators,
            collection: None,
            uses: None,
        };

        // Update metadata via PDA update authority + include creator as remaining signer
        let bump = ctx.bumps.mint_authority;
        let signer_seeds = &[MINT_AUTHORITY_SEED, &[bump]];
        let signer = &[&signer_seeds[..]];

        let mut cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            UpdateMetadataAccountsV2 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                update_authority: ctx.accounts.mint_authority.to_account_info(), // PDA signs
            },
            signer,
        );

        // Pass creator as signer so verified:true is accepted during update
        cpi_ctx = cpi_ctx.with_remaining_accounts(vec![ctx.accounts.signer.to_account_info()]);

        // (ctx, new_update_authority, data, primary_sale_happened, is_mutable)
        update_metadata_accounts_v2(
            cpi_ctx,
            None,           // keep update authority = PDA
            Some(new_data), // set new name/symbol/uri (+ creators verified)
            None,           // primary_sale_happened unchanged
            None,           // is_mutable unchanged
        )?;

        emit!(MetadataChanged {
            id,
            new_name,
            new_symbol,
            new_uri
        });

        Ok(())
    }

    pub fn change_price(ctx: Context<UpdateCommunity>, id: u64, new_price: u64) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        let registry = &mut ctx.accounts.registry;

        require_keys_eq!(
            ctx.accounts.signer.key(),
            registry.creator,
            ErrorCode::Unauthorized
        );
        require!(new_price > 0, ErrorCode::PriceCantBeZero);

        let old_price = registry.price;
        registry.price = new_price;

        emit!(PriceChanged {
            id,
            old_price,
            new_price
        });

        Ok(())
    }

    pub fn add_supply(
        ctx: Context<UpdateCommunity>,
        id: u64,
        additional_supply: u64,
    ) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        let registry = &mut ctx.accounts.registry;

        require_keys_eq!(
            ctx.accounts.signer.key(),
            registry.creator,
            ErrorCode::Unauthorized
        );
        require!(additional_supply > 0, ErrorCode::SupplyCantBeZero);

        registry.remaining_supply = registry
            .remaining_supply
            .checked_add(additional_supply)
            .ok_or(ErrorCode::Overflow)?;

        emit!(SupplyIncreased {
            id,
            added: additional_supply,
            new_total: registry.remaining_supply
        });

        Ok(())
    }

    pub fn change_discount(
        ctx: Context<UpdateCommunity>,
        id: u64,
        new_discount: u64,
    ) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        let registry = &mut ctx.accounts.registry;

        require_keys_eq!(
            ctx.accounts.signer.key(),
            registry.creator,
            ErrorCode::Unauthorized
        );
        require!(new_discount <= BASE, ErrorCode::InvalidDiscount);

        let old_discount = registry.discount;
        registry.discount = new_discount;

        emit!(DiscountChanged {
            id,
            old_discount,
            new_discount
        });

        Ok(())
    }

    // ===================== Whitelist =====================

    /// Creator-only: add a single user to the community's whitelist.
    pub fn add_to_whitelist(ctx: Context<ModifyWhitelist>, id: u64, user: Pubkey) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        // Only the community creator can whitelist
        require_keys_eq!(
            ctx.accounts.signer.key(),
            ctx.accounts.registry.creator,
            ErrorCode::Unauthorized
        );

        let wl = &mut ctx.accounts.whitelist_entry;
        wl.registry = ctx.accounts.registry.key();
        wl.user = user;
        wl.bump = ctx.bumps.whitelist_entry;

        emit!(Whitelisted { id, user });
        Ok(())
    }

    /// Creator-only: remove a user from the community's whitelist (closes PDA).
    pub fn remove_from_whitelist(
        ctx: Context<RemoveWhitelist>,
        id: u64,
        _user: Pubkey,
    ) -> Result<()> {
        // Block if platform not initialized
        require!(
            ctx.accounts.platform_config.initialized,
            ErrorCode::ProgramNotInitialized
        );

        // Only creator can remove
        require_keys_eq!(
            ctx.accounts.signer.key(),
            ctx.accounts.registry.creator,
            ErrorCode::Unauthorized
        );

        emit!(Unwhitelisted {
            id,
            user: ctx.accounts.whitelist_entry.user
        });
        Ok(())
    }
}

// ================ helpers ================

fn transfer_lamports<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program_acc: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    // Use Anchor's CPI helper to avoid lifetime issues.
    let cpi_accounts = Transfer {
        from: from.clone(),
        to: to.clone(),
    };
    let cpi_ctx = CpiContext::new(system_program_acc.to_account_info(), cpi_accounts);
    system_program::transfer(cpi_ctx, amount)
}

// ===================== Accounts =====================

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    /// CHECK: initializer; safe by signer
    #[account(mut, signer)]
    pub signer: AccountInfo<'info>,

    #[account(
        init,
        payer = signer,
        seeds = [PLATFORM_SEED],
        bump,
        space = 8 + 32 + 8 + 1 + 1 // disc + owner + fee + bump + initialized(bool)
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyPlatform<'info> {
    /// CHECK: must be current owner; enforced in handler
    #[account(signer)]
    pub signer: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}

#[derive(Accounts)]
pub struct RegisterCommunity<'info> {
    /// CHECK: community creator & payer; safe by signer + usage as payer/pubkey
    #[account(mut, signer)]
    pub signer: AccountInfo<'info>,

    // Platform must exist; handler checks `initialized`
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        init_if_needed,
        seeds = [COUNTER_SEED],
        bump,
        payer = signer,
        space = 8 + 8
    )]
    pub counter: Account<'info, GlobalCounter>,

    #[account(
        init,
        seeds = [REGISTRY_SEED, (counter.count + 1).to_le_bytes().as_ref()],
        bump,
        payer = signer,
        // mint + id + bump + remaining_supply + price + creator
        // + (uri String: 4 + 200) + discount + (name: 4 + 64) + (symbol: 4 + 16)
        space = 8 + 32 + 8 + 1 + 8 + 8 + 32 + (4 + 200) + 8 + (4 + 64) + (4 + 16)
    )]
    pub registry: Account<'info, Registry>,

    #[account(
    init,
    seeds = [MINT_SEED, (counter.count + 1).to_le_bytes().as_ref()],
    bump,
    payer = signer,
    mint::decimals = 0,
    mint::authority = mint_authority,
    mint::freeze_authority = mint_authority
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA derived via seeds; used only as authority signer via seeds.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: AccountInfo<'info>,

    /// CHECK: PDA computed from mint; address constraint guarantees correctness.
    #[account(mut, address = find_metadata_account(&mint.key()).0)]
    pub metadata_account: AccountInfo<'info>,

    /// CHECK: Required by mpl-token-metadata Verify instruction
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct BuyNFT<'info> {
    /// CHECK: source of SOL and mint recipient; must sign for SOL transfers & ATA creation
    #[account(mut, signer)]
    pub buyer: AccountInfo<'info>,

    // Platform must exist; handler checks `initialized`
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &id.to_le_bytes()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    #[account(mut, address = registry.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA derived via seeds; used only as authority signer via seeds.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: AccountInfo<'info>,

    /// CHECK: (optional) whitelist PDA; if present & valid, discount applies
    pub whitelist_entry: Option<AccountInfo<'info>>,

    /// CHECK: creator's system account to receive SOL (must match registry.creator)
    #[account(mut, address = registry.creator)]
    pub creator_account: AccountInfo<'info>,

    /// CHECK: platform owner system account to receive fee (must match platform_config.owner)
    #[account(mut, address = platform_config.owner)]
    pub platform_owner_account: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct ChangeMetadata<'info> {
    /// CHECK: must match `registry.creator`; enforced in handler
    #[account(signer)]
    pub signer: AccountInfo<'info>,

    // Platform must exist; handler checks `initialized`
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &id.to_le_bytes()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    /// CHECK: metadata PDA derived from the mint
    #[account(mut, address = find_metadata_account(&registry.mint).0)]
    pub metadata_account: AccountInfo<'info>,

    #[account(address = registry.mint)]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA update authority; signs via seeds only
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: AccountInfo<'info>,

    pub token_metadata_program: Program<'info, Metadata>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct UpdateCommunity<'info> {
    /// CHECK: must match `registry.creator`; enforced by handler
    #[account(signer)]
    pub signer: AccountInfo<'info>,

    // Platform must exist; handler checks `initialized`
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &id.to_le_bytes()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,
}

// ---- Whitelist accounts ----

#[derive(Accounts)]
#[instruction(id: u64, user: Pubkey)]
pub struct ModifyWhitelist<'info> {
    /// CHECK: creator of the community; enforced in handler
    #[account(mut, signer)]
    pub signer: AccountInfo<'info>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &id.to_le_bytes()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        init_if_needed,
        payer = signer,
        seeds = [WHITELIST_SEED, &id.to_le_bytes(), user.as_ref()],
        bump,
        space = 8 + 32 + 32 + 1 // disc + registry + user + bump
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u64, user: Pubkey)]
pub struct RemoveWhitelist<'info> {
    /// CHECK: creator of the community; enforced in handler
    #[account(mut, signer)]
    pub signer: AccountInfo<'info>,

    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform_config.bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [REGISTRY_SEED, &id.to_le_bytes()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        seeds = [WHITELIST_SEED, &id.to_le_bytes(), user.as_ref()],
        bump = whitelist_entry.bump,
        close = signer
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

// ===================== State =====================

#[account]
pub struct PlatformConfig {
    pub owner: Pubkey,
    pub community_fee: u64, // scaled by BASE (e.g., 36 => 3.6%)
    pub bump: u8,
    pub initialized: bool,
}

#[account]
pub struct Registry {
    pub mint: Pubkey,
    pub id: u64,
    pub bump: u8,
    pub remaining_supply: u64,
    pub price: u64,
    pub creator: Pubkey,
    pub uri: String,
    pub discount: u64,
    pub name: String,
    pub symbol: String,
}

#[account]
pub struct GlobalCounter {
    pub count: u64,
}

#[account]
pub struct WhitelistEntry {
    pub registry: Pubkey,
    pub user: Pubkey,
    pub bump: u8,
}

// ===================== Events =====================

#[event]
pub struct CommunityRegistered {
    pub by: Pubkey,
    pub id: u64,
}

#[event]
pub struct ItemBought {
    pub id: u64,
    pub by: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MetadataChanged {
    pub id: u64,
    pub new_name: String,
    pub new_symbol: String,
    pub new_uri: String,
}

#[event]
pub struct PriceChanged {
    pub id: u64,
    pub old_price: u64,
    pub new_price: u64,
}

#[event]
pub struct SupplyIncreased {
    pub id: u64,
    pub added: u64,
    pub new_total: u64,
}

#[event]
pub struct DiscountChanged {
    pub id: u64,
    pub old_discount: u64,
    pub new_discount: u64,
}

#[event]
pub struct FeeChanged {
    pub old_fee: u64,
    pub new_fee: u64,
}

#[event]
pub struct OwnerChanged {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct Whitelisted {
    pub id: u64,
    pub user: Pubkey,
}

#[event]
pub struct Unwhitelisted {
    pub id: u64,
    pub user: Pubkey,
}

// ===================== Errors =====================

#[error_code]
pub enum ErrorCode {
    #[msg("Mint not registered for the given ID.")]
    MintNotRegistered,

    #[msg("Provided mint does not match the one registered for this ID.")]
    InvalidMintForId,

    #[msg("Insufficient supply remaining to fulfill mint request.")]
    InsufficientSupply,

    #[msg("Only the creator can perform this action.")]
    Unauthorized,

    #[msg("Price can't be zero.")]
    PriceCantBeZero,

    #[msg("Supply can't be zero.")]
    SupplyCantBeZero,

    #[msg("Overflow in supply calculation.")]
    Overflow,

    #[msg("Discount must be between 0 and BASE (1000).")]
    InvalidDiscount,

    #[msg("Per-user mint/holding limit exceeded.")]
    LimitExceeded,

    #[msg("Invalid community fee (must be between 0 and BASE).")]
    InvalidFee,

    #[msg("Program not initialized yet. Call initialize_platform first.")]
    ProgramNotInitialized,
}
