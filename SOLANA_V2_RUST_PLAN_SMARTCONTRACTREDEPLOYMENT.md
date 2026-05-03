# Munity Contracts Repo Audit and Solana v2 Redeploy Plan

Updated: 2026-05-04

## Scope

This document audits the current `Munity-Smart-Contracts` repository against the older Solana v2 redeploy plan. The repository now contains two contract workspaces:

- `munity/` - Anchor/Solana program source and tests.
- `smart-contracts/` - Hardhat/EVM ERC1155 contract.

This repository does not contain the full Munity web app. Any plan items that reference app paths such as `src/utils/solana/program.js`, `src/models/community.js`, or `NEXT_PUBLIC_SOLANA_PROGRAM_ID` must be executed in the separate fullstack/app repository, not here.

## Current Status

| Area | Current repo reality | Action |
| --- | --- | --- |
| Solana source | Present at `munity/programs/munity/src/lib.rs`. The old "source missing / copy external repo" status is resolved. | Treat `munity/` as the v1/deployed-source baseline. |
| Solana program ID | `munity/Anchor.toml`, `declare_id!`, and `munity/tests/munity.ts` all point at deployed mainnet program `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`. | Generate a new v2 program keypair before redeploy work. Do not reuse the old ID. |
| Solana provider | `Anchor.toml` defaults to `mainnet`. Tests also hardcode mainnet explorer/RPC strings. | Add localnet/devnet config and prevent accidental mainnet mutation during testing. |
| Solana tests | `munity/tests/munity.ts` is mostly commented out and contains live-mainnet state-changing calls such as `initializePlatform` and `changeOwner`. | Replace with isolated local validator tests before using as verification. |
| EVM source | Present at `smart-contracts/contracts/munity.sol`. | If EVM is in production scope, fix security issues before deploy. |
| App integration | Not present in this repo. | Review and update in the fullstack repo after v2 IDL/program ID are ready. |
| Local tools | `rustc` and Node are available. `anchor` and `solana` are not on PATH here. `cargo check` also fails because Windows `link.exe` is missing. | Install Anchor CLI, Solana CLI, and Visual Studio Build Tools or use a Linux/WSL build environment. |

## Historical On-Chain Findings

These findings came from the prior mainnet verification pass and still explain why v2 redeploy is the chosen direction:

- Current deployed Solana program: `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`.
- Expected treasury/platform owner: `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay`.
- Prior audit verified `platform_config.owner` equals the expected treasury.
- Prior audit found the deployed program remains upgradeable.
- Current upgrade authority: `GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM`.
- That deployer wallet appeared dormant after the original deploy and ownership handoff, but whoever controls it can still upgrade the live program.
- This custody mismatch is the core reason to redeploy v2 under founder-controlled Squads/Ledger custody instead of only updating app docs.

## Audit of Old Plan Against This Repo

| Old plan claim | Current finding | Updated interpretation |
| --- | --- | --- |
| "The deployed Anchor source is not in this repository." | No longer true. Source exists under `munity/`. | Step 1 copy is complete, but the source still needs v2 hardening. |
| "Copy external `munity/` files to root `programs/munity/...`." | Current repo uses nested Anchor workspace `munity/`. | Keep the nested workspace unless the app monorepo requires a root Anchor workspace. |
| "`smart-contract/munity.rs` is a placeholder." | No `smart-contract/munity.rs` exists in this repo. | Placeholder cleanup is no longer applicable here. |
| "IDL lives at `src/utils/solana/idl/munity.json`." | No `src/` app tree exists here. Anchor IDL will be generated under `munity/target/idl/` after build. | App IDL update belongs in the fullstack repo. |
| "PDA helpers live at `src/utils/solana/program.js`." | Not present here. | Validate PDA seeds from `munity/programs/munity/src/lib.rs`, then update app helpers in the app repo. |
| "App-side dual-program reads are implemented in `src/utils/community/membership.js`." | Not present here. | This remains a required fullstack task. |
| "v2 uses Merkle whitelist, `MintState`, two-step owner, explicit init args, version field." | Not implemented in current `lib.rs`. | These are still Phase 2 contract tasks. |
| "Anchor/Solana CLI installed per README." | Not true on this machine's PATH. | README now documents required tools rather than claiming installed versions. |

## Solana Source Review

Current source: `munity/programs/munity/src/lib.rs`

### What is already good

- Uses Anchor and Metaplex Token Metadata rather than the old placeholder-style raw logic.
- Uses PDA mint authority with seed `mint_authority`.
- Derives deterministic registry and mint PDAs by community id.
- Uses `system_program::transfer` CPI for buyer SOL payments.
- `BuyNFT` constrains `mint` to `registry.mint`, `creator_account` to `registry.creator`, and `platform_owner_account` to `platform_config.owner`, closing the obvious fund-redirection account-substitution class for those accounts.
- `change_community_fee` enforces `new_fees <= BASE`.

### Gaps to fix before v2

1. **Program ID and cluster safety**
   - The source still declares the live mainnet program ID.
   - `Anchor.toml` defaults to `mainnet`.
   - Tests are capable of sending state-changing transactions to mainnet.
   - v2 must start by generating a fresh program keypair, adding devnet/localnet config, and making tests local-validator first.

2. **Ownership transfer**
   - Current `change_owner(new_owner)` is one-step.
   - v2 should use `propose_owner(new_owner)` plus `accept_owner()` so the receiving owner must sign.

3. **Initialization**
   - Current `initialize_platform` sets owner to the signer and hardcodes fee to `45`.
   - v2 should take explicit args: `initialize_platform(owner: Pubkey, fee_bps: u16)` or equivalent, validate fee, and set `program_version = 2`.

4. **Whitelist model**
   - Current whitelist uses one PDA per `(community id, user)`.
   - v2 plan requires a Merkle root on `Registry` plus proof verification in `buy_nft`, replacing per-address whitelist PDAs.

5. **Per-user limit**
   - Current limit checks the buyer ATA balance, so a buyer can transfer tokens away and buy more.
   - v2 should add a `MintState` PDA per `(buyer, registry)` if the intended rule is cumulative mint limit rather than current holding limit.

6. **String sizing**
   - `Registry` reserves fixed storage for URI/name/symbol but handlers do not explicitly check max lengths.
   - Add `MAX_URI_LEN`, `MAX_NAME_LEN`, and `MAX_SYMBOL_LEN` validation so failures are intentional and testable.

7. **Fee and royalty terminology**
   - `community_fee = 45` with `BASE = 1000` means 4.5% platform fee.
   - Metaplex `seller_fee_basis_points = 45` means 0.45% royalty, not 4.5%. If the intended creator royalty is 4.5%, the value should be `450`; if 0.45% is intended, comments/docs should say that.

8. **Tests**
   - The current test file is closer to a mainnet deployment/admin script than a safe automated suite.
   - v2 needs local validator tests for all happy paths and failure paths before devnet/mainnet.

## EVM Source Review

Current source: `smart-contracts/contracts/munity.sol`

### High-risk issues

1. **Reentrancy in `buy`**
   - `buy` sends ETH to `creator` and `owner()` before updating `_communities[_id].supply` and `_mintings[sender][_id]`.
   - A malicious creator contract can reenter during its receive/fallback path while supply and mint counters are stale.
   - Fix with checks-effects-interactions, `ReentrancyGuard`, and preferably pull payments.

2. **Unbounded platform fee**
   - `changeCommunityFee` does not enforce `_newFees <= BASE`.
   - A bad value can break purchases by making `(totalAmt - _communityFee)` underflow/revert.

3. **Unbounded whitelist loops**
   - `addWhiteListing` and `removeWhiteListing` loop over arbitrary arrays.
   - Large lists can run out of gas; consider bounded batches, events-only indexing, Merkle roots, or off-chain allowlists depending on product need.

4. **Hardcoded RPC/API material**
   - `hardhat.config.js` contains hardcoded Alchemy/QuickNode-style URLs and an active explorer API key.
   - Move all provider URLs and explorer keys to environment variables before public sharing.

### Medium/low issues

- `buy` allows `_amount = 0`; decide whether to reject it.
- The contract can receive ETH through `receive()` but has no general withdraw function for accidental dust.
- The README is boilerplate and did not describe the actual contract; it has been updated.
- EVM royalty is `350` basis points (3.5%), while current Solana metadata royalty constant is `45` basis points (0.45%). Confirm intended cross-chain royalty policy.

## Updated Solana v2 Plan

### Phase 0 - Environment and safety

1. Install/verify:
   - Anchor CLI compatible with the codebase.
   - Solana CLI compatible with Anchor.
   - Rust build environment capable of compiling native crates.
   - Node/Yarn dependencies for `munity/`.
2. Add `.gitignore` coverage for generated and secret files:
   - `target/`
   - `**/*.so`
   - `**/target/deploy/*keypair*.json`
   - `.env`
3. Add localnet/devnet entries to `munity/Anchor.toml`.
4. Convert tests away from hardcoded mainnet program/RPC/explorer values.

### Phase 1 - Baseline build

1. From `munity/`, run dependency install.
2. Run `anchor build` against the current source.
3. Generate current IDL and compare it against any app IDL in the fullstack repo.
4. Do not proceed to v2 changes until the copied baseline builds.

### Phase 2 - v2 contract hardening

Implement in `munity/programs/munity/src/lib.rs` or split into modules if desired:

1. Generate a new v2 program keypair and replace `declare_id!`.
2. `initialize_platform(owner, fee_bps)` with fee bounds and `program_version = 2`.
3. Two-step ownership transfer:
   - `propose_owner(new_owner)`
   - `accept_owner()`
   - `pending_owner: Option<Pubkey>` on `PlatformConfig`.
4. Merkle whitelist:
   - `whitelist_root: [u8; 32]` on `Registry`.
   - `set_whitelist_root`.
   - `buy_nft(..., merkle_proof)` verification.
   - Empty root means open mint, if that remains the product decision.
5. `MintState` PDA per `(buyer, registry)` for cumulative mint limit.
6. Explicit max-length validation for URI/name/symbol.
7. Re-check fee bounds in `buy_nft` before payment math.
8. Confirm royalty basis points and update constants/comments/tests.
9. Preserve strict account constraints for creator, platform owner, mint, metadata, token program, and associated token program.

### Phase 3 - Tests

Replace `munity/tests/munity.ts` with local-validator tests or split into focused test files:

1. `initialize_platform`: happy path, double-init fail, invalid owner/fee fail.
2. `ownership`: propose/accept success, wrong signer fail, typo protection.
3. `register_community`: valid registration and invalid price/supply/discount/string length.
4. `buy_nft`: full price, creator free mint if retained, discounted whitelist buy, invalid proof, insufficient supply, cumulative limit, substituted creator/platform/mint accounts fail.
5. `admin`: price, supply, discount, fee, metadata changes with unauthorized callers rejected.
6. `whitelist`: Merkle root update and proof generation compatibility with the planned app-side JS library.

### Phase 4 - Devnet

1. Deploy v2 to devnet with a fresh deploy keypair.
2. Run the full Anchor suite against devnet.
3. Point the fullstack app to the devnet program ID and smoke-test register and buy flows.
4. Confirm generated IDL and PDA helpers match the app.

### Phase 5 - Fullstack/app migration

This phase cannot be done in this contracts-only repo.

Required in the app repo:

1. Replace app IDL with the generated v2 IDL.
2. Update PDA helper seeds if changed.
3. Store `program_id` per Solana community.
4. Backfill legacy communities with old program ID `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`.
5. Gate membership against both old-program mints and new-program mints.
6. Update environment docs for `NEXT_PUBLIC_SOLANA_PROGRAM_ID`.

### Phase 6 - Mainnet

1. Confirm Squads multisig and Ledger custody are ready.
2. Deploy v2 mainnet program under a fresh deploy keypair.
3. Initialize with platform owner `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay` and the confirmed platform fee.
4. Transfer upgrade authority to the Squads vault PDA.
5. Drain and retire the deploy keypair.
6. Update app production env to the new program ID.
7. Smoke-test production.
8. Rollback path: point the app env var back to old program ID while investigating the new deployment.

## Validation Performed on 2026-05-04

| Check | Result |
| --- | --- |
| `git status --short` before edits | Clean. |
| `anchor --version` | Failed: `anchor` not found on PATH. |
| `solana --version` | Failed: `solana` not found on PATH. |
| `rustc --version` | `rustc 1.90.0`. |
| `node --version` | `v22.19.0`. |
| `cargo check` in `munity/` | Failed before code compilation because Windows linker `link.exe` is missing. |
| Node dependency state | No `node_modules` in either workspace, so Hardhat/Anchor JS tests were not run. |

## Handoff Files

- `CODEX_HANDOFF_PROMPT_2026-05-04.md` - direct prompt for the next Codex implementation pass.
- `SOLANA_V2_RUST_EXPERT_HANDOFF_2026-05-03.md` - refreshed expert-review request, now pointing at this repo's actual paths.
- `original context for export to fullstack.md` - current repo context export for the app/fullstack handoff.
