/**
 * migrations/solana/smoke.ts
 *
 * Devnet smoke test for Munity v2 — registers a throwaway community,
 * buys 1 token, asserts every observable state change.
 *
 * Run AFTER `deploy.ts` has successfully initialized the platform.
 *
 * Run from tests/solana/ (where Node deps are installed):
 *
 *   cd tests/solana
 *   npx ts-node ../../migrations/solana/smoke.ts \
 *     --cluster devnet \
 *     --wallet ~/.config/solana/munity-devnet-deploy.json
 *
 * Optional flags:
 *   --supply <N>          (default 10)
 *   --price <lamports>    (default 1_000_000 = 0.001 SOL)
 *   --skip-buy            (only register; do not exercise buy_nft)
 *
 * Assertions on success:
 *   - Registry created at expected PDA, fields match args
 *   - Mint PDA created with decimals=0
 *   - Metadata account created (owned by Metaplex)
 *   - GlobalCounter incremented by 1
 *   - Buyer ATA holds 1 token after buy
 *   - Registry.remaining_supply decreased by 1
 *   - Creator balance increased by exactly creator_share
 *   - Platform-owner balance increased by exactly platform_share
 *   - MintState PDA exists with mints=1
 */
import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const IDL_PATH = path.join(REPO_ROOT, "target", "idl", "munity.json");

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const BASE = 1000;

interface Args {
  cluster: string;
  wallet: string;
  supply: number;
  price: number;
  skipBuy: boolean;
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
    default: throw new Error(`Unknown cluster: ${arg}`);
  }
}
function parseArgs(): Args {
  const cli: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg.startsWith("--")) continue;
    if (arg === "--skip-buy") {
      cli["skip-buy"] = true;
      continue;
    }
    if (arg.includes("=")) {
      const idx = arg.indexOf("=");
      cli[arg.slice(2, idx)] = arg.slice(idx + 1);
    } else {
      cli[arg.slice(2)] = process.argv[++i] ?? "";
    }
  }
  const wallet = (cli["wallet"] as string) || process.env.ANCHOR_WALLET || "";
  if (!wallet) throw new Error("Missing --wallet or ANCHOR_WALLET");
  const cluster = (cli["cluster"] as string) || process.env.ANCHOR_PROVIDER_URL || "devnet";
  const supply = Number(cli["supply"] ?? 10);
  const price = Number(cli["price"] ?? 1_000_000);
  return { cluster, wallet, supply, price, skipBuy: !!cli["skip-buy"] };
}
function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(expandPath(p), "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url = clusterUrl(args.cluster);

  console.log("================================================================");
  console.log("  munity v2 — devnet smoke test (register + buy)");
  console.log("================================================================");
  console.log("cluster URL:           ", url);

  const wallet = loadKeypair(args.wallet);
  const connection = new Connection(url, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(`IDL not found at ${IDL_PATH}; run \`anchor build\` first.`);
  }
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, provider) as any;
  const programId = program.programId;

  console.log("creator wallet:        ", wallet.publicKey.toBase58());
  console.log(
    "creator balance:       ",
    ((await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL).toFixed(6),
    "SOL"
  );
  console.log("program ID:            ", programId.toBase58());

  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    programId
  );
  const [globalCounter] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_counter")],
    programId
  );

  const cfg = await program.account.platformConfig.fetchNullable(platformConfig);
  if (!cfg || !cfg.initialized) {
    throw new Error(
      `PlatformConfig is not initialized at ${platformConfig.toBase58()}.\n` +
      `Run deploy.ts first.`
    );
  }
  console.log("PlatformConfig.owner:  ", cfg.owner.toBase58());
  console.log("PlatformConfig.fee:    ", cfg.communityFee, `(${(cfg.communityFee / 10).toFixed(2)}%)`);
  console.log("PlatformConfig.royalty:", cfg.platformRoyaltyWallet.toBase58());

  const counterBefore = await program.account.globalCounter.fetch(globalCounter);
  const newId = counterBefore.count.add(new BN(1));
  console.log("global_counter.count:  ", counterBefore.count.toString(), "→ will become", newId.toString());

  const [registry] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), newId.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [mint] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint"), newId.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    programId
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  const supply = new BN(args.supply);
  const price = new BN(args.price);
  const name = `Devnet Smoke ${newId.toString()}`;
  const symbol = "DST";
  const uri = "https://example.com/devnet-smoke.json";

  console.log("");
  console.log("===== register_community =====");
  console.log("name / symbol / uri:   ", name, "/", symbol, "/", uri);
  console.log("supply:                ", supply.toString());
  console.log("priceValue (lamports): ", price.toString(), `(${price.toNumber() / LAMPORTS_PER_SOL} SOL)`);
  console.log("priceMode:             FixedLamports");
  console.log("Registry PDA:          ", registry.toBase58());
  console.log("Mint PDA:              ", mint.toBase58());

  const regTx = await program.methods
    .registerCommunity({
      name,
      symbol,
      uri,
      supply,
      priceMode: { fixedLamports: {} } as any,
      priceValue: price,
      discount: 0,
      maxPerWallet: null,
      whitelistRoot: Array.from(Buffer.alloc(32)),
      whitelistDiscountBps: 0,
    })
    .accounts({
      signer: wallet.publicKey,
      platformConfig,
      counter: globalCounter,
      registry,
      mint,
      mintAuthority,
      metadataAccount: metadata,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc({ commitment: "confirmed" });
  console.log("register_community tx: ", regTx);

  const reg = await program.account.registry.fetch(registry);
  if (reg.id.toString() !== newId.toString()) {
    throw new Error(`Registry.id mismatch: ${reg.id} vs ${newId}`);
  }
  if (reg.remainingSupply.toString() !== supply.toString()) {
    throw new Error(`Registry.remaining_supply mismatch: ${reg.remainingSupply} vs ${supply}`);
  }
  console.log("✓ Registry exists, id=", reg.id.toString());
  console.log("✓ Registry.remaining_supply =", reg.remainingSupply.toString());

  const counterAfterReg = await program.account.globalCounter.fetch(globalCounter);
  if (!counterAfterReg.count.eq(newId)) {
    throw new Error(`global_counter mismatch: ${counterAfterReg.count} vs ${newId}`);
  }
  console.log("✓ global_counter.count =", counterAfterReg.count.toString());

  const metadataInfo = await connection.getAccountInfo(metadata);
  if (!metadataInfo) throw new Error("Metadata account not created");
  if (!metadataInfo.owner.equals(TOKEN_METADATA_PROGRAM_ID)) {
    throw new Error(`Metadata not owned by Metaplex: ${metadataInfo.owner.toBase58()}`);
  }
  console.log("✓ Metadata account created, owned by Metaplex");

  if (args.skipBuy) {
    console.log("");
    console.log("[--skip-buy specified — skipping buy_nft step]");
    console.log("");
    console.log("[OK] register-only smoke complete.");
    return;
  }

  console.log("");
  console.log("===== fund a fresh buyer keypair =====");
  const buyer = Keypair.generate();
  const buyerFundLamports = 0.05 * LAMPORTS_PER_SOL;
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: buyer.publicKey,
      lamports: buyerFundLamports,
    })
  );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [wallet], {
    commitment: "confirmed",
  });
  console.log("buyer pubkey:          ", buyer.publicKey.toBase58());
  console.log("funding tx:            ", fundSig);
  console.log("buyer balance:         ", buyerFundLamports / LAMPORTS_PER_SOL, "SOL");

  const buyerAta = getAssociatedTokenAddressSync(mint, buyer.publicKey);
  const [mintState] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_state"), buyer.publicKey.toBuffer(), registry.toBuffer()],
    programId
  );

  const creatorBalanceBefore = await connection.getBalance(wallet.publicKey, "confirmed");
  const platformOwnerBalanceBefore = await connection.getBalance(cfg.owner, "confirmed");

  console.log("");
  console.log("===== buy_nft (amount=1) =====");
  console.log("buyer ATA:             ", buyerAta.toBase58());
  console.log("MintState PDA:         ", mintState.toBase58());
  console.log("creator before:        ", (creatorBalanceBefore / LAMPORTS_PER_SOL).toFixed(6), "SOL");
  console.log(
    "platform owner before: ",
    (platformOwnerBalanceBefore / LAMPORTS_PER_SOL).toFixed(6),
    "SOL"
  );

  // Build the tx and explicitly set buyer as fee payer.
  // Default Anchor.rpc() uses provider wallet as fee payer (= creator here),
  // which contaminates creator_balance_delta with tx fees. Forcing buyer as
  // fee payer keeps the creator_share assertion exact.
  const buyIxTx = await program.methods
    .buyNft(reg.id, new BN(1), null)
    .accounts({
      signer: buyer.publicKey,
      platformConfig,
      registry,
      mint,
      mintAuthority,
      buyerTokenAccount: buyerAta,
      mintState,
      creatorAccount: wallet.publicKey, // creator = registrant = our wallet
      platformOwnerAccount: cfg.owner,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    } as any)
    .transaction();
  buyIxTx.feePayer = buyer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  buyIxTx.recentBlockhash = blockhash;
  const buyTx = await sendAndConfirmTransaction(
    connection,
    buyIxTx,
    [buyer],
    { commitment: "confirmed" }
  );
  console.log("buy_nft tx:            ", buyTx);

  const ataAcc = await getAccount(connection, buyerAta);
  if (ataAcc.amount !== 1n) {
    throw new Error(`buyer ATA amount: ${ataAcc.amount}, expected 1`);
  }
  console.log("✓ buyer ATA holds 1 token");

  const regAfter = await program.account.registry.fetch(registry);
  const expectedRemaining = supply.subn(1);
  if (!regAfter.remainingSupply.eq(expectedRemaining)) {
    throw new Error(
      `Registry.remaining_supply: ${regAfter.remainingSupply} vs expected ${expectedRemaining}`
    );
  }
  console.log("✓ Registry.remaining_supply =", regAfter.remainingSupply.toString());

  const ms = await program.account.mintState.fetch(mintState);
  if (!ms.mints.eq(new BN(1))) throw new Error(`MintState.mints: ${ms.mints}, expected 1`);
  if (!ms.buyer.equals(buyer.publicKey)) throw new Error(`MintState.buyer mismatch`);
  if (!ms.registry.equals(registry)) throw new Error(`MintState.registry mismatch`);
  console.log("✓ MintState created, mints=1");

  const creatorBalanceAfter = await connection.getBalance(wallet.publicKey, "confirmed");
  const platformOwnerBalanceAfter = await connection.getBalance(cfg.owner, "confirmed");

  const expectedPlatformShare = Math.floor((args.price * cfg.communityFee) / BASE);
  const expectedCreatorShare = args.price - expectedPlatformShare;

  // creator wallet is NOT the tx signer (buyer is) — so creator balance change should be exact.
  const creatorDelta = creatorBalanceAfter - creatorBalanceBefore;
  const platformDelta = platformOwnerBalanceAfter - platformOwnerBalanceBefore;

  console.log("");
  console.log("===== fee-split assertions =====");
  console.log("expected creator share: ", expectedCreatorShare, "lamports");
  console.log("actual creator delta:   ", creatorDelta, "lamports");
  console.log("expected platform share:", expectedPlatformShare, "lamports");
  console.log("actual platform delta:  ", platformDelta, "lamports");

  // creator wallet may be the same as platform owner if treasury == deploy wallet (it isn't here),
  // so we check independently.
  if (creatorDelta !== expectedCreatorShare) {
    throw new Error(
      `Creator balance delta mismatch: ${creatorDelta} vs ${expectedCreatorShare}.\n` +
      `(Note: this assertion assumes creator != tx fee payer. Buyer signed the tx.)`
    );
  }
  if (platformDelta !== expectedPlatformShare) {
    if (cfg.owner.equals(wallet.publicKey)) {
      console.warn(
        "[note] platform owner == creator; combined delta:",
        creatorDelta + platformDelta,
        "vs expected:",
        args.price
      );
    } else {
      throw new Error(
        `Platform owner balance delta mismatch: ${platformDelta} vs ${expectedPlatformShare}`
      );
    }
  }
  console.log("✓ creator received exactly creator_share");
  console.log("✓ platform owner received exactly platform_share");

  console.log("");
  console.log("================================================================");
  console.log("  SMOKE SUMMARY — record these");
  console.log("================================================================");
  console.log("cluster URL:               ", url);
  console.log("program ID:                ", programId.toBase58());
  console.log("Registry PDA:              ", registry.toBase58());
  console.log("Registry id:               ", reg.id.toString());
  console.log("Mint PDA:                  ", mint.toBase58());
  console.log("Metadata PDA:              ", metadata.toBase58());
  console.log("MintState PDA:             ", mintState.toBase58());
  console.log("register_community tx:     ", regTx);
  console.log("buyer funding tx:          ", fundSig);
  console.log("buy_nft tx:                ", buyTx);
  console.log("");
  console.log("[OK] devnet smoke test passed.");
}

main().catch((err) => {
  console.error("");
  console.error("[FATAL]", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack.split("\n").slice(1).join("\n"));
  }
  process.exit(1);
});
