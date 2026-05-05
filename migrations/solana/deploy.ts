/**
 * migrations/solana/deploy.ts
 *
 * Post-deploy initialization for Munity v2.
 *
 * The founder runs `anchor deploy` separately (see docs/SOLANA_V2_DEVNET_SMOKE.md
 * for the runbook). This script then:
 *   1. Verifies the program is deployed at the expected pubkey
 *   2. Calls initialize_platform with founder-supplied params
 *   3. Re-fetches PlatformConfig and asserts every field matches expected
 *   4. Logs program ID, PDAs, balance, and tx signature for the founder's records
 *
 * Run from migrations/solana/ (deps installed via `yarn install` there):
 *
 *   cd migrations/solana
 *   npx ts-node deploy.ts \
 *     --cluster devnet \
 *     --wallet ~/.config/solana/munity-devnet-deploy.json \
 *     --owner Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay \
 *     --royalty-wallet Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay \
 *     --fee-bps 45 \
 *     --pyth-feed-id 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
 *
 * Or via env vars:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   ANCHOR_WALLET=~/.config/solana/munity-devnet-deploy.json
 *   MUNITY_OWNER=Dc55f1...
 *   MUNITY_ROYALTY_WALLET=Dc55f1...
 *   MUNITY_FEE_BPS=45
 *   MUNITY_PYTH_FEED_ID=0xef0d...
 */
import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const IDL_PATH = path.join(REPO_ROOT, "target", "idl", "munity.json");

interface Args {
  cluster: string;
  wallet: string;
  owner: string;
  royaltyWallet: string;
  feeBps: number;
  pythFeedId: string;
}

function expandPath(p: string): string {
  if (p.startsWith("~")) return path.join(process.env.HOME ?? "", p.slice(1));
  return p;
}

function clusterUrl(arg: string): string {
  if (arg.startsWith("http")) return arg;
  switch (arg) {
    case "devnet": return "https://api.devnet.solana.com";
    case "mainnet": return "https://api.mainnet-beta.solana.com";
    case "mainnet-beta": return "https://api.mainnet-beta.solana.com";
    case "testnet": return "https://api.testnet.solana.com";
    case "localnet": return "http://127.0.0.1:8899";
    default: throw new Error(`Unknown cluster: ${arg}. Use a URL or one of: devnet, mainnet, testnet, localnet`);
  }
}

function parseHex32(hex: string): Uint8Array {
  const stripped = hex.replace(/^0x/i, "");
  if (stripped.length !== 64) {
    throw new Error(`pyth_sol_usd_feed_id must be 32 bytes (64 hex chars); got ${stripped.length} chars`);
  }
  if (!/^[0-9a-fA-F]+$/.test(stripped)) {
    throw new Error(`pyth_sol_usd_feed_id must be hex; got: ${hex}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function parseArgs(): Args {
  const cli: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg.startsWith("--")) continue;
    if (arg.includes("=")) {
      const idx = arg.indexOf("=");
      cli[arg.slice(2, idx)] = arg.slice(idx + 1);
    } else {
      cli[arg.slice(2)] = process.argv[++i] ?? "";
    }
  }
  function pick(cliKey: string, envKey: string, required: boolean): string {
    const v = cli[cliKey] ?? process.env[envKey];
    if (!v && required) {
      throw new Error(`Missing required: --${cliKey} or env ${envKey}`);
    }
    return v ?? "";
  }
  const cluster = pick("cluster", "ANCHOR_PROVIDER_URL", false) || "devnet";
  const wallet = pick("wallet", "ANCHOR_WALLET", true);
  const owner = pick("owner", "MUNITY_OWNER", true);
  const royaltyWallet = pick("royalty-wallet", "MUNITY_ROYALTY_WALLET", true);
  const feeBps = Number(pick("fee-bps", "MUNITY_FEE_BPS", true));
  const pythFeedId = pick("pyth-feed-id", "MUNITY_PYTH_FEED_ID", true);
  if (!Number.isFinite(feeBps)) throw new Error(`Invalid --fee-bps: ${feeBps}`);
  return { cluster, wallet, owner, royaltyWallet, feeBps, pythFeedId };
}

function loadKeypair(p: string): Keypair {
  const expanded = expandPath(p);
  if (!fs.existsSync(expanded)) {
    throw new Error(`Wallet keypair not found at: ${expanded}`);
  }
  const raw = fs.readFileSync(expanded, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url = clusterUrl(args.cluster);

  console.log("================================================================");
  console.log("  munity v2 — deploy (post-anchor-deploy init + verification)");
  console.log("================================================================");
  console.log("cluster URL:           ", url);
  console.log("deploy wallet path:    ", expandPath(args.wallet));

  const wallet = loadKeypair(args.wallet);
  const connection = new Connection(url, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(
      `IDL not found at ${IDL_PATH}.\n` +
      `Run \`anchor build\` from the repo root first.`
    );
  }
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, provider) as any;
  const programId = program.programId;

  console.log("deploy wallet pubkey:  ", wallet.publicKey.toBase58());
  const balanceLamports = await connection.getBalance(wallet.publicKey);
  console.log("deploy wallet balance: ", (balanceLamports / LAMPORTS_PER_SOL).toFixed(6), "SOL");
  if (balanceLamports < 0.1 * LAMPORTS_PER_SOL) {
    console.warn("[warn] deploy wallet balance is < 0.1 SOL — initialize_platform may run out of fees.");
  }

  console.log("program ID:            ", programId.toBase58());

  const programAccount = await connection.getAccountInfo(programId);
  if (!programAccount) {
    throw new Error(
      `Program account ${programId.toBase58()} not found on ${url}.\n` +
      `Run \`anchor deploy --provider.cluster ${args.cluster} --provider.wallet ${args.wallet}\` first.`
    );
  }
  if (!programAccount.executable) {
    throw new Error(`Program at ${programId.toBase58()} exists but is NOT executable. Deploy may be incomplete.`);
  }
  console.log("program executable:    ", programAccount.executable);
  console.log("program data length:   ", programAccount.data.length, "bytes");

  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    programId
  );
  const [globalCounter] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_counter")],
    programId
  );
  console.log("PlatformConfig PDA:    ", platformConfig.toBase58());
  console.log("GlobalCounter PDA:     ", globalCounter.toBase58());

  const existing = await program.account.platformConfig.fetchNullable(platformConfig);
  if (existing && existing.initialized) {
    console.log("");
    console.log("[!] PlatformConfig is already initialized. No-op.");
    console.log("    Existing on-chain state:");
    console.log("      owner:                  ", existing.owner.toBase58());
    console.log("      platform_royalty_wallet:", existing.platformRoyaltyWallet.toBase58());
    console.log("      community_fee:          ", existing.communityFee);
    console.log("      program_version:        ", existing.programVersion);
    console.log("      pending_owner:          ", existing.pendingOwner ? existing.pendingOwner.toBase58() : "None");
    console.log("      pyth_sol_usd_feed_id:   0x" + Buffer.from(existing.pythSolUsdFeedId).toString("hex"));
    console.log("      initialized:            ", existing.initialized);
    process.exit(0);
  }

  const ownerPk = new PublicKey(args.owner);
  const royaltyPk = new PublicKey(args.royaltyWallet);
  if (ownerPk.equals(PublicKey.default)) throw new Error("--owner cannot be the default Pubkey");
  if (royaltyPk.equals(PublicKey.default)) throw new Error("--royalty-wallet cannot be the default Pubkey");
  if (args.feeBps < 0 || args.feeBps > 1000) {
    throw new Error(`--fee-bps out of range [0, 1000]: ${args.feeBps}`);
  }
  const feedBytes = parseHex32(args.pythFeedId);

  console.log("");
  console.log("===== initialize_platform args =====");
  console.log("owner:                  ", ownerPk.toBase58());
  console.log("platform_royalty_wallet:", royaltyPk.toBase58());
  console.log("fee_bps:                ", args.feeBps, `(${(args.feeBps / 10).toFixed(2)}%)`);
  console.log("pyth_sol_usd_feed_id:   0x" + Buffer.from(feedBytes).toString("hex"));

  console.log("");
  console.log("===== sending initialize_platform =====");
  const txSig = await program.methods
    .initializePlatform(ownerPk, royaltyPk, args.feeBps, Array.from(feedBytes))
    .accounts({
      signer: wallet.publicKey,
      platformConfig,
      globalCounter,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc({ commitment: "confirmed" });
  console.log("tx signature:          ", txSig);
  await connection.confirmTransaction(txSig, "confirmed");

  console.log("");
  console.log("===== on-chain assertions =====");
  const cfg = await program.account.platformConfig.fetch(platformConfig);
  const counter = await program.account.globalCounter.fetch(globalCounter);

  type Check = { field: string; got: string; expected: string; ok: boolean };
  const checks: Check[] = [];
  function check(field: string, got: string, expected: string): void {
    checks.push({ field, got, expected, ok: got === expected });
  }
  check("owner", cfg.owner.toBase58(), ownerPk.toBase58());
  check("platform_royalty_wallet", cfg.platformRoyaltyWallet.toBase58(), royaltyPk.toBase58());
  check("community_fee", String(cfg.communityFee), String(args.feeBps));
  check("program_version", String(cfg.programVersion), "2");
  check(
    "pending_owner",
    cfg.pendingOwner ? cfg.pendingOwner.toBase58() : "None",
    "None"
  );
  check(
    "pyth_sol_usd_feed_id",
    "0x" + Buffer.from(cfg.pythSolUsdFeedId).toString("hex"),
    "0x" + Buffer.from(feedBytes).toString("hex")
  );
  check("initialized", String(cfg.initialized), "true");
  check("global_counter.count", counter.count.toString(), "0");

  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    const line = c.ok
      ? `  ${mark} ${c.field}: ${c.got}`
      : `  ${mark} ${c.field}: ${c.got} (expected ${c.expected})`;
    console.log(line);
    if (!c.ok) allOk = false;
  }

  if (!allOk) {
    console.error("");
    console.error("[FAIL] One or more on-chain assertions did not match the args passed.");
    console.error("       Check that --owner, --royalty-wallet, --fee-bps, --pyth-feed-id are correct.");
    process.exit(1);
  }

  console.log("");
  console.log("================================================================");
  console.log("  SUMMARY — record these for your devnet/mainnet ledger");
  console.log("================================================================");
  console.log("cluster URL:               ", url);
  console.log("program ID:                ", programId.toBase58());
  console.log("PlatformConfig PDA:        ", platformConfig.toBase58());
  console.log("GlobalCounter PDA:         ", globalCounter.toBase58());
  console.log("initialize_platform tx:    ", txSig);
  console.log("");
  console.log("[OK] Munity v2 platform initialized successfully.");
}

main().catch((err) => {
  console.error("");
  console.error("[FATAL]", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(1).join("\n"));
  }
  process.exit(1);
});
