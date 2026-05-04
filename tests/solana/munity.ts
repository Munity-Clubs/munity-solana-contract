// tests/munity.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Munity } from "../target/types/munity";
import idl from "../target/idl/munity.json";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  findMetadataPda,
  mplTokenMetadata,
  MPL_TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import BN from "bn.js";

const BASE = 1000;
const LIMIT = 50;

// ---------------- helpers ----------------
const toLamports = (n: number) => Math.floor(n * LAMPORTS_PER_SOL);
const lamportsToSol = (x: number | bigint) =>
  Number(x) / LAMPORTS_PER_SOL;

const fmtSol = (x: number | bigint) => `${lamportsToSol(x).toFixed(6)} SOL`;

// pretty logger
async function logBalances(
  label: string,
  conn: anchor.web3.Connection,
  buyer: PublicKey,
  creator: PublicKey,
  owner: PublicKey,
  buyerAta: PublicKey
) {
  const [bBuyer, bCreator, bOwner, bAta] = await Promise.all([
    conn.getBalance(buyer),
    conn.getBalance(creator),
    conn.getBalance(owner),
    conn.getTokenAccountBalance(buyerAta).catch(() => null),
  ]);

  console.log(
    `\n${label}\n` +
    `  Buyer SOL:   ${fmtSol(bBuyer)}\n` +
    `  Creator SOL: ${fmtSol(bCreator)}\n` +
    `  Owner SOL:   ${fmtSol(bOwner)}\n` +
    `  Buyer NFTs:  ${bAta?.value?.uiAmountString ?? "0"}`
  );

  return { bBuyer, bCreator, bOwner, bAta: BigInt(bAta?.value?.amount ?? "0") };
}

function logDeltaBalances(
  before: { bBuyer: number; bCreator: number; bOwner: number; bAta: bigint },
  after: { bBuyer: number; bCreator: number; bOwner: number; bAta: bigint }
) {
  console.log(
    `Δ Balances\n` +
    `  Buyer ΔSOL:   ${fmtSol(BigInt(after.bBuyer) - BigInt(before.bBuyer))}\n` +
    `  Creator ΔSOL: ${fmtSol(BigInt(after.bCreator) - BigInt(before.bCreator))}\n` +
    `  Owner ΔSOL:   ${fmtSol(BigInt(after.bOwner) - BigInt(before.bOwner))}\n` +
    `  Buyer ΔNFTs:  ${(after.bAta - before.bAta).toString()}`
  );
}

// Send a transaction with a specific keypair as fee payer & signer
async function sendAs(
  provider: anchor.AnchorProvider,
  kp: Keypair,
  buildTx: () => Promise<Transaction>
) {
  const tx = await buildTx();
  const { blockhash, lastValidBlockHeight } =
    await provider.connection.getLatestBlockhash("confirmed");
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(kp);
  const sig = await provider.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await provider.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  console.log(`   ↳ sent as ${kp.publicKey.toBase58()} → ${sig}`);
}

// ------------------------------------------

describe("munity", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey("34DuoQfRUGfLpWSsRapu1Fc3txeLfJr63pvYJJreXsHa");
  const program = new anchor.Program(idl as anchor.Idl, programId, provider) as Program<Munity>;
  const signer = provider.wallet;

  const umi = createUmi("https://api.mainnet-beta.solana.com")
    .use(walletAdapterIdentity(signer))
    .use(mplTokenMetadata());

  const metadata = {
    name: "Kobeni",
    symbol: "kBN",
    uri: "https://raw.githubusercontent.com/687c/solana-nft-native-client/main/metadata.json",
  };

  // pricing for tests
  const PRICE_SOL_1 = 0.001;
  const PRICE_LAMPORTS_1 = toLamports(PRICE_SOL_1);
  const PRICE_SOL_2 = 0.002;
  const PRICE_LAMPORTS_2 = toLamports(PRICE_SOL_2);

  let counterPDA: PublicKey;
  let mintAuthorityPDA: PublicKey;
  let registryPDA: PublicKey;
  let mintPDA: PublicKey;
  let platformConfigPDA: PublicKey;
  let mintedId = 0;

  const altOwner = Keypair.generate();
  const userNonWL = Keypair.generate();
  const userWL = Keypair.generate();

  // whitelist PDA for a buyer
  const wlPdaFor = (id: number | BN, user: PublicKey) => {
    const idLe = (BN.isBN(id) ? (id as BN) : new BN(id)).toArrayLike(Buffer, "le", 8);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist"), idLe, user.toBuffer()],
      program.programId
    )[0];
  };

  before(async () => {
    counterPDA = PublicKey.findProgramAddressSync([Buffer.from("global_counter")], programId)[0];
    mintAuthorityPDA = PublicKey.findProgramAddressSync([Buffer.from("mint_authority")], programId)[0];
    platformConfigPDA = PublicKey.findProgramAddressSync([Buffer.from("platform")], programId)[0];

    // Fund child wallets from your signer (no airdrop use)
    // await fundIfNeeded(altOwner.publicKey, 0.5);
    // await fundIfNeeded(userNonWL.publicKey, 0.5);
    // await fundIfNeeded(userWL.publicKey, 0.5);
  });

  // it("fails to register community BEFORE platform init", async () => {
  //   await expectFail(async () => {
  //     await registerCommunity(10, PRICE_LAMPORTS_1, 0);
  //   }, /ProgramNotInitialized|Account does not exist|AccountNotInitialized|unknown account/i);
  // });

  it("initializes the platform (owner = provider.wallet, fee default 3.6%)", async () => {
    const tx = await program.methods
      .initializePlatform()
      .accounts({
        signer: signer.publicKey,
        platformConfig: platformConfigPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log(`✅ Initialize Platform TX: https://explorer.solana.com/tx/${tx}?cluster=mainnet`);

    const cfg = await program.account.platformConfig.fetch(platformConfigPDA);
    if (!cfg.initialized) throw new Error("Platform not marked initialized");
    if (!cfg.owner.equals(signer.publicKey)) throw new Error("Owner mismatch after init");
    console.log("Owner:", cfg.owner.toBase58(), "Fee:", cfg.communityFee.toString());
  });

  // it("owner can change community fee", async () => {
  //   const tx = await program.methods
  //     .changeCommunityFee(new BN(42))
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //     })
  //     .rpc();
  //   await provider.connection.confirmTransaction(tx, "confirmed");
  //   console.log(`🔧 Change Fee (owner) TX: https://explorer.solana.com/tx/${tx}?cluster=mainnet`);

  //   const cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   if (!cfg.communityFee.eq(new BN(42))) throw new Error("Fee not updated by owner");
  //   console.log("Fee now:", cfg.communityFee.toString());
  // });

  // it("non-owner cannot change community fee", async () => {
  //   await expectFail(async () => {
  //     await program.methods
  //       .changeCommunityFee(new BN(15))
  //       .accounts({
  //         signer: altOwner.publicKey,
  //         platformConfig: platformConfigPDA,
  //       })
  //       .signers([altOwner])
  //       .rpc();
  //   }, /Unauthorized|custom program error/i);
  // });

  // it("logs old/new owner; fails fee change with non-owner; succeeds with new owner", async () => {
  //   let cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   const oldOwner = cfg.owner;
  //   console.log("👑 Old owner:", oldOwner.toBase58());

  //   const tx1 = await program.methods
  //     .changeOwner(altOwner.publicKey)
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //     })
  //     .rpc();
  //   await provider.connection.confirmTransaction(tx1, "confirmed");
  //   console.log(`👑 Change Owner TX: https://explorer.solana.com/tx/${tx1}?cluster=mainnet`);

  //   cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   const newOwner = cfg.owner;
  //   console.log("👑 New owner:", newOwner.toBase58());

  //   await expectFail(async () => {
  //     await program.methods
  //       .changeCommunityFee(new BN(50))
  //       .accounts({
  //         signer: signer.publicKey,
  //         platformConfig: platformConfigPDA,
  //       })
  //       .rpc();
  //   }, /Unauthorized|custom program error/i);

  //   const tx2 = await program.methods
  //     .changeCommunityFee(new BN(36))
  //     .accounts({
  //       signer: altOwner.publicKey,
  //       platformConfig: platformConfigPDA,
  //     })
  //     .signers([altOwner])
  //     .rpc();
  //   await provider.connection.confirmTransaction(tx2, "confirmed");
  //   console.log(`🔧 Change Fee (new owner) TX: https://explorer.solana.com/tx/${tx2}?cluster=mainnet`);

  //   cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   if (!cfg.communityFee.eq(new BN(36))) throw new Error("Fee not updated by **new** owner");
  //   console.log("Fee now:", cfg.communityFee.toString());
  // });

  it("changeOwner: succeeds when called by current owner, updates owner field", async () => {
    // -----------------------------------------------------------------
    // 1. Log current owner
    // -----------------------------------------------------------------
    let cfg = await program.account.platformConfig.fetch(platformConfigPDA);
    const oldOwner = cfg.owner;
    console.log("Old owner:", oldOwner.toBase58());

    // -----------------------------------------------------------------
    // 2. Call changeOwner from the *current* owner (signer)
    // -----------------------------------------------------------------
    const tx = await program.methods
      // .changeOwner(altOwner.publicKey)           // new owner key
      .changeOwner(new PublicKey("Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay"))           // TODO: add the new owner address here for mainnet deployment
      .accounts({
        signer: signer.publicKey,                // must be current owner
        platformConfig: platformConfigPDA,
      })
      .rpc();

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log(
      `Change Owner TX: https://explorer.solana.com/tx/${tx}?cluster=mainnet`
    );

    // -----------------------------------------------------------------
    // 3. Verify the owner was updated
    // -----------------------------------------------------------------
    cfg = await program.account.platformConfig.fetch(platformConfigPDA);
    const newOwner = cfg.owner;
    console.log("New owner:", newOwner.toBase58());

    // Expect the PDA now stores the altOwner's pubkey
    // if (!newOwner.equals(altOwner.publicKey)) {
    //   throw new Error("Owner was not updated!");
    // }

    //TODO: update the expected new owner public key below for mainnet deployment
    if (!newOwner.equals(new PublicKey("Dc55f1S5coiFEsuvM6jXYip93mvRxkUUYWkFsbFFwsay"))) {
      throw new Error("Owner was not updated!");
    }

    console.log("changeOwner test passed");
  });

  // it("fails to register with zero price", async () => {
  //   await expectFail(async () => {
  //     await registerCommunity(10, 0, 0);
  //   }, /PriceCantBeZero|custom program error/);
  // });

  // it("fails to register with zero supply", async () => {
  //   await expectFail(async () => {
  //     await registerCommunity(0, PRICE_LAMPORTS_1, 0);
  //   }, /SupplyCantBeZero|custom program error/);
  // });

  // it("fails to register with discount > BASE", async () => {
  //   await expectFail(async () => {
  //     await registerCommunity(10, PRICE_LAMPORTS_1, BASE + 1);
  //   }, /InvalidDiscount|custom program error/);
  // });

  // it("registers a community (price = 0.001 SOL, discount = 10%)", async () => {
  //   const id = await registerCommunity(60, PRICE_LAMPORTS_1, 100);
  //   mintedId = id;
  // });

  // it("mints NFTs from registered community (amount=2) as CREATOR (free)", async () => {
  //   const associatedTokenAccount = await getAssociatedTokenAddress(mintPDA, signer.publicKey);
  //   const cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   const reg = await program.account.registry.fetch(registryPDA);

  //   const before = await logBalances(
  //     "Before (creator free mint x2)",
  //     provider.connection,
  //     signer.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     associatedTokenAccount
  //   );

  //   const tx = await program.methods
  //     .buyNft(new BN(mintedId), new BN(2))
  //     .accounts({
  //       buyer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //       registry: registryPDA,
  //       mint: mintPDA,
  //       userTokenAccount: associatedTokenAccount,
  //       mintAuthority: mintAuthorityPDA,
  //       whitelistEntry: wlPdaFor(mintedId, signer.publicKey), // always pass
  //       creatorAccount: reg.creator,
  //       platformOwnerAccount: cfg.owner,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //       associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //       systemProgram: SystemProgram.programId,
  //       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //     })
  //     .transaction();
  //   // creator is default provider wallet, so regular send is fine
  //   await provider.sendAndConfirm(tx, []);
  //   console.log(`🛒 Buy NFT as CREATOR (2) TX: sent`);

  //   const after = await logBalances(
  //     "After (creator free mint x2)",
  //     provider.connection,
  //     signer.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     associatedTokenAccount
  //   );
  //   logDeltaBalances(before, after);
  // });

  // it("mints 1 NFT as NON-whitelisted USER (full price split)", async () => {
  //   const ata = await getAssociatedTokenAddress(mintPDA, userNonWL.publicKey);
  //   const cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   const reg = await program.account.registry.fetch(registryPDA);

  //   const before = await logBalances(
  //     "Before (non-WL buy x1)",
  //     provider.connection,
  //     userNonWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );

  //   const amount = 1;
  //   const unit = BigInt(PRICE_LAMPORTS_1);
  //   const total = unit * 1n;
  //   const fee = (total * BigInt(Number(cfg.communityFee))) / BigInt(BASE);
  //   const toCreator = total - fee;

  //   // SEND WITH BUYER AS FEE PAYER
  //   await sendAs(provider, userNonWL, async () =>
  //     program.methods
  //       .buyNft(new BN(mintedId), new BN(amount))
  //       .accounts({
  //         buyer: userNonWL.publicKey,
  //         platformConfig: platformConfigPDA,
  //         registry: registryPDA,
  //         mint: mintPDA,
  //         userTokenAccount: ata,
  //         mintAuthority: mintAuthorityPDA,
  //         whitelistEntry: wlPdaFor(mintedId, userNonWL.publicKey),
  //         creatorAccount: reg.creator,
  //         platformOwnerAccount: cfg.owner,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .transaction()
  //   );

  //   const after = await logBalances(
  //     "After (non-WL buy x1)",
  //     provider.connection,
  //     userNonWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );
  //   logDeltaBalances(before, after);

  //   // exact for both now (buyer paid tx fee)
  //   if (BigInt(after.bOwner - before.bOwner) !== fee) throw new Error("Platform owner did not receive expected fee");
  //   if (BigInt(after.bCreator - before.bCreator) !== toCreator) throw new Error("Creator did not receive expected amount");
  //   if (BigInt(before.bBuyer - after.bBuyer) < total) throw new Error("Buyer balance did not decrease by at least total");
  // });

  // it("adds whitelist for userWL, buys 1 NFT with DISCOUNT", async () => {
  //   const wlPda = wlPdaFor(mintedId, userWL.publicKey);

  //   const txWL = await program.methods
  //     .addToWhitelist(new BN(mintedId), userWL.publicKey)
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //       registry: registryPDA,
  //       whitelistEntry: wlPda,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .rpc();
  //   await provider.connection.confirmTransaction(txWL, "confirmed");
  //   console.log(`✅ Add to Whitelist TX: https://explorer.solana.com/tx/${txWL}?cluster=mainnet`);

  //   const ata = await getAssociatedTokenAddress(mintPDA, userWL.publicKey);
  //   const cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   const reg = await program.account.registry.fetch(registryPDA);

  //   const baseUnit = BigInt(PRICE_LAMPORTS_1);
  //   const discountUnit =
  //     reg.discount.gte(new BN(BASE))
  //       ? 0n
  //       : baseUnit - (baseUnit * BigInt(reg.discount.toNumber())) / BigInt(BASE);
  //   const total = discountUnit * 1n;
  //   const fee = (total * BigInt(Number(cfg.communityFee))) / BigInt(BASE);
  //   const toCreator = total - fee;

  //   const before = await logBalances(
  //     "Before (WL buy x1, discounted)",
  //     provider.connection,
  //     userWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );

  //   // SEND WITH BUYER AS FEE PAYER
  //   await sendAs(provider, userWL, async () =>
  //     program.methods
  //       .buyNft(new BN(mintedId), new BN(1))
  //       .accounts({
  //         buyer: userWL.publicKey,
  //         platformConfig: platformConfigPDA,
  //         registry: registryPDA,
  //         mint: mintPDA,
  //         userTokenAccount: ata,
  //         mintAuthority: mintAuthorityPDA,
  //         whitelistEntry: wlPda, // required
  //         creatorAccount: reg.creator,
  //         platformOwnerAccount: cfg.owner,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .transaction()
  //   );

  //   const after = await logBalances(
  //     "After (WL buy x1, discounted)",
  //     provider.connection,
  //     userWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );
  //   logDeltaBalances(before, after);

  //   if (BigInt(after.bOwner - before.bOwner) !== fee) throw new Error("Owner did not receive expected (discounted) fee");
  //   if (BigInt(after.bCreator - before.bCreator) !== toCreator) throw new Error("Creator did not receive expected (discounted) amount");
  //   if (BigInt(before.bBuyer - after.bBuyer) < total) throw new Error("Buyer did not pay at least discounted total");
  // });

  // it("removes whitelist → buys 1 NFT (no discount), then adds again → buys with discount", async () => {
  //   const wlPda = wlPdaFor(mintedId, userWL.publicKey);

  //   // Remove
  //   const txR = await program.methods
  //     .removeFromWhitelist(new BN(mintedId), userWL.publicKey)
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //       registry: registryPDA,
  //       whitelistEntry: wlPda,
  //     })
  //     .rpc();
  //   await provider.connection.confirmTransaction(txR, "confirmed");
  //   console.log(`🗑️ Remove from Whitelist TX: https://explorer.solana.com/tx/${txR}?cluster=mainnet`);

  //   // Buy full price (still pass whitelistEntry PDA as required account)
  //   const ata = await getAssociatedTokenAddress(mintPDA, userWL.publicKey);
  //   const cfg = await program.account.platformConfig.fetch(platformConfigPDA);
  //   const reg = await program.account.registry.fetch(registryPDA);

  //   const unit = BigInt(PRICE_LAMPORTS_1);
  //   const fullTotal = unit * 1n;
  //   const fullFee = (fullTotal * BigInt(Number(cfg.communityFee))) / BigInt(BASE);
  //   const fullToCreator = fullTotal - fullFee;

  //   const before1 = await logBalances(
  //     "Before (after WL removal, full price buy x1)",
  //     provider.connection,
  //     userWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );

  //   // SEND WITH BUYER AS FEE PAYER
  //   await sendAs(provider, userWL, async () =>
  //     program.methods
  //       .buyNft(new BN(mintedId), new BN(1))
  //       .accounts({
  //         buyer: userWL.publicKey,
  //         platformConfig: platformConfigPDA,
  //         registry: registryPDA,
  //         mint: mintPDA,
  //         userTokenAccount: ata,
  //         mintAuthority: mintAuthorityPDA,
  //         whitelistEntry: wlPda,
  //         creatorAccount: reg.creator,
  //         platformOwnerAccount: cfg.owner,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .transaction()
  //   );

  //   const after1 = await logBalances(
  //     "After  (after WL removal, full price buy x1)",
  //     provider.connection,
  //     userWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );
  //   logDeltaBalances(before1, after1);

  //   if (BigInt(after1.bOwner - before1.bOwner) !== fullFee) throw new Error("Owner did not receive expected full-price fee");
  //   if (BigInt(after1.bCreator - before1.bCreator) !== fullToCreator) throw new Error("Creator did not receive expected full-price amount");

  //   // Add again → discount again
  //   const txA = await program.methods
  //     .addToWhitelist(new BN(mintedId), userWL.publicKey)
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //       registry: registryPDA,
  //       whitelistEntry: wlPda,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .rpc();
  //   await provider.connection.confirmTransaction(txA, "confirmed");
  //   console.log(`✅ Add to Whitelist (again) TX: https://explorer.solana.com/tx/${txA}?cluster=mainnet`);

  //   const baseUnit = BigInt(PRICE_LAMPORTS_1);
  //   const discountUnit =
  //     reg.discount.gte(new BN(BASE))
  //       ? 0n
  //       : baseUnit - (baseUnit * BigInt(reg.discount.toNumber())) / BigInt(BASE);
  //   const discTotal = discountUnit * 1n;
  //   const discFee = (discTotal * BigInt(Number(cfg.communityFee))) / BigInt(BASE);
  //   const discToCreator = discTotal - discFee;

  //   const before2 = await logBalances(
  //     "Before (WL added again, discounted buy x1)",
  //     provider.connection,
  //     userWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );

  //   // SEND WITH BUYER AS FEE PAYER
  //   await sendAs(provider, userWL, async () =>
  //     program.methods
  //       .buyNft(new BN(mintedId), new BN(1))
  //       .accounts({
  //         buyer: userWL.publicKey,
  //         platformConfig: platformConfigPDA,
  //         registry: registryPDA,
  //         mint: mintPDA,
  //         userTokenAccount: ata,
  //         mintAuthority: mintAuthorityPDA,
  //         whitelistEntry: wlPda,
  //         creatorAccount: reg.creator,
  //         platformOwnerAccount: cfg.owner,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .transaction()
  //   );

  //   const after2 = await logBalances(
  //     "After  (WL added again, discounted buy x1)",
  //     provider.connection,
  //     userWL.publicKey,
  //     reg.creator,
  //     cfg.owner,
  //     ata
  //   );
  //   logDeltaBalances(before2, after2);

  //   if (BigInt(after2.bOwner - before2.bOwner) !== discFee) throw new Error("Owner did not receive expected discounted fee (2nd)");
  //   if (BigInt(after2.bCreator - before2.bCreator) !== discToCreator) throw new Error("Creator did not receive expected discounted amount (2nd)");
  // });

  // it("fails to mint more than remaining supply", async () => {
  //   await expectFail(async () => {
  //     const tx = await program.methods
  //       .buyNft(new BN(mintedId), new BN(1000))
  //       .accounts({
  //         buyer: signer.publicKey,
  //         platformConfig: platformConfigPDA,
  //         registry: registryPDA,
  //         mint: mintPDA,
  //         userTokenAccount: await getAssociatedTokenAddress(mintPDA, signer.publicKey),
  //         mintAuthority: mintAuthorityPDA,
  //         whitelistEntry: wlPdaFor(mintedId, signer.publicKey),
  //         creatorAccount: (await program.account.registry.fetch(registryPDA)).creator,
  //         platformOwnerAccount: (await program.account.platformConfig.fetch(platformConfigPDA)).owner,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .rpc();

  //     console.log(`❌ Should fail (InsufficientSupply). TX: https://explorer.solana.com/tx/${tx}?cluster=mainnet`);
  //   }, /InsufficientSupply|custom program error/);
  // });

  // it("fails to exceed per-user LIMIT using ATA balance check", async () => {
  //   await expectFail(async () => {
  //     const ata = await getAssociatedTokenAddress(mintPDA, signer.publicKey);
  //     const tx = await program.methods
  //       .buyNft(new BN(mintedId), new BN(LIMIT))
  //       .accounts({
  //         buyer: signer.publicKey,
  //         platformConfig: platformConfigPDA,
  //         registry: registryPDA,
  //         mint: mintPDA,
  //         userTokenAccount: ata,
  //         mintAuthority: mintAuthorityPDA,
  //         whitelistEntry: wlPdaFor(mintedId, signer.publicKey),
  //         creatorAccount: (await program.account.registry.fetch(registryPDA)).creator,
  //         platformOwnerAccount: (await program.account.platformConfig.fetch(platformConfigPDA)).owner,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .rpc();

  //     console.log(`❌ Should fail (LimitExceeded). TX: https://explorer.solana.com/tx/${tx}?cluster=mainnet`);
  //   }, /LimitExceeded|custom program error/);
  // });

  // it("changes metadata (name, symbol, uri) on-chain and in Registry", async () => {
  //   const newName = "Decrypted Labs";
  //   const newSymbol = "DL";
  //   const newUri = "https://raw.githubusercontent.com/Rabeebaqdas/Solana/refs/heads/main/non_fungible_token/nft_metadata.json";

  //   const metadataAccount = findMetadataPda(umi, { mint: publicKey(mintPDA) })[0];

  //   const tx = await program.methods
  //     .changeMetadata(new BN(mintedId), newName, newSymbol, newUri)
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //       registry: registryPDA,
  //       metadataAccount,
  //       mint: mintPDA,
  //       mintAuthority: mintAuthorityPDA,
  //       tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
  //     })
  //     .transaction();
  //   await provider.sendAndConfirm(tx, []);
  //   console.log(`📝 Change Metadata TX: sent`);

  //   const registry = await program.account.registry.fetch(registryPDA);
  //   if (registry.name !== newName || registry.symbol !== newSymbol || registry.uri !== newUri) {
  //     throw new Error("Registry fields not updated correctly");
  //   }

  //   const metaPk = new PublicKey(metadataAccount);
  //   const accInfo = await provider.connection.getAccountInfo(metaPk, "confirmed");
  //   if (!accInfo?.data) throw new Error("Missing metadata account data");
  //   const dataStr = accInfo.data.toString("utf8");
  //   if (!dataStr.includes(newUri)) {
  //     throw new Error("On-chain Metadata URI does not contain the new URI");
  //   }
  // });

  // it("changes community price to 0.002 SOL", async () => {
  //   const before = await program.account.registry.fetch(registryPDA);
  //   console.log("Before price (lamports):", before.price.toString());

  //   const tx = await program.methods
  //     .changePrice(new BN(mintedId), new BN(PRICE_LAMPORTS_2))
  //     .accounts({
  //       signer: signer.publicKey,
  //       platformConfig: platformConfigPDA,
  //       registry: registryPDA,
  //     })
  //     .transaction();
  //   await provider.sendAndConfirm(tx, []);
  //   console.log(`💵 Change Price TX: sent`);

  //   const after = await program.account.registry.fetch(registryPDA);
  //   console.log("After  price (lamports):", after.price.toString());
  //   if (!after.price.eq(new BN(PRICE_LAMPORTS_2))) throw new Error("Price did not update to 0.002 SOL");
  // });

  // ---------------- local helpers ----------------

  async function registerCommunity(
    supply: number,
    priceLamports: number,
    discount: number
  ): Promise<number> {
    let currentCounter = new BN(0);
    try {
      const counter = await program.account.globalCounter.fetch(counterPDA);
      currentCounter = new BN(counter.count);
    } catch (_) { }

    // id used by the program = counter + 1
    const nextId = currentCounter.addn(1);

    // ✅ derive both PDAs from the same id (nextId)
    mintPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("mint"), nextId.toArrayLike(Buffer, "le", 8)],
      programId
    )[0];

    registryPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("registry"), nextId.toArrayLike(Buffer, "le", 8)],
      programId
    )[0];

    // metadata PDA from the new mintPDA
    const metadataAccount = findMetadataPda(umi, { mint: publicKey(mintPDA) })[0];

    const tx = await program.methods
      .registerCommunity(
        metadata.name,
        metadata.symbol,
        metadata.uri,
        new BN(supply),
        new BN(priceLamports),
        new BN(discount)
      )
      .accounts({
        signer: signer.publicKey,
        platformConfig: platformConfigPDA,
        counter: counterPDA,
        registry: registryPDA,
        mint: mintPDA,
        mintAuthority: mintAuthorityPDA,
        metadataAccount,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .transaction();

    await provider.sendAndConfirm(tx, []);
    console.log(`✅ Register Community TX: sent`);

    return nextId.toNumber();
  }

  async function fundIfNeeded(pk: PublicKey, minSol = 0.2) {
    const bal = await provider.connection.getBalance(pk);
    const want = Math.ceil(minSol * LAMPORTS_PER_SOL);
    if (bal < want) {
      const ix = SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: pk,
        lamports: want - bal,
      });
      const tx = new Transaction().add(ix);
      await provider.sendAndConfirm(tx, []);
    }
  }

  async function expectFail(fn: () => Promise<any>, re: RegExp) {
    try {
      await fn();
      throw new Error("Expected failure but succeeded");
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (!re.test(msg)) {
        console.error("Unexpected error:", e);
        throw e;
      }
    }
  }
});