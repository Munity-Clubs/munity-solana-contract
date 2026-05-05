import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupContext,
  ensurePlatformInitialized,
  registerCommunity,
  buyAccounts,
  expectError,
  airdrop,
  EMPTY_ROOT,
  BASE,
} from "./utils";
import { buildTree, getProof, proofToArrays } from "./merkle";

describe("merkle whitelist", () => {
  const ctx = setupContext();

  before(async () => {
    await ensurePlatformInitialized(ctx);
  });

  async function freshWallet(sol = 2): Promise<Keypair> {
    const k = Keypair.generate();
    await airdrop(ctx.connection, k.publicKey, sol);
    return k;
  }

  it("set_whitelist_root by creator; non-creator rejected; bound check", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "WL",
      symbol: "WL",
      uri: "https://x/wl.json",
      supply: new BN(10),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: 0,
    });

    const newRoot = Buffer.alloc(32, 0xab);
    await ctx.program.methods
      .setWhitelistRoot(Array.from(newRoot), 200)
      .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
      .signers([ctx.owner])
      .rpc();
    const r = await ctx.program.account.registry.fetch(reg.registry);
    expect(Buffer.from(r.whitelistRoot)).to.deep.equal(newRoot);
    expect(r.whitelistDiscountBps).to.equal(200);

    const stranger = await freshWallet();
    await expectError(
      () =>
        ctx.program.methods
          .setWhitelistRoot(Array.from(EMPTY_ROOT), 0)
          .accounts({ signer: stranger.publicKey, registry: reg.registry } as any)
          .signers([stranger])
          .rpc(),
      "Unauthorized"
    );

    await expectError(
      () =>
        ctx.program.methods
          .setWhitelistRoot(Array.from(EMPTY_ROOT), BASE + 1)
          .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
          .signers([ctx.owner])
          .rpc(),
      "InvalidWhitelistDiscount"
    );
  });

  it("buy with valid merkle proof applies whitelist discount", async () => {
    const buyer = await freshWallet(3);
    const others = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    const list = [buyer.publicKey, ...others.map((k) => k.publicKey)];
    const tree = buildTree(list);

    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "WLBuy",
      symbol: "WLB",
      uri: "https://x/wlb.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: 0,
      whitelistRoot: tree.root,
      whitelistDiscountBps: 500,
    });

    const proof = getProof(tree, buyer.publicKey);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);

    const buyerBefore = await ctx.connection.getBalance(buyer.publicKey);
    await ctx.program.methods
      .buyNft(reg.id, new BN(1), proofToArrays(proof))
      .accounts(accs as any)
      .signers([buyer])
      .rpc();
    const buyerAfter = await ctx.connection.getBalance(buyer.publicKey);

    const expectedTotal = LAMPORTS_PER_SOL - (LAMPORTS_PER_SOL * 500) / BASE;
    const spent = buyerBefore - buyerAfter;
    expect(spent).to.be.greaterThan(expectedTotal - LAMPORTS_PER_SOL / 50);
    expect(spent).to.be.lessThan(expectedTotal + LAMPORTS_PER_SOL / 20);
  });

  it("buy with invalid proof rejected", async () => {
    const eligible = Keypair.generate();
    const tree = buildTree([eligible.publicKey, Keypair.generate().publicKey]);
    const buyer = await freshWallet(2);

    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "WLInvalid",
      symbol: "WLI",
      uri: "https://x/wli.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
      whitelistRoot: tree.root,
      whitelistDiscountBps: 500,
    });

    // Attempt to use eligible's proof for buyer's transaction (different leaf).
    const wrongProof = getProof(tree, eligible.publicKey);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), proofToArrays(wrongProof))
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InvalidMerkleProof"
    );
  });

  it("buy with no proof when root is non-empty rejected", async () => {
    const buyer = await freshWallet(2);
    const tree = buildTree([buyer.publicKey, Keypair.generate().publicKey]);

    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "WLNoProof",
      symbol: "WNP",
      uri: "https://x/wnp.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
      whitelistRoot: tree.root,
      whitelistDiscountBps: 500,
    });

    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), null)
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InvalidMerkleProof"
    );
  });

  it("open mint (root = [0;32]) — no proof needed, regular discount applies", async () => {
    const buyer = await freshWallet(2);
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Open",
      symbol: "OPN",
      uri: "https://x/opn.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 100,
    });
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await ctx.program.methods
      .buyNft(reg.id, new BN(1), null)
      .accounts(accs as any)
      .signers([buyer])
      .rpc();
    const r = await ctx.program.account.registry.fetch(reg.registry);
    expect(r.remainingSupply.toNumber()).to.equal(4);
  });

  it("after root rotation, old proofs no longer valid", async () => {
    const buyer = await freshWallet(2);
    const tree1 = buildTree([buyer.publicKey, Keypair.generate().publicKey]);
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Rotate",
      symbol: "RT",
      uri: "https://x/rt.json",
      supply: new BN(5),
      priceValue: new BN(LAMPORTS_PER_SOL / 100),
      discount: 0,
      whitelistRoot: tree1.root,
      whitelistDiscountBps: 500,
    });

    // First proof (valid)
    const proof1 = getProof(tree1, buyer.publicKey);
    const accs = buyAccounts(ctx, buyer.publicKey, reg);
    await ctx.program.methods
      .buyNft(reg.id, new BN(1), proofToArrays(proof1))
      .accounts(accs as any)
      .signers([buyer])
      .rpc();

    // Rotate root: new tree without buyer
    const tree2 = buildTree([Keypair.generate().publicKey, Keypair.generate().publicKey]);
    await ctx.program.methods
      .setWhitelistRoot(Array.from(tree2.root), 500)
      .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
      .signers([ctx.owner])
      .rpc();

    // Old proof should now fail
    await expectError(
      () =>
        ctx.program.methods
          .buyNft(reg.id, new BN(1), proofToArrays(proof1))
          .accounts(accs as any)
          .signers([buyer])
          .rpc(),
      "InvalidMerkleProof"
    );
  });
});
