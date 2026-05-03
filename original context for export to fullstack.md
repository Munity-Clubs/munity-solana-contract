# Codebase Context Export

Generated: 2026-05-04

## Scope

This repository is a contracts-only handoff repo. It contains:

- `munity/` - Anchor/Solana program workspace.
- `smart-contracts/` - Hardhat/EVM contract workspace.

It does not contain the full web app. Fullstack paths referenced by older planning docs, such as `src/utils/solana/program.js`, `src/utils/solana/idl/munity.json`, `src/models/community.js`, and `.env.example`, are absent from this repository.

## Code File Inventory

| Path | Role |
| --- | --- |
| `munity/Anchor.toml` | Anchor config; currently defaults to mainnet and old program ID. |
| `munity/Cargo.toml` | Cargo workspace manifest. |
| `munity/programs/munity/Cargo.toml` | Solana program crate manifest. |
| `munity/programs/munity/src/lib.rs` | Anchor program source. |
| `munity/tests/munity.ts` | Current test/admin script; mainnet-oriented and mostly commented. |
| `munity/migrations/deploy.ts` | Empty Anchor deploy hook. |
| `munity/package.json` | Anchor JS test dependencies and lint scripts. |
| `smart-contracts/contracts/munity.sol` | Solidity ERC1155/ERC2981 community contract. |
| `smart-contracts/hardhat.config.js` | Hardhat config; contains hardcoded provider/explorer material. |
| `smart-contracts/scripts/maindeploy.js` | Local deploy/demo script. |
| `smart-contracts/scripts/mineBlocks.js` | Local time/mining helper. |
| `smart-contracts/scripts/verifyContract.js` | Hardhat verify helper. |
| `smart-contracts/test/sample-test.js` | Minimal helper only, not a real test suite. |
| `SOLANA_V2_RUST_PLAN_SMARTCONTRACTREDEPLOYMENT.md` | Current repo audit and v2 redeploy plan. |
| `SOLANA_V2_RUST_EXPERT_HANDOFF_2026-05-03.md` | Current expert review request. |
| `CODEX_HANDOFF_PROMPT_2026-05-04.md` | Direct prompt for next Codex implementation pass. |

## Addresses and Keys Found

| Value | Type | Where |
| --- | --- | --- |
| `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa` | Current deployed Solana program ID | `munity/Anchor.toml`, `munity/programs/munity/src/lib.rs`, `munity/tests/munity.ts` |
| `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay` | Expected Solana platform owner/treasury | `munity/tests/munity.ts`, planning docs |
| `GFu2NXpjjwsP4VsA4VzwawEEU1rV7TbFiL7nTMaxBkjM` | Current deployed program upgrade authority per prior audit | planning docs |
| `~/.config/solana/id.json` | Local Solana wallet path | `munity/Anchor.toml` |
| `hmgNbqVFAngktTuwmAB2KceU06IJx-Fh` | Hardcoded Alchemy key fragment in fork URL | `smart-contracts/hardhat.config.js` |
| `DTZ2S1S4M5DQD58AGCIF4P3I2HPVEEQGG4` | Hardcoded BNB explorer API key | `smart-contracts/hardhat.config.js` |

## Current Solana Source Summary

The Anchor source in `munity/programs/munity/src/lib.rs` is now present and should be treated as the v1/deployed-source baseline.

Current characteristics:

- program ID is still the old mainnet program ID,
- platform config owner is signer at initialization,
- default platform fee is hardcoded as `45` with `BASE = 1000`, so 4.5%,
- ownership transfer is one-step,
- whitelist uses per-user PDAs,
- buyer limit uses current ATA balance,
- payment uses `system_program::transfer`,
- buy accounts constrain mint, creator recipient, and platform owner recipient,
- Metaplex royalty value is `45` basis points, which is 0.45%, despite comments implying 4.5%.

## Current EVM Source Summary

The Solidity contract is an ERC1155/ERC2981 community contract with register, buy, whitelist, price, supply, discount, fee, and royalty functions.

Important review notes:

- `buy` performs external ETH calls before updating supply and mint counters, creating a reentrancy risk.
- `changeCommunityFee` lacks a `_newFees <= BASE` bound.
- whitelist add/remove loops are unbounded.
- Hardhat config contains hardcoded provider/explorer material that should be moved to env vars.

## Fullstack Handoff Notes

The app repo still needs a separate pass after Solana v2 is implemented:

1. Replace or add the generated v2 IDL.
2. Update PDA helper code to match v2 seeds and account shapes.
3. Store `program_id` per Solana community.
4. Backfill legacy Solana communities with old program ID `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`.
5. Query membership against both old and new program mints during migration.
6. Update environment docs and deployment config for the new v2 program ID.

## Local Validation Snapshot

- `anchor --version`: failed, command not found.
- `solana --version`: failed, command not found.
- `rustc --version`: `rustc 1.90.0`.
- `node --version`: `v22.19.0`.
- `cargo check` in `munity/`: failed before code compilation because Windows linker `link.exe` is missing.
- No `node_modules` directories were present, so Hardhat/Anchor JS tests were not run.
