# Munity Solana Program

Anchor workspace for the Munity Solana program.

## Safety Notice

This source currently points at the existing mainnet program:

`34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa`

`Anchor.toml` defaults to `mainnet`, and the current test file contains state-changing mainnet calls. Do not run tests or deploy commands against mainnet unless you are intentionally administering the live program with the correct wallet.

For v2 redeploy work, generate a fresh program keypair and test on localnet/devnet first. Do not reuse the existing mainnet program ID.

## Required Tools

- Rust with native build tools.
- Solana CLI.
- Anchor CLI compatible with this workspace.
- Node.js and Yarn/npm.

On the audited Windows machine, `rustc` and Node were available, but `anchor`, `solana`, and the MSVC linker `link.exe` were missing. A Linux/WSL build environment is usually simpler for Anchor work.

## Install

```shell
yarn install
```

or

```shell
npm install
```

## Common Commands

Build:

```shell
anchor build
```

Clean:

```shell
anchor clean
```

Run local tests only after the test file has been converted away from mainnet:

```shell
anchor test
```

Deploy to devnet:

```shell
anchor deploy --provider.cluster devnet
```

Generate a new program keypair for v2:

```shell
solana-keygen new --outfile target/deploy/munity-keypair.json --force
anchor keys sync
```

Never commit deploy keypair files.

## Current v1 Source Notes

- Platform fee uses `BASE = 1000`; `45` means 4.5%.
- Metaplex metadata royalty uses basis points; `45` means 0.45%, not 4.5%.
- Ownership transfer is currently one-step.
- Whitelist is currently per-address PDA based.
- Per-user limit currently checks the buyer's ATA balance, not cumulative historical mints.

See `../SOLANA_V2_RUST_PLAN_SMARTCONTRACTREDEPLOYMENT.md` for the v2 plan.
