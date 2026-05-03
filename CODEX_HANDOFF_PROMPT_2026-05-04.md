# Codex Handoff Prompt - Munity Contracts

Use this prompt for the next implementation pass.

```text
You are Codex working in the repository `Munity-Smart-Contracts`.

Goal: implement the Solana v2 redeploy plan safely, starting from the current contracts-only repo.

First read:
- `SOLANA_V2_RUST_PLAN_SMARTCONTRACTREDEPLOYMENT.md`
- `SOLANA_V2_RUST_EXPERT_HANDOFF_2026-05-03.md`
- `original context for export to fullstack.md`
- `munity/programs/munity/src/lib.rs`
- `munity/Anchor.toml`
- `munity/tests/munity.ts`
- `smart-contracts/contracts/munity.sol`

Repo facts:
- This is not the full web app repo. Do not claim app integration is done here.
- The Solana source is now present under `munity/`; the old "copy external source" step is complete.
- The current Solana source is v1/deployed-source baseline, not v2.
- The current source and tests still point at live mainnet program `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`.
- Do not run or write tests that mutate mainnet.
- Do not reuse the old program ID for v2.
- Treat generated program keypair files and deploy keypairs as secrets. Never commit them.

Phase 0 - Environment and repo safety:
1. Verify Anchor CLI, Solana CLI, Rust/native build tools, Node/Yarn.
2. Add or confirm `.gitignore` entries for `target/`, compiled `.so` files, deploy keypairs, and `.env`.
3. Update `munity/Anchor.toml` to support localnet/devnet testing while preserving a clearly labeled mainnet config.
4. Remove hardcoded mainnet RPC/explorer assumptions from tests.

Phase 1 - Baseline:
1. In `munity/`, install JS dependencies.
2. Run `anchor build`.
3. Generate and inspect the IDL.
4. Establish a local-validator baseline test before changing behavior.

Phase 2 - Solana v2 contract:
Implement these requirements in `munity/`:
- fresh v2 program ID,
- `initialize_platform(owner, fee_bps)` with explicit validation,
- `program_version = 2`,
- two-step ownership transfer with `pending_owner`,
- Merkle whitelist root on `Registry` and proof verification in `buy_nft`,
- `MintState` PDA per `(buyer, registry)` for cumulative mint limit,
- strict max lengths for URI/name/symbol,
- platform fee bound in setter and payment path,
- preserve strict account constraints for mint, creator, platform owner, metadata, token program, ATA program, and system program,
- decide and document Solana royalty bps; current `45` is 0.45%, not 4.5%.

Phase 3 - Tests:
Replace the current mainnet-style test file with local-validator tests covering:
- initialize success/failure,
- ownership propose/accept success/failure,
- register community validation,
- buy full price,
- buy with valid Merkle proof,
- buy with invalid proof,
- insufficient supply,
- cumulative mint limit,
- substituted creator/platform/mint accounts rejected,
- admin updates rejected for unauthorized signers,
- metadata update behavior,
- string length failures.

Phase 4 - Devnet:
1. Deploy v2 to devnet with a fresh deploy keypair.
2. Run the full test suite against devnet.
3. Export the generated IDL and program ID for the app repo.

Phase 5 - Fullstack handoff:
Create a concise handoff for the app repo:
- new program ID,
- generated IDL location,
- PDA seeds,
- instruction/account changes,
- required Mongo `program_id` migration,
- dual-program membership reads for legacy communities,
- env var update instructions,
- rollback path to old program ID.

Phase 6 - Mainnet readiness:
Do not deploy mainnet until:
- expert review questions are resolved,
- local and devnet tests are green,
- Squads vault PDA is confirmed,
- deploy keypair handling is documented,
- app repo has been updated and smoke-tested against devnet.

Important EVM note:
The EVM contract has a reentrancy risk in `buy`, an unbounded `changeCommunityFee`, and hardcoded provider/explorer material in config. Do not treat the EVM side as production-ready unless those are fixed and tested.

Deliverables:
- code changes,
- tests,
- updated docs,
- exact commands run and results,
- a final handoff explaining what changed, what remains, and what must happen in the separate app repo.
```
