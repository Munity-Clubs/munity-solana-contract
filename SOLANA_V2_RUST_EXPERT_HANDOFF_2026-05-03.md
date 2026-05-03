# Munity Solana v2 Redeploy - Expert Review Request

Updated: 2026-05-04

Hi - looking for your eye on a Solana / Anchor v2 redeploy before implementation starts.

## TL;DR

- Munity is a community platform with an existing Solana mainnet program:
  `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`.
- The existing program's platform owner routes to the expected treasury:
  `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay`.
- The program upgrade authority is still held by the deployer wallet:
  `GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM`.
- Because the founder does not control that upgrade key, the current plan is a v2 redeploy under founder-controlled custody.
- This repo now contains the Anchor source under `munity/`; it is no longer only external source.
- No external audit is currently planned. This expert pass is meant to catch design mistakes before implementation.

## Current Repo Paths

- Main plan: `SOLANA_V2_RUST_PLAN_SMARTCONTRACTREDEPLOYMENT.md`
- Codex implementation prompt: `CODEX_HANDOFF_PROMPT_2026-05-04.md`
- Anchor workspace: `munity/`
- Solana program source: `munity/programs/munity/src/lib.rs`
- Anchor config: `munity/Anchor.toml`
- Current test file: `munity/tests/munity.ts`
- EVM contract, if needed for cross-chain comparison: `smart-contracts/contracts/munity.sol`

Important boundary: this is a contracts-only repo. The full web app and files such as `src/utils/solana/program.js`, `src/models/community.js`, and `NEXT_PUBLIC_SOLANA_PROGRAM_ID` are not present here.

## Current Source Snapshot

The current Solana source is a v1/deployed-source baseline, not v2.

It still has:

- `declare_id!("34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa")`
- `Anchor.toml` default cluster = `mainnet`
- one-step `change_owner(new_owner)`
- `initialize_platform()` with owner = signer and hardcoded fee = `45`
- per-address whitelist PDAs
- per-user limit based on current ATA balance
- no `MintState`
- no Merkle whitelist
- no `program_version`

It already has:

- PDA mint authority
- deterministic registry/mint PDAs
- Metaplex metadata creation/update
- CPI `system_program::transfer` for SOL payments
- account constraints on buy recipient accounts: mint, creator, and platform owner are tied to registry/config fields.

## Locked v2 Intent

| Area | v2 target |
| --- | --- |
| Program ID | Fresh v2 program ID; do not reuse `34Duo...XsHa`. |
| Token model | SPL fungible tokens, `decimals = 0`, one mint per community. |
| Whitelist | Merkle root on `Registry`, verified in `buy_nft`; not per-user whitelist PDAs. |
| Mint authority | PDA singleton, seed `mint_authority`, unless you see a strong reason to change. |
| Account constraints | Strict `address = ...`, `has_one`, or custom constraints everywhere cross-account references matter. |
| Fee bound | Platform fee must be `<= BASE` in setter and re-checked in payment math. |
| Per-user limit | `MintState` PDA per `(buyer, registry)` for cumulative mint limit. |
| Ownership | two-step transfer: propose + accept. |
| SOL movement | `system_program::transfer` CPI when source is a signer wallet. |
| Upgrade authority | Transfer to founder-controlled Squads vault PDA after deploy. |
| Initialization | explicit `initialize_platform(owner, fee_bps)` args. |
| Versioning | `program_version = 2` in `PlatformConfig`, unless you recommend a better pattern. |

## Questions

1. Merkle whitelist verification: what on-chain hash/proof pattern should we use in Anchor 0.30.x? Should the leaf be just `buyer_pubkey`, or include `(buyer_pubkey, allowance, registry)`?
2. Merkle empty-root semantics: is "all zero root means open mint" clean enough, or should there be an explicit `whitelist_enabled` bool?
3. `MintState`: use `init_if_needed` inside `buy_nft`, or a separate pre-initialize instruction?
4. Two-step ownership: any gotchas with `Option<Pubkey>` serialization and account sizing?
5. Squads as upgrade authority: is `solana program set-upgrade-authority --new-upgrade-authority <squads-vault-pda>` the right final step for an upgradeable program when the new authority is a PDA?
6. Explicit init args: any reason to prefer signer-as-owner over `initialize_platform(owner, fee_bps)`?
7. Account constraints: what is the idiomatic Anchor 0.30.x syntax for constraining `creator_account == registry.creator`, `platform_owner_account == platform_config.owner`, `mint == registry.mint`, and metadata PDA correctness?
8. Supply accounting: should `Registry.remaining_supply` remain source of truth, or should we also assert against SPL Mint `supply`?
9. Token-2022: any reason to switch from classic SPL Token for decimals-0 community tokens?
10. Test framework: for this project scale, should we stay with `anchor test`, or use Bankrun/Mollusk for faster failure-path coverage?
11. Account sizing: should `Registry` use fixed max string sizes, realloc on metadata updates, or another pattern?
12. Royalty basis points: current Solana code uses Metaplex `seller_fee_basis_points = 45`, which is 0.45%, while comments imply 4.5%. EVM uses 350 bps. What should we standardize to?
13. IDL compatibility: when v2 changes account fields/instructions, what is the cleanest app-side migration pattern for old and new program IDs?
14. Emergency pause: should v2 include a minimal global pause for `buy_nft`, or avoid it for simplicity?
15. Anything else in `munity/programs/munity/src/lib.rs` that looks unsafe, brittle, or surprisingly expensive?

## Expected Output

Please answer with:

1. must-fix items before v2 mainnet,
2. nice-to-have items that can wait,
3. direct answers to the questions above,
4. any recommended Anchor snippets or references for the risky parts.
