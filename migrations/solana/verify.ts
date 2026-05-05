/**
 * migrations/solana/verify.ts
 *
 * READ-ONLY verification of an already-deployed Munity v2 program.
 * Asserts:
 *   - Program account exists at expected pubkey, executable, owned by BPFLoaderUpgradeable
 *   - Upgrade authority matches `--expected-authority` (if provided)
 *   - PlatformConfig is initialized with the expected fields (if --expected-* args provided)
 *   - GlobalCounter exists
 *
 * No transactions are sent. No wallet is needed.
 *
 * Run from migrations/solana/ (deps installed via `yarn install`):
 *
 *   npx ts-node verify.ts \
 *     --cluster mainnet \
 *     --expected-authority 3oeoz8sLVLsMkGVsBC5Eo3qZWU8xfw5MpZZWpFN9Euzn
 *
 * Optional assertion args (omit to skip the check, useful for "just print state"):
 *   --expected-authority <pubkey>     upgrade authority pubkey
 *   --expected-owner <pubkey>         PlatformConfig.owner
 *   --expected-royalty <pubkey>       PlatformConfig.platform_royalty_wallet
 *   --expected-fee <bps>              PlatformConfig.community_fee
 *   --expected-pyth-feed-id <hex>     PlatformConfig.pyth_sol_usd_feed_id
 */
import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const IDL_PATH = path.join(REPO_ROOT, "target", "idl", "munity.json");

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

function clusterUrl(arg: string): string {
  if (arg.startsWith("http")) return arg;
  switch (arg) {
    case "devnet": return "https://api.devnet.solana.com";
    case "mainnet": return "https://api.mainnet-beta.solana.com";
    case "mainnet-beta": return "https://api.mainnet-beta.solana.com";
    case "testnet": return "https://api.testnet.solana.com";
    case "localnet": return "http://127.0.0.1:8899";
    default: throw new Error(`Unknown cluster: ${arg}`);
  }
}

interface Args {
  cluster: string;
  expectedAuthority?: string;
  expectedOwner?: string;
  expectedRoyalty?: string;
  expectedFee?: number;
  expectedPythFeedId?: string;
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
  return {
    cluster: cli["cluster"] || process.env.ANCHOR_PROVIDER_URL || "mainnet",
    expectedAuthority: cli["expected-authority"],
    expectedOwner: cli["expected-owner"],
    expectedRoyalty: cli["expected-royalty"],
    expectedFee: cli["expected-fee"] ? Number(cli["expected-fee"]) : undefined,
    expectedPythFeedId: cli["expected-pyth-feed-id"],
  };
}

function programDataPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
  );
  return pda;
}

function readUpgradeAuthority(programDataAccount: Buffer): PublicKey | null {
  // ProgramData layout (BPF Loader Upgradeable):
  //   [0..4]   enum tag (0x03 for ProgramData)
  //   [4..12]  slot (u64 le)
  //   [12]     option<Pubkey> tag: 0 = None, 1 = Some
  //   [13..45] pubkey (if Some)
  //   [45..]   bytecode
  const optionTag = programDataAccount[12];
  if (optionTag === 0) return null;
  if (optionTag === 1) return new PublicKey(programDataAccount.subarray(13, 45));
  throw new Error(`Unexpected option tag in ProgramData account: ${optionTag}`);
}

type Check = { name: string; got: string; expected: string; ok: boolean };
const checks: Check[] = [];
function check(name: string, got: string, expected: string): void {
  checks.push({ name, got, expected, ok: got === expected });
}
function info(name: string, got: string): void {
  checks.push({ name, got, expected: "(no assertion)", ok: true });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url = clusterUrl(args.cluster);

  console.log("================================================================");
  console.log("  munity v2 — read-only verification");
  console.log("================================================================");
  console.log("cluster URL:           ", url);

  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(`IDL not found at ${IDL_PATH}; run \`anchor build\` first.`);
  }
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const connection = new Connection(url, "confirmed");

  // Stub provider — read-only operations don't actually sign.
  const stubKeypair = Keypair.generate();
  const stubWallet = new anchor.Wallet(stubKeypair);
  const provider = new anchor.AnchorProvider(connection, stubWallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as any;
  const programId = program.programId;
  console.log("program ID:            ", programId.toBase58());

  // 1. Program account
  const programAcc = await connection.getAccountInfo(programId);
  if (!programAcc) {
    throw new Error(
      `Program account ${programId.toBase58()} NOT FOUND on ${url}.\n` +
      `Has \`anchor deploy\` been run on this cluster?`
    );
  }
  check("program.executable", String(programAcc.executable), "true");
  check(
    "program.owner",
    programAcc.owner.toBase58(),
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58()
  );
  info("program.dataLength", `${programAcc.data.length} bytes`);

  // 2. Upgrade authority
  const programDataAcc = await connection.getAccountInfo(programDataPda(programId));
  if (!programDataAcc) {
    throw new Error(`ProgramData account NOT FOUND for program ${programId.toBase58()}`);
  }
  const authority = readUpgradeAuthority(programDataAcc.data);
  const authorityStr = authority ? authority.toBase58() : "None (program is FINAL / immutable)";
  if (args.expectedAuthority) {
    check("upgradeAuthority", authorityStr, args.expectedAuthority);
  } else {
    info("upgradeAuthority", authorityStr);
  }

  // 3. PlatformConfig
  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    programId
  );
  info("PlatformConfig PDA", platformConfig.toBase58());
  const cfg = await program.account.platformConfig.fetchNullable(platformConfig);
  if (!cfg) {
    console.log("\n[!] PlatformConfig NOT initialized yet.");
    console.log("    Run deploy.ts to call initialize_platform.\n");
    printChecks();
    process.exit(1);
  }
  check("PlatformConfig.initialized", String(cfg.initialized), "true");
  check("PlatformConfig.programVersion", String(cfg.programVersion), "2");
  check(
    "PlatformConfig.pendingOwner",
    cfg.pendingOwner ? cfg.pendingOwner.toBase58() : "None",
    "None"
  );
  if (args.expectedOwner) {
    check("PlatformConfig.owner", cfg.owner.toBase58(), args.expectedOwner);
  } else {
    info("PlatformConfig.owner", cfg.owner.toBase58());
  }
  if (args.expectedRoyalty) {
    check(
      "PlatformConfig.platformRoyaltyWallet",
      cfg.platformRoyaltyWallet.toBase58(),
      args.expectedRoyalty
    );
  } else {
    info(
      "PlatformConfig.platformRoyaltyWallet",
      cfg.platformRoyaltyWallet.toBase58()
    );
  }
  if (args.expectedFee !== undefined) {
    check("PlatformConfig.communityFee", String(cfg.communityFee), String(args.expectedFee));
  } else {
    info("PlatformConfig.communityFee", String(cfg.communityFee));
  }
  const onChainFeed = "0x" + Buffer.from(cfg.pythSolUsdFeedId).toString("hex");
  if (args.expectedPythFeedId) {
    const expected = args.expectedPythFeedId.startsWith("0x")
      ? args.expectedPythFeedId.toLowerCase()
      : "0x" + args.expectedPythFeedId.toLowerCase();
    check("PlatformConfig.pythSolUsdFeedId", onChainFeed, expected);
  } else {
    info("PlatformConfig.pythSolUsdFeedId", onChainFeed);
  }

  // 4. GlobalCounter
  const [globalCounter] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_counter")],
    programId
  );
  info("GlobalCounter PDA", globalCounter.toBase58());
  const counter = await program.account.globalCounter.fetchNullable(globalCounter);
  if (!counter) {
    throw new Error(`GlobalCounter PDA not found at ${globalCounter.toBase58()}`);
  }
  info("GlobalCounter.count", counter.count.toString());

  printChecks();

  const allOk = checks.every((c) => c.ok);
  if (!allOk) {
    console.error("\n[FAIL] One or more assertions did not match.");
    process.exit(1);
  }
  console.log("\n[OK] all assertions passed.");
}

function printChecks(): void {
  console.log("");
  console.log("===== state =====");
  for (const c of checks) {
    if (c.expected === "(no assertion)") {
      console.log(`    ${c.name}: ${c.got}`);
    } else {
      const mark = c.ok ? "✓" : "✗";
      const tail = c.ok ? "" : ` (expected ${c.expected})`;
      console.log(`  ${mark} ${c.name}: ${c.got}${tail}`);
    }
  }
}

main().catch((err) => {
  console.error("");
  console.error("[FATAL]", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(1).join("\n"));
  }
  process.exit(1);
});
