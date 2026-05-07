import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
if (!process.env.ANCHOR_WALLET || !path.isAbsolute(process.env.ANCHOR_WALLET)) {
  process.env.ANCHOR_WALLET = path.join(REPO_ROOT, "target", "test-wallet", "id.json");
}
if (!process.env.ANCHOR_PROVIDER_URL) {
  process.env.ANCHOR_PROVIDER_URL = "http://127.0.0.1:8899";
}

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require(path.join(REPO_ROOT, "target", "idl", "munity.json"));
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Munity } from "../../target/types/munity";

export const PLATFORM_SEED = Buffer.from("platform");
export const REGISTRY_SEED = Buffer.from("registry");
export const COUNTER_SEED = Buffer.from("global_counter");
export const MINT_SEED = Buffer.from("mint");
export const MINT_AUTHORITY_SEED = Buffer.from("mint_authority");
export const MINT_STATE_SEED = Buffer.from("mint_state");

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export const BASE = 1000;
export const DEFAULT_FEE_BPS = 45;

export const ZERO_PUBKEY = PublicKey.default;
export const EMPTY_ROOT = Buffer.alloc(32);
export const EMPTY_FEED_ID = Buffer.alloc(32);

export const PRICE_MODE = {
  FixedLamports: { fixedLamports: {} } as any,
  UsdPegged: { usdPegged: {} } as any,
};

export function platformPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PLATFORM_SEED], programId);
}

export function counterPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([COUNTER_SEED], programId);
}

export function registryPda(id: BN, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, id.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function mintPda(id: BN, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_SEED, id.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function mintAuthorityPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], programId);
}

export function mintStatePda(
  buyer: PublicKey,
  registry: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_STATE_SEED, buyer.toBuffer(), registry.toBuffer()],
    programId
  );
}

export function metadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
}

export interface TestContext {
  provider: anchor.AnchorProvider;
  program: Program<Munity>;
  connection: Connection;
  owner: Keypair; // payer + initial platform owner + creator in tests
  royaltyWallet: Keypair; // distinct from owner so Metaplex creators array is unique
  programId: PublicKey;
}

const ROYALTY_WALLET = Keypair.generate();

export function setupContext(): TestContext {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idlJson, provider) as Program<Munity>;
  return {
    provider,
    program,
    connection: provider.connection,
    owner: (provider.wallet as anchor.Wallet).payer,
    royaltyWallet: ROYALTY_WALLET,
    programId: program.programId,
  };
}

export async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  sol: number = 100
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

export async function ensurePlatformInitialized(
  ctx: TestContext,
  feeBps: number = DEFAULT_FEE_BPS
): Promise<{ platformConfig: PublicKey; counter: PublicKey }> {
  const [platformConfig] = platformPda(ctx.programId);
  const [counter] = counterPda(ctx.programId);
  try {
    const cfg = await ctx.program.account.platformConfig.fetchNullable(platformConfig);
    if (cfg && cfg.initialized) {
      return { platformConfig, counter };
    }
  } catch (_) {
    // not initialized, fall through
  }
  await ctx.program.methods
    .initializePlatform(
      ctx.owner.publicKey,
      ctx.royaltyWallet.publicKey,
      feeBps,
      Array.from(EMPTY_FEED_ID)
    )
    .accounts({
      signer: ctx.owner.publicKey,
      platformConfig,
      globalCounter: counter,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([ctx.owner])
    .rpc();
  return { platformConfig, counter };
}

export interface CreatorSplitArg {
  address: PublicKey;
  share: number;
}

export interface RegisterArgs {
  name: string;
  symbol: string;
  uri: string;
  supply: BN;
  priceMode?: any;
  priceValue: BN;
  discount: number;
  maxPerWallet?: BN | null;
  whitelistRoot?: Buffer;
  whitelistDiscountBps?: number;
  creatorSplits?: CreatorSplitArg[] | null;
}

export interface RegisterResult {
  id: BN;
  registry: PublicKey;
  mint: PublicKey;
  metadata: PublicKey;
  mintAuthority: PublicKey;
}

export async function registerCommunity(
  ctx: TestContext,
  creator: Keypair,
  args: RegisterArgs
): Promise<RegisterResult> {
  const [platformConfig] = platformPda(ctx.programId);
  const [counter] = counterPda(ctx.programId);
  const counterAccount = await ctx.program.account.globalCounter.fetch(counter);
  const id = counterAccount.count.add(new BN(1));
  const [registry] = registryPda(id, ctx.programId);
  const [mint] = mintPda(id, ctx.programId);
  const [mintAuthority] = mintAuthorityPda(ctx.programId);
  const [metadata] = metadataPda(mint);

  await ctx.program.methods
    .registerCommunity({
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      supply: args.supply,
      priceMode: args.priceMode ?? PRICE_MODE.FixedLamports,
      priceValue: args.priceValue,
      discount: args.discount,
      maxPerWallet: args.maxPerWallet ?? null,
      whitelistRoot: Array.from(args.whitelistRoot ?? EMPTY_ROOT),
      whitelistDiscountBps: args.whitelistDiscountBps ?? 0,
      creatorSplits: args.creatorSplits ?? null,
    })
    .accounts({
      signer: creator.publicKey,
      platformConfig,
      counter,
      registry,
      mint,
      mintAuthority,
      metadataAccount: metadata,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    } as any)
    .signers([creator])
    .rpc();

  return { id, registry, mint, metadata, mintAuthority };
}

export interface BuyAccounts {
  signer: PublicKey;
  platformConfig: PublicKey;
  registry: PublicKey;
  mint: PublicKey;
  mintAuthority: PublicKey;
  buyerTokenAccount: PublicKey;
  mintState: PublicKey;
  creatorAccount: PublicKey;
  platformOwnerAccount: PublicKey;
  tokenProgram: PublicKey;
  associatedTokenProgram: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
}

export function buyAccounts(
  ctx: TestContext,
  buyer: PublicKey,
  reg: RegisterResult,
  overrides: Partial<BuyAccounts> = {}
): BuyAccounts {
  const [platformConfig] = platformPda(ctx.programId);
  const [mintState] = mintStatePda(buyer, reg.registry, ctx.programId);
  const buyerAta = getAssociatedTokenAddressSync(reg.mint, buyer);
  return {
    signer: buyer,
    platformConfig,
    registry: reg.registry,
    mint: reg.mint,
    mintAuthority: reg.mintAuthority,
    buyerTokenAccount: buyerAta,
    mintState,
    creatorAccount: ctx.owner.publicKey,
    platformOwnerAccount: ctx.owner.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
    ...overrides,
  };
}

export interface MetaplexCreator {
  address: PublicKey;
  verified: boolean;
  share: number;
}

export interface MetaplexMetadata {
  updateAuthority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: MetaplexCreator[] | null;
}

/**
 * Manual borsh decoder for the Metaplex MetadataV1 account layout.
 *
 * On-chain stored format ("puffed" — strings are length-prefixed but the
 * content is zero-padded out to MAX_*_LENGTH per Metaplex's puffed_out_string).
 * We trim trailing nulls to recover the actual string. Keeps the test free of
 * an extra Metaplex SDK dependency.
 *
 * Layout:
 *   1   key (4 = MetadataV1)
 *   32  update_authority
 *   32  mint
 *   4   name length (LE u32, == MAX_NAME_LENGTH = 32)
 *   32  name (zero-padded)
 *   4   symbol length (LE u32, == MAX_SYMBOL_LENGTH = 10)
 *   10  symbol (zero-padded)
 *   4   uri length (LE u32, == MAX_URI_LENGTH = 200)
 *   200 uri (zero-padded)
 *   2   seller_fee_basis_points (LE u16)
 *   1   creators option tag (0 or 1)
 *   if 1:
 *     4   creators vec length (LE u32)
 *     each creator (34 bytes): 32 address, 1 verified, 1 share
 *   ...remainder ignored
 */
export async function fetchMetaplexMetadata(
  connection: Connection,
  metadataAddr: PublicKey
): Promise<MetaplexMetadata> {
  const info = await connection.getAccountInfo(metadataAddr);
  if (!info) throw new Error(`metadata not found: ${metadataAddr.toBase58()}`);
  const buf = info.data;

  let off = 1; // skip key
  const updateAuthority = new PublicKey(buf.slice(off, off + 32));
  off += 32;
  const mint = new PublicKey(buf.slice(off, off + 32));
  off += 32;

  function readPuffedString(maxLen: number): string {
    const len = buf.readUInt32LE(off);
    off += 4;
    const raw = buf.slice(off, off + len);
    off += len;
    // strip trailing nulls (Metaplex puffs strings to MAX_*_LENGTH)
    let end = raw.length;
    while (end > 0 && raw[end - 1] === 0) end--;
    return raw.slice(0, end).toString("utf-8");
    // maxLen unused here — it's documentation; we trust the on-chain length prefix
  }

  const name = readPuffedString(32);
  const symbol = readPuffedString(10);
  const uri = readPuffedString(200);

  const sellerFeeBasisPoints = buf.readUInt16LE(off);
  off += 2;

  const creatorsTag = buf.readUInt8(off);
  off += 1;
  let creators: MetaplexCreator[] | null = null;
  if (creatorsTag === 1) {
    const n = buf.readUInt32LE(off);
    off += 4;
    creators = [];
    for (let i = 0; i < n; i++) {
      const address = new PublicKey(buf.slice(off, off + 32));
      off += 32;
      const verified = buf.readUInt8(off) === 1;
      off += 1;
      const share = buf.readUInt8(off);
      off += 1;
      creators.push({ address, verified, share });
    }
  }

  return { updateAuthority, mint, name, symbol, uri, sellerFeeBasisPoints, creators };
}

export async function expectError(
  fn: () => Promise<unknown>,
  expectedCode: string
): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    const msg = JSON.stringify(err);
    if (!msg.includes(expectedCode)) {
      throw new Error(
        `expected error matching "${expectedCode}" but got: ${msg}`
      );
    }
    return;
  }
  throw new Error(`expected error "${expectedCode}" but call succeeded`);
}
