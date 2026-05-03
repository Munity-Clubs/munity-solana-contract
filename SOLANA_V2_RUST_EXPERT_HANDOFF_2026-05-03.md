# Munity Solana v2 Redeploy — Expert Review Request

Hi — looking for your eye on a Solana / Anchor v2 redeploy before our implementation agent (Claude Opus 4.7) starts coding. Replies inline below or in a separate doc — your call.

## TL;DR

- Munity is a community platform launching soon. Solo founder.
- Current Solana program (`34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`) was deployed by a third party who **still holds upgrade authority** (`GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM`). We don't control that keypair, so we're redeploying under our own custody (Squads multisig + Ledger).
- **We have the original Anchor source.** It lives in an external repo the founder controls and has been manually reviewed for safety. v2 starts as a **literal copy** of those files into this repo, then we apply targeted improvements before redeploying under a new program ID.
- **No external audit** — conscious solo-founder tradeoff. Compensating with extensive Anchor tests, hand-walked account-constraint review, founder's manual source review, and your input below.
- Token model: SPL fungible, `decimals = 0`, one mint per community. Uses Metaplex Token Metadata + SPL Token + ATA (confirmed from existing test imports).
- Plan shape: **copy → improve → deploy**. Three steps, fully detailed in the linked plan doc.

## Reference docs in this repo

- **`docs/plans/Smart Contracts/SOLANA_V2_RUST_PLAN_SMARTCONTRACTREDEPLOYMENT.md`** — full audit + v2 redeploy plan + 7 implementation phases. **Read this first** for full context. Includes the file-by-file copy table from the external repo.
- **`docs/plans/Smart Contracts/SMART CONTRACTS EXTERNAL CODEBASE CONTEXT...md`** — file inventory of the external `munity/` codebase (source for the copy step).
- **`src/utils/solana/idl/munity.json`** — IDL of the currently-deployed program (matches the source we're copying).
- **`src/utils/solana/program.js`** (lines 193-246) — PDA seed strings the deployed program uses.

## External repo (source of v2's starting point)

The founder's external `munity/` codebase contains the Anchor source. Key files:

- `munity/programs/munity/src/lib.rs` — program entrypoint
- `munity/programs/munity/Cargo.toml` — crate manifest
- `munity/Anchor.toml` — provider cluster = `mainnet`, program ID matches deployed
- `munity/tests/munity.ts` — Anchor test suite (references Metaplex / SPL Token / ATA programs)
- `munity/migrations/deploy.ts` — deploy script

For your review, please pull the external repo and read the existing code. Several questions below ask whether the existing approach is fine or should be changed — read the source before answering those.

## Locked design decisions (so you don't waste time challenging them)

| Area | v2 decision |
|---|---|
| Token model | SPL fungible, `decimals = 0`, one mint per community |
| Whitelist | **Merkle root** on Registry, verified at `buy_nft` with proof (NOT per-address PDAs) |
| Mint authority | PDA singleton, seed `[b"mint_authority"]` |
| Account constraints | Strict `has_one` / `address = ...` everywhere |
| Fee bound | `community_fee` ≤ `BASE` (1000), enforced in setter and re-checked in `buy_nft` |
| Per-user limit | `MintState` PDA per `(user, registry)`, properly initialized |
| `change_owner` | 2-step (`propose_owner` + `accept_owner`) |
| SOL movement | `system_program::transfer` CPI exclusively |
| Upgrade authority | Set to Squads multisig at end of deploy |
| `initialize_platform` | Takes `owner: Pubkey` and `fee_bps: u16` args directly (skips the deployed program's initialize-then-change_owner dance) |
| Versioning | `program_version: u8` on `PlatformConfig` (v2 = 2) |

Full rationale for each in the plan doc.

## Questions

1. **Merkle whitelist verification** — what's the cleanest Anchor pattern for verifying a Merkle proof against a stored root inside `buy_nft`? Recommend a library (`anchor-merkle-tree`, custom impl, `solana-merkle-distributor`)? How do you handle: (a) empty root = open mint, (b) discriminator collision risks, (c) leaf format (just `pubkey`, or `(pubkey, claim_amount)`)?
2. **`MintState` PDA initialization in `buy_nft`** — should we use `init_if_needed` with the buyer paying rent, or a separate `initialize_mint_state` instruction the user calls once before their first buy? Tradeoffs in UX, attack surface, rent ergonomics?
3. **SOL transfer pattern** — confirm `anchor_lang::system_program::transfer` CPI is the only safe primitive when the source is a Signer wallet. Is there ever a case where direct lamport mutation `**account.try_borrow_mut_lamports()? -= n` is correct? (Asking so we know precisely when it is NOT.)
4. **2-step `change_owner`** — Anchor pattern for: store `pending_owner: Option<Pubkey>` on PlatformConfig, `propose_owner` mutates it, `accept_owner` requires `signer.key() == pending_owner` and clears the field. Any gotcha with `Option<Pubkey>` serialization?
5. **Squads upgrade authority** — wiring Squads as upgrade authority for a fresh program: do we deploy first under a deploy keypair and then `solana program set-upgrade-authority --new-upgrade-authority <squads-vault-pda>` in a follow-up tx? Any sharp edges with the Squads vault PDA being a non-keypair account?
6. **`initialize_platform(owner, fee_bps)` with explicit args** — any reason to NOT take owner explicitly and instead default to `signer.key()`? (Avoids the deployed program's initialize-then-change_owner two-step.)
7. **Account-constraint syntax** — show idiomatic Anchor 0.30+ for asserting in `BuyNft` accounts struct: `creator_account.key() == registry.creator` AND `platform_owner_account.key() == platform_config.owner` AND `mint.key() == registry.mint`. Specifically: `has_one = creator @ ErrorCode::Foo` vs explicit `address = registry.creator` vs custom `constraint = ...`?
8. **Per-mint supply enforcement** — should `Registry.remaining_supply` be the source of truth (decremented on each buy), or should we read SPL Mint's `supply` directly and constrain `total_minted ≤ initial_supply`? Tradeoffs: one extra account read vs the existing pattern. Defense-in-depth case for both?
9. **Token-2022 vs SPL-Token classic** — for a fungible community token (decimals=0), is there any reason to switch to Token-2022 in v2? Transfer fees (no), frozen states, anything else useful? Default plan is to stay on classic SPL — confirm.
10. **Test framework** — `anchor test` (full validator) vs Bankrun / Mollusk (in-memory) for our 6 test files? Recommendation for our scale (<2k LoC contract, ~100 test cases)?
11. **Account size sizing** — `Registry` has variable-length strings (uri, name, symbol). Best practice: cap at `MAX_URI_LEN`/`MAX_NAME_LEN` constants and pre-size the account, or use `realloc`-on-update? Lazy init to avoid wasted rent for small URIs?
12. **Devnet → mainnet drift** — same Anchor source compiles to identical bytecode on both clusters? Anything to watch for? Specifically: does `cluster = mainnet` in `Anchor.toml` inject any conditional compilation we should know about?
13. **`program_version` field** — proposed `u8` field on `PlatformConfig` set at init, used to detect v2 vs future v3 from on-chain reads. Bad idea? Should it live elsewhere? Should it be in PlatformConfig where it would require migration if reorganized, or a separate `ProgramVersion` PDA?
14. **Anchor IDL versioning** — how do we maintain backward compatibility with the existing IDL JSON's account types if v2 reorders or adds fields? Specifically: the app's `program.js` does `new anchor.Program(idl, programId, provider)` — does Anchor reject mismatched IDLs at runtime, or silently accept and break later?
15. **Merkle tree generation off-chain** — recommended JS library to generate the merkle root + proofs in the app (`@solana/spl-account-compression`? Custom keccak256? Plain SHA-256?). Has to match whatever the on-chain verifier uses bit-for-bit.
16. **Buyer-pays-rent ergonomics** — when buyer initializes their own `MintState` PDA via `init_if_needed`, what's the marginal SOL cost they pay on first buy? Is this worth surfacing in the UI ("first-buy fee is X SOL extra")?

## Decisions still open (your input welcome)

- **Discount semantics** — current deployed program reads `discount` as a per-mille off (e.g., 100 = 10% off). Is that what we want, or align to a different pattern? Pick one and stick with it; don't ship two-mode discount handling.
- **`buy_nft` per-user `LIMIT`** — deployed default is 50. Keep, or make per-community configurable at registration?
- **Add `pause` instruction** — should the platform owner be able to pause `buy_nft` globally in case of an emergency? (Adds attack surface but can also save funds during an exploit.) Default plan: NO pause for v2 simplicity. Reconsider for v3.
- **Royalty enforcement on resales** — Solana royalties are advisory at the marketplace level. Default plan: do nothing on-chain; let creators rely on marketplace policy. Confirm.
- **MEV / front-running on `buy_nft`** — competitive mints (e.g., a popular community at low price) may attract bots. Default plan: ignore for v2; not in scope. Document for v3.

## Open-ended

Anything we haven't asked that you're going to wish we had — the "you're going to regret X" warnings the questions don't surface — please flag them. We're shipping without an audit; your eye on the audit-shaped questions is the closest substitute we have.

## If you have time + interest

Optional follow-up: review Opus 4.7's PR before mainnet deploy. Paid, scope-bounded. Let us know.

Thanks 🙏
