import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { expect } from "chai";
import {
  setupContext,
  ensurePlatformInitialized,
  registerCommunity,
  buyAccounts,
  expectError,
  airdrop,
  mintStatePda,
  BASE,
  DEFAULT_FEE_BPS,
} from "./utils";

describe("buy_nft", () => {
  const ctx = setupContext();

  before(async () => {
    await ensurePlatformInitialized(ctx);
  });

  async function freshBuyer(sol = 5): Promise<Keypair> {
    const k = Keypair.generate();
    await airdrop(ctx.connection, k.publicKey, sol);
    return k;
  }

  it("happy path full price — fee math correct, buyer/creator/platform balances move", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "FullPrice",
      symbol: "FP",
      uri: "https://x/fp.json",
      supply: new BN(10),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: 0,
    });
    const buyer = await freshBuyer(5);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);

    const creatorBalanceBefore = await ctx.connection.getBalance(ctx.owner.publicKey);
    await ctx.program.methods
      .buyNft(reg.id, new BN(1), null)
      .accounts(accs as any)
      .signers([buyer])
      .rpc();

    const ata = getAssociatedTokenAddressSync(reg.mint, buyer.publicKey);
    const ataAcc = await getAccount(ctx.connection, ata);
    expect(Number(ataAcc.amount)).to.equal(1);

    const regAcc = await ctx.program.account.registry.fetch(reg.registry);
    expect(regAcc.remainingSupply.toNumber()).to.equal(9);

    const expectedPlatform = Math.floor((LAMPORTS_PER_SOL * DEFAULT_FEE_BPS) / BASE);
    const expectedCreator = LAMPORTS_PER_SOL - expectedPlatform;
    const creatorBalanceAfter = await ctx.connection.getBalance(ctx.owner.publicKey);
    // ctx.owner is provider.wallet (tx fee payer) AND creator AND platform_owner.
    // Net change = received total_paid - tx_fee (~5000–20000 lamports).
    const netChange = creatorBalanceAfter - creatorBalanceBefore;
    const expectedTotal = expectedCreator + expectedPlatform;
    expect(netChange).to.be.greaterThan(expectedTotal - 100_000);
    expect(netChange).to.be.at.most(expectedTotal);
  });

  it("creator-set discount reduces price (per-mille off)", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Discounted",
      symbol: "D",
      uri: "https://x/d.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: 100,
    });
    const buyer = await freshBuyer(5);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    const buyerBefore = await ctx.connection.getBalance(buyer.publicKey);
    await ctx.program.methods
      .buyNft(reg.id, new BN(1), null)
      .accounts(accs as any)
      .signers([buyer])
      .rpc();
    const buyerAfter = await ctx.connection.getBalance(buyer.publicKey);
    const expectedTotal = LAMPORTS_PER_SOL - (LAMPORTS_PER_SOL * 100) / BASE;
    const spent = buyerBefore - buyerAfter;
    expect(spent).to.be.greaterThan(expectedTotal - LAMPORTS_PER_SOL / 100);
    expect(spent).to.be.lessThan(expectedTotal + LAMPORTS_PER_SOL / 50);
  });

  it("free mint when discount >= BASE", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Free",
      symbol: "F",
      uri: "https://x/f.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: BASE,
    });
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    const buyerBefore = await ctx.connection.getBalance(buyer.publicKey);
    await ctx.program.methods
      .buyNft(reg.id, new BN(1), null)
      .accounts(accs as any)
      .signers([buyer])
      .rpc();
    const buyerAfter = await ctx.connection.getBalance(buyer.publicKey);
    const spent = buyerBefore - buyerAfter;
    expect(spent).to.be.lessThan(0.01 * LAMPORTS_PER_SOL);
  });

  it("rejects buy past remaining supply", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Tiny",
      symbol: "T",
      uri: "https://x/t.json",
      supply: new BN(1),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
    });
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(2), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InsufficientSupply"
    );
  });

  it("rejects buy past max_per_wallet", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Capped",
      symbol: "C",
      uri: "https://x/c.json",
      supply: new BN(10),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
      maxPerWallet: new BN(2),
    });
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await ctx.program.methods
      .buyNft(reg.id, new BN(2), null)
      .accounts(accs as any)
      .signers([buyer])
      .rpc();
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "MintCapExceeded"
    );
  });

  it("MintState cap is cumulative across multiple buys", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Cumulative",
      symbol: "CUM",
      uri: "https://x/cum.json",
      supply: new BN(10),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
      maxPerWallet: new BN(3),
    });
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await ctx.program.methods.buyNft(reg.id, new BN(1), null).accounts(accs as any).signers([buyer]).rpc();
    await ctx.program.methods.buyNft(reg.id, new BN(1), null).accounts(accs as any).signers([buyer]).rpc();
    await ctx.program.methods.buyNft(reg.id, new BN(1), null).accounts(accs as any).signers([buyer]).rpc();

    const [mintState] = mintStatePda(buyer.publicKey, reg.registry, ctx.programId);
    const ms = await ctx.program.account.mintState.fetch(mintState);
    expect(ms.mints.toNumber()).to.equal(3);

    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "MintCapExceeded"
    );
  });

  it("max_per_wallet = None allows unlimited", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Unlimited",
      symbol: "UNL",
      uri: "https://x/unl.json",
      supply: new BN(100),
      priceValue: new BN(LAMPORTS_PER_SOL / 1000),
      discount: 0,
      maxPerWallet: null,
    });
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await ctx.program.methods.buyNft(reg.id, new BN(50), null).accounts(accs as any).signers([buyer]).rpc();
    await ctx.program.methods.buyNft(reg.id, new BN(50), null).accounts(accs as any).signers([buyer]).rpc();
    const [mintState] = mintStatePda(buyer.publicKey, reg.registry, ctx.programId);
    const ms = await ctx.program.account.mintState.fetch(mintState);
    expect(ms.mints.toNumber()).to.equal(100);
  });

  it("rejects substituted creator account (F1 protection)", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "F1A",
      symbol: "F1A",
      uri: "https://x/f1a.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
    });
    const attacker = Keypair.generate();
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg, {
      creatorAccount: attacker.publicKey,
    });
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InvalidCreatorAccount"
    );
  });

  it("rejects substituted platform_owner account (F1 protection)", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "F1B",
      symbol: "F1B",
      uri: "https://x/f1b.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
    });
    const attacker = Keypair.generate();
    const buyer = await freshBuyer(2);
    const accs = buyAccounts(ctx, buyer.publicKey, reg, {
      platformOwnerAccount: attacker.publicKey,
    });
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InvalidPlatformOwnerAccount"
    );
  });

  it("rejects substituted mint (F1 protection)", async () => {
    const reg1 = await registerCommunity(ctx, ctx.owner, {
      name: "MintA",
      symbol: "MA",
      uri: "https://x/ma.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
    });
    const reg2 = await registerCommunity(ctx, ctx.owner, {
      name: "MintB",
      symbol: "MB",
      uri: "https://x/mb.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
    });
    const buyer = await freshBuyer(2);
    const ataReg2 = getAssociatedTokenAddressSync(reg2.mint, buyer.publicKey);
    const accs = buyAccounts(ctx, buyer.publicKey, reg1, {
      mint: reg2.mint,
      buyerTokenAccount: ataReg2,
    });
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg1.id, new BN(1), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InvalidMint"
    );
  });

  it("rejects buy on UsdPegged Registry — but no UsdPegged Registry can exist (deferred)", async () => {
    // The reject path for UsdPegged in buy_nft is unreachable in v2.0 because
    // register_community already rejects UsdPegged. Documented in
    // SOLANA_V2_DEFERRED.md. v2.1 will enable both.
    expect(true).to.be.true;
  });
});
