# Codebase Context Export

Generated: 2026-05-03

## Scope

- Workspace contains two blockchain codebases: `munity/` for Anchor/Solana and `smart-contracts/` for Hardhat/EVM.
- Filesystem metadata currently reports the same created and modified timestamp for all listed code files: `2026-05-03 15:36:49`.

## Code File Inventory

| Path | Title | Declared name or role | Created | Last modified |
| --- | --- | --- | --- | --- |
| `munity/tsconfig.json` | TypeScript config | TypeScript project config | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/package.json` | Package manifest | Node package manifest; no package name declared | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/tests/munity.ts` | Anchor test suite | `describe("munity")` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/migrations/deploy.ts` | Anchor deploy script | `module.exports = async function (provider)` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/Cargo.toml` | Cargo workspace manifest | Rust workspace manifest | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/Anchor.toml` | Anchor config | Program alias `munity`; provider cluster `mainnet` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/programs/munity/src/lib.rs` | Solana program entrypoint | `pub mod munity`; `declare_id!` present | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/programs/munity/Xargo.toml` | Xargo config | Rust cross-build config | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `munity/programs/munity/Cargo.toml` | Program crate manifest | `name = "munity"` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/package.json` | Hardhat package manifest | `name = "01"` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/hardhat.config.js` | Hardhat config | Network and explorer configuration | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/scripts/verifyContract.js` | Verify script | Exports `verify` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/scripts/mineBlocks.js` | Mining helper script | `main()` increases time and mines one block | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/scripts/maindeploy.js` | Main deploy script | `main()` deploys `Munity` and exercises buy/ownership flow | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/contracts/munity.sol` | Solidity contract | `contract Munity is ERC1155, ERC2981, Ownable` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |
| `smart-contracts/test/sample-test.js` | Hardhat sample test helper | Defines `mineNBlocks(n)` | 2026-05-03 15:36:49 | 2026-05-03 15:36:49 |

## Names Found In Code

- Solana program and crate name: `munity`
- Solana test suite name: `munity`
- Solidity contract name: `Munity`
- Hardhat package name: `01`
- Solidity internal display name: ` Munity`
- Solidity internal symbol: `MU`

## Blockchain Addresses And Keys Found

### Concrete addresses and wallet references

| Value | Type | Where found |
| --- | --- | --- |
| `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa` | Solana program ID | `munity/Anchor.toml`, `munity/programs/munity/src/lib.rs`, `munity/tests/munity.ts` |
| `Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay` | Solana public key for new owner in tests | `munity/tests/munity.ts` |
| `~/.config/solana/id.json` | Local Solana wallet keypair path | `munity/Anchor.toml` |

### Hardcoded explorer/API keys

| Value | Type | Where found |
| --- | --- | --- |
| `CJ7TB195YK5BTVMHJGRZMD1XFU72BM41V1` | Commented Etherscan-style API key | `smart-contracts/hardhat.config.js` |
| `DTZ2S1S4M5DQD58AGCIF4P3I2HPVEEQGG4` | Active BNB explorer API key | `smart-contracts/hardhat.config.js` |

### Environment key names referenced

| Key name | Purpose | Where found |
| --- | --- | --- |
| `ALCHEMY_API` | Mainnet or generic Alchemy API key | `smart-contracts/hardhat.config.js` |
| `ALCHEMY_API_GOERLI` | Goerli RPC key reference | `smart-contracts/hardhat.config.js` |
| `ALCHEMY_API_SEPOLIA` | Sepolia RPC key reference | `smart-contracts/hardhat.config.js` |
| `ALCHEMY_API_MUMBAI` | Mumbai RPC key reference | `smart-contracts/hardhat.config.js` |
| `ALCHEMY_API_BINANCE` | BSC QuickNode key reference | `smart-contracts/hardhat.config.js` |
| `privateKey` | EVM deployer private key env var name | `smart-contracts/hardhat.config.js` |

### Placeholders and symbolic identifiers

| Value | Type | Where found |
| --- | --- | --- |
| `PROGRAM_ID` | README placeholder token for a Solana program ID | `munity/README.md` |
| `MPL_TOKEN_METADATA_PROGRAM_ID` | Imported symbolic program identifier | `munity/tests/munity.ts` |
| `TOKEN_PROGRAM_ID` | Imported symbolic token program identifier | `munity/tests/munity.ts` |
| `ASSOCIATED_TOKEN_PROGRAM_ID` | Imported symbolic associated token program identifier | `munity/tests/munity.ts` |

## Short Verification Notes

- The Solana side is configured for mainnet in `Anchor.toml` and uses program ID `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`.
- The EVM side contains one active hardcoded explorer API key and one commented explorer API key in `hardhat.config.js`.
- The EVM deployment config expects several RPC/API env vars plus one `privateKey` env var.