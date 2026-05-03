# Solana program verification + repo source status + upgrade-authority audit

## Context

User provided deployed Solana program ID `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa` and asked:

1. Does the program's `platform_config.owner` field route platform fees to the user's expected treasury `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay`?
2. Is the repo's `smart-contract/munity.rs` up to date with what is actually deployed? If not, does any other branch (e.g. `final-merge(test)`) have a more current version?

After initial verification surfaced a third concern — that the program's **upgrade authority** is held by a wallet whose identity we hadn't established — the user asked for a transaction-by-transaction breakdown of that wallet's activity, in plain English, suitable for sharing with a security reviewer.

This document is a read-only verification report and a punch-list of follow-up actions. No code changes are proposed.

## Summary (one-line each)

- ✅ **Solana platform fees route to your treasury.** `platform_config.owner = Dc55…wsay` exactly.
- ❌ **The repo's `smart-contract/munity.rs` is a placeholder, not the deployed source.** Not present at any branch or any commit history.
- ⚠️ **The program's upgrade authority is `GFu2NX…BkjM`**, the same wallet that originally deployed the program. It has not touched the program since deploy day, but it **could deploy a new program version at any time** if anyone holds its keypair.
- ✅ **`GFu2NX…BkjM` did the right thing on deploy day**: it deployed the program, initialized the platform with itself as owner, then immediately transferred ownership to your treasury, and went dormant. This is the "managed deployment" pattern.

## Findings

### 1. Solana treasury — VERIFIED MATCH ✅

Read directly from mainnet via `getAccountInfo` on `J4Vuid5Uv8TYMMqs8qqihdirh5959dzSCYRHHGbx3U2D` (the `[b"platform"]` PDA derived from program `34Duo…XsHa` using the seed in [src/utils/solana/program.js:194-198](src/utils/solana/program.js#L194-L198)):

| Field | Value |
|---|---|
| account owner (the program that controls this account) | `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa` ✅ |
| `data.size` | 50 bytes (matches IDL: 8B disc + 32B owner + 8B fee + 1B bump + 1B init) |
| `platform_config.owner` (the wallet that receives platform fees and can call admin instructions) | **`Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay`** ✅ exact match to user's treasury |
| `platform_config.community_fee` | **45** → 4.5% per mint (note: the IDL doc-string at [src/utils/solana/idl/munity.json:8](src/utils/solana/idl/munity.json#L8) says default is 36 → 3.6%; current value is higher — either the deployed default differs from the IDL doc, or someone called `change_community_fee` at some point. The treasury wallet's tx history below is consistent with someone making that call.) |
| `platform_config.bump` | 255 |
| `platform_config.initialized` | true |
| `global_counter.count` | **14** communities ever registered on Solana mainnet |

Conclusion: every Solana mint that pays platform fees routes the platform-fee share to the user's treasury. Creator-share routing is per-community (each `Registry` PDA's `creator` field is set at registration to whoever called `registerCommunity`).

### 2. Repo `smart-contract/munity.rs` vs deployed — MISMATCH

The repo file is a non-functional placeholder. Confirmed:

- **One commit only**: `70a1365` (2025-07-21) "Initial contract" by Nabeel Khan. `git log --all --remotes -- smart-contract/munity.rs` returns this single commit across every local + remote branch.
- **`final-merge(test)` (remote `origin/final-merge(test)`) has no different version** of `munity.rs`. The branch exists but never modified the file.
- **No other Rust source in the repo**: `find` returns only `smart-contract/munity.rs`. No `Cargo.toml`, no `Anchor.toml`, no `programs/` or `program/` or `anchor/` directories.
- **The placeholder uses `declare_id!("MunityProGram111111111111111111111111111111111")`** — a literal placeholder. The real program ID is `34Duo…XsHa`.
- **Behavior mismatch with reality**: placeholder uses raw lamport mutations (mechanically broken on Signer wallets), creator-as-MintTo-authority (no Signer, won't sign), no Metaplex Token Metadata. Deployed program (per IDL at [src/utils/solana/idl/munity.json](src/utils/solana/idl/munity.json) and PDA helpers in [src/utils/solana/program.js:193-246](src/utils/solana/program.js#L193-L246)) uses Metaplex, PDA-derived `mint_authority`, deterministic per-community `mint` PDAs, and a `change_owner` instruction the placeholder doesn't have.

**The deployed Anchor source is not in this repository at any branch, any commit, any path.** It must come from the original developers (likely the same team that authored the EVM contract — header in `munity.sol` says "Decrypted Labs").

### 3. Program upgrade authority — wallet `GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM`

Read from the program's ProgramData account (`JE1vxUV4vaqEZojzeyknvgkYHPLNDRfo4LS33Xatgni2`):

- **Program is upgradeable** (BPF Loader Upgradeable, not a frozen program).
- **Upgrade authority**: `GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM`
- **Last upgrade slot**: `378749148` (2025-11-08T14:42:28 UTC).
- **Number of upgrades since deploy**: zero. The ProgramData account has exactly one tx in its signature history — the original deploy. The bytecode running today is the bytecode that was deployed in November.

Whoever holds the keypair for `GFu2NX…BkjM` can deploy a new program version with arbitrary code at any time, with no user opt-in. That includes redirecting future fees, changing access rules, or draining funds during users' next `buy_nft` calls. **Treasury verification is moot if a third party can swap the program tomorrow.**

### 4. Activity log for upgrade-authority wallet `GFu2NX…BkjM`

Pulled via `getSignaturesForAddress` from `api.mainnet-beta.solana.com` (Solana Foundation public RPC, retains older signature index than `solana-rpc.publicnode.com`).

**Total lifetime signatures: 429. All in a 21-minute window on 2025-11-08. Zero failures. Zero activity since.**

| Field | Value |
|---|---|
| First signature | `5AmDF1ms…fqUuqwg2` at **2025-11-08T14:21:54 UTC** |
| Last signature | `3XGRcUeG…UCSWSZqG` at **2025-11-08T14:42:31 UTC** |
| Wall-clock window | 20 minutes 37 seconds |
| Failed transactions | 0 / 429 |
| Activity in any other month | 0 |
| Current SOL balance | 0.0843 SOL (~$17) |
| Current SPL token holdings | 0 |

#### What 429 transactions in 21 minutes actually means

Deploying an Anchor program on Solana requires uploading the compiled program bytecode in many small chunks (each ~1KB) via the BPF Loader Upgradeable, then a single "finalize deploy" transaction that turns those chunks into a live program. A program of moderate size requires **a few hundred chunk-write transactions**, all in quick succession.

429 transactions, no failures, all clustered in a 21-minute window with the last one being a Munity program admin call, is the textbook fingerprint of a program deployment session by a fresh wallet. There is no mass-mint or gameplay activity here — this wallet did not "play" with the program after deploy.

#### The four most important transactions (newest first, decoded)

I fetched and decoded the actual transaction details for the tail of the deploy session. Anchor instructions identify themselves with an 8-byte discriminator (`sha256("global:" + instruction_name)[:8]`); I matched against the known instructions in the IDL.

**Tx 1 — `3XGRcUeG…UCSWSZqG` at 2025-11-08T14:42:31 UTC (slot 378749155)**
- Program: `34Duo…XsHa` (Munity)
- Instruction discriminator: `6d28285ae078c1b8` → **`change_owner`**
- Argument (next 32 bytes): `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay`
- **Plain English: "I, the deployer, hereby transfer ownership of this program's PlatformConfig (and the right to receive platform fees) to the user's treasury wallet `Dc55…wsay`."** This was the very last action this wallet ever took.

**Tx 2 — `3Nrj1dY9…37C9Mj1d` at 2025-11-08T14:42:30 UTC (slot 378749153)**
- Program: `34Duo…XsHa` (Munity)
- Instruction discriminator: `77c9652d4b7a5903` → **`initialize_platform`** (no args)
- Accounts: signer=`GFu2NX`, platform_config PDA=`J4Vu…3U2D`, system program
- **Plain English: "Create the PlatformConfig account, set its owner to me (the signer, `GFu2NX`), and set the default community fee."** This is the one-time setup call. The owner is set to the signer here; one second later (Tx 1) it gets changed to the treasury.

**Tx 3 — `3v79XjFn…ovtYCSpQ` at 2025-11-08T14:42:28 UTC (slot 378749148)** — *this slot matches the only entry in the ProgramData account's history*
- Program 1: System Program (account creation)
- Program 2: BPF Loader Upgradeable (program deployment)
- **Plain English: "Create the program account on-chain and deploy the bytecode buffer that was uploaded over the previous 20 minutes."** This is THE moment the Munity program became live on Solana mainnet.

**Tx 4 — `3vrk16gS…nnqbnHJ7` at 2025-11-08T14:42:15 UTC (slot 378749115)**
- Program: BPF Loader Upgradeable
- **Plain English: "Write a chunk of program bytecode to a buffer account."** One of ~427 such chunk-writes that preceded the final deploy.

#### Timeline at a glance

```
2025-11-08 14:21:54 UTC ─┬─ first chunk-write begins (BPF Loader Upgradeable)
                         │  ... ~427 more chunk-writes over 20 minutes ...
2025-11-08 14:42:15 UTC ─┤  last chunk-write
2025-11-08 14:42:28 UTC ─┤  PROGRAM DEPLOYED — Munity becomes live on mainnet
2025-11-08 14:42:30 UTC ─┤  initialize_platform (owner = GFu2NX, the deployer)
2025-11-08 14:42:31 UTC ─┴─ change_owner → Dc55…wsay (your treasury)
                            ── 6 months of silence ──
2026-05-02 (today)           wallet holds 0.0843 SOL, no activity
```

#### What this means for the user, in plain English

The good news:
- **The deployer did not skim fees.** It set itself as owner for one second, then handed ownership to the user's treasury. This is correct, professional behavior.
- **The deployer has not touched anything since.** Six months dormant. No upgrades, no further admin calls. If the keypair were compromised right now, the attacker would have to act fresh on mainnet to do anything visible.
- **All 429 deploy txs succeeded.** Clean deploy. No half-states.

The remaining concern:
- **The deployer still holds the program's upgrade authority.** This is separate from the platform owner. The platform owner (your treasury) controls fees, admin instructions, and ownership of the on-chain config. The program upgrade authority controls **the code itself**. Whoever has the upgrade keypair can deploy a new version of the program tomorrow that does anything — including ignore the platform owner check entirely. Solana lets you transfer or null this authority with one CLI command (`solana program set-upgrade-authority <PROGRAM> --new-upgrade-authority <YOUR_KEY>` or `--final` to make the program immutable forever).

### 5. Activity log for treasury wallet `Dc55…wsay` (sanity check)

Quick check to corroborate. Pulled via `getSignaturesForAddress` from `api.mainnet-beta.solana.com`.

**Total lifetime signatures: 5. All successful.**

| When | Slot | Note |
|---|---|---|
| 2025-11-03T17:28:02 UTC | 377695646 | **Before the program deploy** (deploy was 2025-11-08). This was probably the wallet being funded or used for something unrelated. |
| 2025-12-10T21:23:36 UTC | 385833700 | First post-deploy activity. |
| 2026-01-26T20:57:29 UTC | 396126551 | |
| 2026-01-31T16:11:04 UTC | 397163546 | |
| 2026-01-31T20:25:53 UTC | 397201955 | Last activity ~3 months ago. |

The very low signature count is consistent with: 14 communities registered, of which only a small subset have actually had paid mints, and platform-fee receipts are bundled inside `buy_nft` transactions (which the *buyer* signs, not the treasury). The treasury's own activity is mostly admin (owner-only instructions). The bump from 36 → 45 community fee likely happened in one of the four post-deploy txs, but I did not fetch those details due to RPC rate limits — easily verifiable on Solscan.

## Recommended next steps (no immediate edits proposed)

1. **Confirm or null the upgrade authority.** Decide whether `GFu2NX…BkjM` is a wallet you (or someone you trust) hold the keypair for. If yes, you're fine — but record it in your security docs as a critical key, and put it cold (hardware wallet or multisig). If no — i.e., if the dev firm holds it — request transfer to your wallet, or ask them to set the authority to `null` to lock the program permanently. The latter prevents bug fixes; only do it after a real audit.
2. **Obtain the deployed Anchor source from the dev team and either commit it to the repo or store it in a secure location.** Without source, no audit is possible. Open audit questions remain (e.g., whether `creatorAccount` and `platformOwnerAccount` in `buyNft` are constrained against `registry.creator` and `platformConfig.owner` — the F1 fund-redirection bug class).
3. **Delete or replace `smart-contract/munity.rs`.** Leaving a broken placeholder in the repo is misleading. The next person who reads it will assume it's production code. Either delete it outright or replace it with the real deployed source once obtained.

(All three above are subsumed by the v2 Redeploy Plan below.)

## Critical files referenced (no edits proposed by this plan)

- [smart-contract/munity.rs](smart-contract/munity.rs) — placeholder; candidate for deletion or replacement (item 3 above).
- [src/utils/solana/idl/munity.json](src/utils/solana/idl/munity.json) — accurate IDL of deployed program; no change needed. (Note: doc-string says default fee = 36; on-chain value is 45. Either the doc is stale or `change_community_fee` was called.)
- [src/utils/solana/program.js](src/utils/solana/program.js) — PDA seeds match deployed program; no change needed.
- [docs/plans/MULTI_COLLECTION_LAUNCH_READY_EXECUTION_PLAN_2026-05-02.md](docs/plans/MULTI_COLLECTION_LAUNCH_READY_EXECUTION_PLAN_2026-05-02.md) — explicitly states "do not deploy new contracts"; aligned with this plan.

## Verification log (already executed, all read-only)

| Check | Tool | Result |
|---|---|---|
| Program account exists on mainnet | `getAccountInfo 34Duo…XsHa` on `solana-rpc.publicnode.com` and `api.mainnet-beta.solana.com` | exists, executable, owned by BPFLoaderUpgradeable, 36 bytes |
| Program absent on devnet/testnet | `getAccountInfo` on `api.devnet.solana.com`, `api.testnet.solana.com` | not found (correctly — mainnet-only) |
| PlatformConfig PDA derivation | `node -e` with repo's `@solana/web3.js`, seed `[b"platform"]` | `J4Vuid5Uv8TYMMqs8qqihdirh5959dzSCYRHHGbx3U2D` |
| PlatformConfig data | `getAccountInfo J4Vu…3U2D`, base64 decode | 50 bytes; owner field decoded to `Dc55…wsay` ✅; fee 45; bump 255; initialized true |
| GlobalCounter | `getAccountInfo 9RYs…r13P`, parse u64 LE at offset 8 | count = 14 |
| Upgrade authority | `getAccountInfo` slice 0..45 of programdata `JE1v…gni2`, parse | `GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM` |
| GFu2NX activity | `getSignaturesForAddress` (mainnet-beta) | 429 sigs total, all 2025-11-08, 0 errors |
| GFu2NX last 4 txs decoded | `getTransaction` + Anchor discriminator match | chunk-write → deploy → initialize_platform → change_owner(Dc55) |
| Dc55…wsay activity | `getSignaturesForAddress` (mainnet-beta) | 5 sigs total: one pre-deploy (2025-11-03), four post-deploy (last 2026-01-31) |
| Repo .rs history (all branches) | `git log --all --remotes -- smart-contract/munity.rs` | one commit `70a1365` |
| Other Rust sources / Anchor scaffolding | `find` for `*.rs`, `Cargo.toml`, `Anchor.toml` outside `node_modules/` | none beyond the placeholder |

## Out of scope for this report

- Decoding all 5 of `Dc55…wsay`'s transactions (rate-limited; the user can verify on Solscan in a few clicks).
- EVM contracts entirely. This plan is Solana-only. EVM has its own separate audit findings (reentrancy on `buy`, unbounded fee, etc.) tracked elsewhere.

---

# v2 Redeploy Plan (added 2026-05-03)

## UPDATE 2026-05-03 — deployed Anchor source LOCATED

The original-developer Anchor source for program `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa` is in an external repo the founder controls. Founder has done a manual review via GitHub browser and confirmed it is safe / matches the deployed program. **Step 1 ("copy") is now a literal file copy, not a reconstruction from IDL.**

File inventory imported as `docs/plans/Smart Contracts/SMART CONTRACTS EXTERNAL CODEBASE CONTEXT...md`. Key facts confirmed from that inventory:

- External repo has both Anchor (`munity/`) and EVM (`smart-contracts/`) sides. We only consume the Anchor side here; EVM is out of scope for this plan.
- Anchor program crate name is `munity`. Workspace structure: `munity/Cargo.toml` (workspace) + `munity/programs/munity/Cargo.toml` (crate).
- `munity/Anchor.toml` provider cluster = `mainnet`. Program ID matches deployed.
- `munity/tests/munity.ts` references Metaplex Token Metadata, SPL Token, ATA programs (confirms the deployed program uses Metaplex, as the IDL implied).
- `munity/tests/munity.ts` references `Dc55…wsay` as the new owner in tests — confirming `change_owner` flow exercises the founder's treasury (matches the on-chain audit).
- Local wallet keypair path expected at `~/.config/solana/id.json` (will be replaced by Squads multisig flow on mainnet deploy).

## Decision

The audit above documented that the program's upgrade authority (`GFu2NX…BkjM`) is held by a wallet the founder does not control. That is an **unbounded ongoing risk** — a third party can deploy a new program version with arbitrary code at any moment. A bounded one-time redeploy under our own custody is strictly safer than tolerating that asymmetry indefinitely. The earlier "do not redeploy" recommendation in [docs/plans/MULTI_COLLECTION_LAUNCH_READY_EXECUTION_PLAN_2026-05-02.md](docs/plans/MULTI_COLLECTION_LAUNCH_READY_EXECUTION_PLAN_2026-05-02.md) was based on the assumption that the deployed program was structurally sound AND under user-aligned control. The second condition does not hold. **Redeploy.**

## Strategy: copy → improve → deploy

Three steps. The whole plan is shaped around this.

### Step 1 — Copy the deployed program's source into the repo

**RESOLVED 2026-05-03.** Source is available in the founder's external `munity/` repo and has been manually reviewed as safe. Step 1 is a literal file copy, not a reconstruction.

**Files to copy from external `munity/` → this repo:**

| External path | Destination in this repo |
|---|---|
| `munity/programs/munity/src/lib.rs` | `programs/munity/src/lib.rs` |
| `munity/programs/munity/Cargo.toml` | `programs/munity/Cargo.toml` |
| `munity/programs/munity/Xargo.toml` | `programs/munity/Xargo.toml` |
| `munity/Cargo.toml` (workspace) | `Cargo.toml` at repo root (workspace manifest) |
| `munity/Anchor.toml` | `Anchor.toml` at repo root |
| `munity/tsconfig.json` | `tests/solana/tsconfig.json` (separate from app's `jsconfig.json`) |
| `munity/package.json` | `tests/solana/package.json` (do NOT merge into root `package.json` — Next.js app uses yarn 1.22 with its own `packageManager` pin) |
| `munity/tests/munity.ts` | `tests/solana/munity.ts` |
| `munity/migrations/deploy.ts` | `migrations/solana/deploy.ts` |

After copy, do NOT use the deployed `declare_id!` value directly — generate a new program keypair for v2 and replace it (see Phase 1 step 3). Reusing the old program ID is not possible: that program already exists on-chain under a third-party upgrade authority.

PDA seed strings the deployed program uses are already documented in [src/utils/solana/program.js:193-246](src/utils/solana/program.js#L193-L246). Anchor.toml provider cluster is `mainnet`; we'll add `devnet` for testing.

### Step 2 — Improve

Apply every strengthening item in the "v2 contract design (locked decisions)" table below — non-negotiable regardless of which copy path step 1 used. Strict `has_one` account constraints, merkle whitelist (replaces per-address PDAs), per-user `MintState` counter, 2-step `change_owner`, fee bounds, `system_program::transfer` for SOL, explicit `initialize_platform(owner, fee_bps)` args, `program_version` field.

### Step 3 — Deploy under our custody

Solana mainnet. Upgrade authority pre-set to a Squads multisig the founder controls (see Custody section). Deploy keypair drained and abandoned post-deploy. App `NEXT_PUBLIC_SOLANA_PROGRAM_ID` env var swapped to the new program ID. Rollback path: revert env var to old program ID.

## Custody (locked)

- **Upgrade authority**: Squads multisig with the founder as the single signer across two devices — existing Squads + a new Squads, with a Ledger as one of the signing devices. Solo founder, two-device setup.
- **Platform owner** (`platform_config.owner`): existing treasury `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay`. No change.
- **Deploy keypair**: a fresh hot keypair created for the deploy itself, then the upgrade authority is immediately handed to the Squads multisig. Deploy keypair is then drained and never used again.

## No external audit (explicit tradeoff)

The founder has chosen to ship v2 **without an external audit** (no OtterSec / Neodyme / Offside engagement). This is a conscious solo-founder tradeoff between launch speed + cost vs external assurance. **This decision is recorded here so any future reviewer / acquirer / regulator can see it was made consciously, not through oversight.** Compensating disciplines:

1. Extensive Anchor unit + integration tests covering every instruction's happy path AND every failure path.
2. Property-based / invariant tests where applicable — supply never increases, fee always ≤ BASE, owner is never the default Pubkey, etc.
3. Hand-walked account-constraint review documented as inline comments next to each `#[derive(Accounts)]` struct.
4. Self-review pass before deploy.
5. Devnet smoke test before mainnet; manual end-to-end run from the app pointed at the devnet program ID.
6. Mainnet deploy with upgrade authority pre-set to Squads — recoverable if a bug ships.
7. Rust expert engagement (questions section below) feeds in advance, not after.
8. **Founder manual review of the deployed source** (2026-05-03) — read via the external GitHub repo, confirmed source matches deployed program behaviorally. Not an audit; is the founder's own confirmation that the code does what the IDL claims.

## v2 contract design (locked decisions)

| Area | v2 design | Why |
|---|---|---|
| Token model | SPL fungible tokens, `decimals = 0`, one mint per community (matches deployed structure) | No NFT/Metaplex complexity beyond what's already there; matches IDL |
| Multi-collection per club | Off-chain (Mongo `Community.sibling_collections`) — each sibling is a separate `register_community` call | Aligns with existing launch plan; on-chain program does not need parent/child concepts |
| Whitelist | **Merkle root** stored on `Registry`, verified at `buy_nft` with proof | Privacy-first ethos: non-enumerable membership; massively cheaper for creators with large lists |
| Mint authority | PDA singleton, seed `[b"mint_authority"]` (matches deployed program) | Program signs CPIs via seeds; no user-supplied authority |
| Account constraints | Strict `has_one = creator`, `has_one = mint`, `address = platform_config.owner` etc. on every cross-account reference | Closes F1 fund-redirection bug class at the type level — a swapped `creatorAccount` fails Anchor validation before the instruction runs |
| Fee bound | `community_fee` ≤ `BASE` enforced in `change_community_fee`; re-checked at every `buy_nft` math step | Defends against owner typo; matches IDL's `InvalidFee` code |
| Per-user limit | `MintState` PDA per `(user, registry)`, `init_if_needed`, fields populated correctly, `LimitExceeded` actually fires | Audit found `LimitExceeded` exists in IDL but no PDA visible — likely dead enforcement today |
| `change_owner` | 2-step (propose + accept) — propose stages `pending_owner: Option<Pubkey>`, the new owner must sign accept | Typo-resistant ownership transfer; protects against handing platform to a black hole |
| SOL movement | `system_program::transfer` CPI exclusively, never raw lamport mutation | Fixes the placeholder's broken pattern; correct for Signer wallet sources |
| Upgrade authority | Set to Squads multisig at the end of deploy | Custody plan above |
| `initialize_platform` | Takes `owner: Pubkey` and `fee_bps: u16` args directly | Skips the deployed program's initialize-then-change_owner dance; no 1-second window where deployer is owner |
| Versioning | `program_version: u8` field on `PlatformConfig` set at init (v2 = 2) | Future v3 migrations can detect from on-chain reads |

## Migration plan for legacy 14 communities

On-chain reads on 2026-05-02 confirmed 14 communities (ids 1–14) on the old program with **~6,261 unmintable supply remaining** if we walk away. Approach (ranked):

1. **App-side dual-program ownership reads** — REQUIRED. No creator coordination needed.
   - When checking community membership / channel access / token-gate, the app queries token-account balances against BOTH old-program mints AND new-program mints.
   - Existing holders keep access regardless of which program their NFT was minted from.
   - Implemented in [src/utils/community/membership.js](src/utils/community/membership.js) (already exists per gitStatus; needs dual-program awareness).
2. **Creator-led migration UX** — OPTIONAL. For creators who want to keep growing their community.
   - Each affected creator can click "Migrate to v2" in settings → app calls v2 `register_community` with same metadata, links new community to old in Mongo, optionally airdrops v2 tokens 1:1 to existing holders' wallets.
   - Munity covers the gas (~$10 × 14 = $140 worst case).
3. **Old communities marked `legacy_solana: true`** in Mongo:
   - Hidden from new-club discovery UI.
   - Readable for existing holder access checks.
   - Settings tab shows "Legacy v1 community" with a migration prompt.

## Mongo schema migration

- **`Community` model** ([src/models/community.js](src/models/community.js)): add `program_id: { type: String, required: false, index: true }`.
- **Compound index update**: change `{ chain_id: 1, contract_community_id: 1 }` → `{ chain_id: 1, program_id: 1, contract_community_id: 1 }`. Disambiguates old (`id=1` on `34Duo…XsHa`) from new (`id=1` on new program).
- **Backfill**: existing 14 Solana communities get `program_id = "34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa"` during the migration script. EVM communities get `null`.
- **`Collection` model** ([src/models/Collection.js](src/models/Collection.js)): no change required. `mint_address` is unique per program (different mints derived from different program IDs).

## App-side changes summary

The app reads `process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID` for new-program operations. The 9 files that touch it all go through env var (verified 2026-05-03 — zero hardcoded program IDs):

- [src/utils/solana/idl/munity.json](src/utils/solana/idl/munity.json) — replace with regenerated IDL from v2 build.
- [src/utils/solana/program.js](src/utils/solana/program.js) — verify PDA seed names match v2; if v2 changes any seeds, update helpers.
- [src/utils/solana/constants.js](src/utils/solana/constants.js) — no change (env-driven).
- [src/utils/solana/solanaContext.js](src/utils/solana/solanaContext.js) — no change (uses `program.js`).
- [src/utils/solana/printrFreeClaimMint.js](src/utils/solana/printrFreeClaimMint.js) — verify Printr-free-claim flow doesn't use any deprecated v1 features.
- [src/utils/community/membership.js](src/utils/community/membership.js) (new in gitStatus) — add dual-program ownership check.
- [src/models/community.js](src/models/community.js) — add `program_id` field + update compound index.
- [src/pages/api/communities/...](src/pages/api/communities/) — when registering a new community, write `program_id` from env to the Mongo record.
- [.env.example](.env.example) — document new var if not already present.

## Implementation phases (for Opus 4.7 to execute)

### Phase 1 — copy external source + repo scaffolding

1. Copy the file set in the Step 1 table from the external `munity/` codebase into the destinations listed. Verify `anchor build` succeeds before any modifications.
2. Update copied `Anchor.toml`: add a `[provider]` block / `[programs.devnet]` entry alongside the existing `mainnet` config so we can deploy to devnet for testing.
3. **Generate a NEW program keypair for v2**: `solana-keygen new --outfile target/deploy/munity-keypair.json`. Replace the `declare_id!(...)` value in `programs/munity/src/lib.rs` with the new pubkey. Commit only the public address as a constant in app code; the keypair file goes into `.gitignore`. Reusing `34Duo…XsHa` is not possible — that program ID is already taken on-chain.
4. Move `smart-contract/munity.rs` → `smart-contract/_archive_placeholder_munity.rs.txt` and add a `smart-contract/WARNING.md` saying it never matched any deployed program. (Decoupled from v2 source — this is just cleanup.)
5. Add `.gitignore` entries: `target/`, `**/*.so`, `target/deploy/munity-keypair.json`.
6. Run `anchor build` and `anchor test --skip-deploy` against the copied source to confirm it compiles cleanly in our environment with no modifications. Only proceed to Phase 2 (improvements) once Phase 1 is green.

### Phase 2 — v2 contract source

5. Write `programs/munity/src/lib.rs` matching the IDL surface plus the strengthening table above.
6. Split into modules: `state.rs`, `instructions/` (one file per instruction), `errors.rs`, `events.rs`, `utils.rs`.
7. State accounts: `PlatformConfig`, `Registry`, `MintState`, `GlobalCounter`. (No `WhitelistEntry` — replaced by `whitelist_root: [u8; 32]` field on `Registry`.)
8. Instructions: `initialize_platform(owner, fee_bps)`, `register_community(...)`, `buy_nft(amount, merkle_proof: Option<Vec<[u8;32]>>)`, `change_metadata`, `change_price`, `add_supply`, `change_discount`, `set_whitelist_root(new_root: [u8;32])`, `propose_owner(new_owner)`, `accept_owner()`, `change_community_fee(new_fee)`.
9. Errors: include all from existing IDL plus new ones for stricter validation (`InvalidMerkleProof`, `OwnerProposalMismatch`, etc.).
10. `anchor build` clean — zero warnings, zero unused imports.

### Phase 3 — tests

11. `tests/initialize.ts` — initialize_platform happy path; double-init fails; owner properly set.
12. `tests/register.ts` — register_community happy + failure paths (zero price, zero supply, invalid discount, registry collision).
13. `tests/buy.ts` — buy without whitelist (full price); buy with valid merkle proof (discounted); buy with invalid proof (rejected); buy past supply (rejected); buy past per-user limit (rejected); **buy with substituted creator account (rejected by Anchor constraint)**; buy with substituted platform_owner (rejected).
14. `tests/admin.ts` — change_fee, change_price, change_discount, add_supply (all creator-only or owner-only as appropriate; verify unauthorized callers fail).
15. `tests/ownership.ts` — propose_owner stages; accept_owner finalizes; propose without accept does not transfer; accept by wrong key fails.
16. `tests/whitelist.ts` — set_whitelist_root, then merkle proof verification at buy time, with an explicit constructed merkle tree.
17. Run `anchor test` clean.

### Phase 4 — devnet

18. Deploy to devnet via the deploy keypair.
19. Run `anchor test --provider.cluster devnet` — all green.
20. Manually point a local app build at devnet program ID, smoke through register-and-buy flow.

### Phase 5 — Mongo migration

21. Add `program_id` field + compound index migration (script or Mongoose `ensureIndexes` after schema change).
22. Backfill the 14 existing communities with `34Duo…XsHa`.
23. Update [src/models/community.js](src/models/community.js) schema.
24. Update read paths to use `program_id` for PDA derivation (legacy = old program ID, new = env var).
25. Add tests for dual-program ownership reads in [src/utils/community/membership.js](src/utils/community/membership.js).

### Phase 6 — mainnet

26. Pre-deploy: confirm Squads multisig is set up and Ledger is enrolled as a signer.
27. Mainnet deploy with the deploy keypair.
28. `initialize_platform` with `owner = Dc55…wsay`, `fee_bps = 45` (matching current 4.5%).
29. `solana program set-upgrade-authority --new-upgrade-authority <squads-vault-pda>` — hand authority to Squads.
30. Drain the deploy keypair to zero, never use again.
31. Update `NEXT_PUBLIC_SOLANA_PROGRAM_ID` in Vercel.
32. Smoke-test in production.
33. **Rollback path**: revert env var to `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`. App returns to old program. New program sits unused; you can re-deploy the env-var change after fixing whatever broke.

### Phase 7 — migration coordination

34. Send the 14 existing creators a notification about the migration option.
35. Ship the "Migrate to v2" UX in [src/components/settings/Community/](src/components/settings/Community/) if creators want it.

## Pre-implementation: questions for the Rust expert

(Send this section to the expert. Their answers sharpen the plan and skip blind alleys before Opus 4.7 starts implementing. Replies can be appended below each question or in a separate section.)

**Note for the expert: the deployed source is available in the founder's external `munity/` repo (see UPDATE callout above). Several questions below ask "should we change X?" — for those, please read the existing source first and either confirm the existing approach is fine or recommend a specific replacement. We don't need design from scratch on items the existing source already handles correctly; we need your eye on the items we plan to change (merkle whitelist, 2-step ownership, explicit `initialize_platform` args, account-substitution constraints, fee bound enforcement) and the items we may have missed.**

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

## Decisions explicitly NOT made yet (founder + expert input required)

- **Discount semantics** — current deployed program reads `discount` as a per-mille off (e.g., 100 = 10% off). Is that what we want, or do we want to align with the EVM contract's "discount = absolute new price" pattern? Pick one and stick with it; don't ship two-mode discount handling.
- **`buy_nft` per-user `LIMIT`** — deployed default is 50. Keep, or make per-community configurable at registration?
- **Add `pause` instruction** — should the platform owner be able to pause `buy_nft` globally in case of an emergency? (Adds attack surface but can also save funds during an exploit.) Default plan: NO pause for v2 simplicity. Reconsider for v3.
- **Royalty enforcement on resales** — Solana royalties are advisory at the marketplace level. Default plan: do nothing on-chain; let creators rely on marketplace policy. Confirm.
- **MEV / front-running on `buy_nft`** — competitive mints (e.g., a popular community at low price) may attract bots. Default plan: ignore for v2; not in scope. Document for v3.
