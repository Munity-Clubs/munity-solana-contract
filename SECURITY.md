# Security Policy

This document describes how to report security issues in the Munity Solana programs and what to expect after disclosure.

## In scope

The following on-chain programs are in scope:

- **Munity v2** — `4PeTcJYm5rPj4AU3Lq72nhpbyUxny2vJDTW6XUdpDDpk` (Solana mainnet-beta, active)
- **Munity v1** — `34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa` (Solana mainnet-beta, legacy; receives critical fixes only)

In-scope vulnerability classes include, but are not limited to:

- Loss, freeze, or theft of user funds (SOL, SPL tokens, NFTs minted via these programs)
- Unauthorized state mutation (registries, communities, royalty configs, ownership records)
- Authority bypass (community owner, platform owner, pending-owner flow)
- Arithmetic / overflow / underflow leading to economic exploit
- Account confusion, missing constraints, signer/PDA validation gaps
- Denial of service that permanently bricks a community or registry account

## Out of scope

- The Munity web application, marketing site, and any off-chain infrastructure (those have separate disclosure channels — contact security@munity.club for a referral).
- Third-party programs Munity interacts with via CPI (Metaplex Token Metadata, Pyth, SPL Token program). Report those upstream.
- Social-engineering attacks against Munity team members.
- Best-practice findings without a demonstrable on-chain impact.
- Issues in unreleased or unmerged code unless explicitly published as a release candidate.

## How to report

Email **security@munity.club** with:

1. A clear description of the issue and its impact.
2. A reproduction — ideally a failing test, transaction signature on devnet, or a minimal Anchor client snippet.
3. Suggested remediation if you have one (optional).
4. Your preferred name / handle for acknowledgement (or "anonymous").

For sensitive coordination you can also DM [@munityclub on X/Twitter](https://twitter.com/munityclub); use email for anything requiring attachments or follow-up.

**Please do not** open public GitHub issues, post in Discord/Telegram, or otherwise disclose the vulnerability before we've had a chance to respond.

## Response SLA

- **Acknowledgement**: within 72 hours of receipt.
- **Initial assessment**: within 7 days (severity, scope, expected remediation timeline).
- **Fix + on-chain upgrade**: depends on severity. Critical issues affecting live communities are prioritized over all other work; the program's upgrade authority is a Solana multisig (Squads) so timing is gated on signer coordination.
- **Public disclosure**: coordinated with the reporter, typically after the upgrade has landed and active communities have had a reasonable window to verify state.

## Rewards

Munity does **not** currently operate a paid bug bounty program. We will:

- Publicly acknowledge the reporter (with permission) in this repository and in the on-chain `security_txt` `acknowledgements` field after the fix is deployed.
- Provide informal recognition through Munity's social channels where appropriate.

If a bounty program is established in the future, this policy will be updated. Reports submitted before that change will be considered for retroactive recognition at Munity's discretion, but no reward is guaranteed.

## Safe harbor

We will not pursue legal action against, or request law-enforcement investigation of, security researchers who:

1. Make a good-faith effort to comply with this policy.
2. Avoid privacy violations, destruction of data, and interruption or degradation of the Munity service.
3. Use only their own accounts, devnet, or test accounts explicitly provisioned for testing — do not target real user funds or community state on mainnet.
4. Give us a reasonable opportunity to remediate before public disclosure.

If you are uncertain whether your planned testing falls within scope, email security@munity.club **before** testing and we will work with you to define a safe envelope.

## Acknowledgements

Researchers who have responsibly disclosed vulnerabilities will be listed here and in the on-chain `security_txt` block once their report has been remediated.

_(none yet)_
