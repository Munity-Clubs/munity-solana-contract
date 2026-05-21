# Munity Smart Contracts

Public source for the Munity v2 Solana community program.

## Current Program

| Field | Value |
| --- | --- |
| Program ID | `4PeTcJYm5rPj4AU3Lq72nhpbyUxny2vJDTW6XUdpDDpk` |
| Network | Solana mainnet-beta |
| Active source | `programs/munity` |
| Upgrade authority | `3oeoz8sLVLsMkGVsBC5Eo3qZWU8xfw5MpZZWpFN9Euzn` (Squads vault PDA) |
| License | Apache-2.0 |

The root Anchor workspace is the active v2 source. The nested `munity/`
directory is retained as historical source context for the original v1 import and
is not the live v2 program.

## Security

See [`SECURITY.md`](SECURITY.md) for the security policy and disclosure contact.

## Local Validation Notes

This repository expects the Solana and Anchor CLIs for full builds and deploy
verification. A minimal Rust check also requires the platform linker for the
installed Rust target.

Do not commit private key material, deploy keypairs, `.env` files, or generated
program binaries. The repo ignores `target/`, `.anchor/`, keypair JSON files,
and dotenv files.
