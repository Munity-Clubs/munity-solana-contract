#!/usr/bin/env bash
# Single-shot Munity v2 deploy + initialize_platform.
#
# Why: InitializePlatform has no auth on `signer` — the `owner` arg can be
# anything. Between `anchor deploy` and `initialize_platform` an attacker
# watching mainnet can front-run with their own initialize_platform(owner=attacker)
# and take over the platform. Recovery would require a Squads program upgrade.
# Bundling the two steps drops the squat window from "however long the operator
# takes" to ~1 Solana slot.
#
# Usage:
#   WALLET=~/.config/solana/munity-mainnet-deploy.json \
#   OWNER=Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay \
#   ROYALTY=Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay \
#   FEE_BPS=45 \
#   PYTH_FEED=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d \
#   CLUSTER=mainnet \
#     bash migrations/solana/deploy-and-init.sh
#
# CLUSTER defaults to "devnet". Set CLUSTER=mainnet explicitly for the prod run.
#
# Fallback: the manual two-step procedure (anchor deploy → npx ts-node deploy.ts)
# in docs/SOLANA_V2_MAINNET_RUNBOOK.md still works if this script fails partway.
# If step 1 succeeds and step 2 fails, re-run deploy.ts directly with the same
# args — the program is already deployed and initialize_platform is idempotent
# (it bails out on AlreadyInitialized, but the squat window is now open until
# the operator re-runs).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

: "${WALLET:?Set WALLET to the deploy keypair path (e.g. ~/.config/solana/munity-mainnet-deploy.json)}"
: "${OWNER:?Set OWNER to the platform owner pubkey}"
: "${ROYALTY:?Set ROYALTY to the platform royalty wallet pubkey}"
: "${FEE_BPS:?Set FEE_BPS (e.g. 45 for 4.5%)}"
: "${PYTH_FEED:?Set PYTH_FEED to the SOL/USD Pyth feed id (32-byte hex, 0x-prefixed)}"
CLUSTER="${CLUSTER:-devnet}"

echo "================================================================"
echo "  munity v2 — deploy + initialize_platform (bundled)"
echo "================================================================"
echo "  CLUSTER=$CLUSTER"
echo "  WALLET=$WALLET"
echo "  OWNER=$OWNER"
echo "  ROYALTY=$ROYALTY"
echo "  FEE_BPS=$FEE_BPS"
echo "  PYTH_FEED=$PYTH_FEED"
echo ""

echo "==> Step 1/2: anchor deploy ($CLUSTER)"
anchor deploy --provider.cluster "$CLUSTER" --provider.wallet "$WALLET"

echo ""
echo "==> Step 2/2: initialize_platform ($CLUSTER)"
cd migrations/solana
if [ ! -d node_modules ]; then
  echo "    (installing migration deps via yarn)"
  yarn install --frozen-lockfile
fi
npx ts-node deploy.ts \
  --cluster "$CLUSTER" \
  --wallet "$WALLET" \
  --owner "$OWNER" \
  --royalty-wallet "$ROYALTY" \
  --fee-bps "$FEE_BPS" \
  --pyth-feed-id "$PYTH_FEED"

echo ""
echo "================================================================"
echo "  ✓ Deploy + initialize complete on $CLUSTER."
echo "  Capture the tx signatures from the output above for the operational ledger."
echo "  Next per the runbook: verify.ts (Phase 5 step 3)."
echo "================================================================"
