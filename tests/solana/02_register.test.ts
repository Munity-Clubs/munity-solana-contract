import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import {
  setupContext,
  ensurePlatformInitialized,
  registerCommunity,
  expectError,
  airdrop,
  registryPda,
  mintPda,
  mintAuthorityPda,
  metadataPda,
  counterPda,
  platformPda,
  TOKEN_METADATA_PROGRAM_ID,
  EMPTY_ROOT,
  PRICE_MODE,
  BASE,
  fetchMetaplexMetadata,
} from "./utils";
import { PublicKey } from "@solana/web3.js";

describe("register_community", () => {
  const ctx = setupContext();

  before(async () => {
    await ensurePlatformInitialized(ctx);
  });

  it("happy path — registers a community and writes Registry fields", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Alpha Club",
      symbol: "ALPHA",
      uri: "https://example.com/alpha.json",
      supply: new BN(100),
      priceValue: new BN(0.1 * LAMPORTS_PER_SOL),
      discount: 0,
    });
    const reg_account = await ctx.program.account.registry.fetch(reg.registry);
    expect(reg_account.id.toNumber()).to.equal(reg.id.toNumber());
    expect(reg_account.creator.toBase58()).to.equal(ctx.owner.publicKey.toBase58());
    expect(reg_account.mint.toBase58()).to.equal(reg.mint.toBase58());
    expect(reg_account.remainingSupply.toNumber()).to.equal(100);
    expect(reg_account.priceValue.toNumber()).to.equal(0.1 * LAMPORTS_PER_SOL);
    expect(reg_account.discount).to.equal(0);
    expect(Buffer.from(reg_account.whitelistRoot)).to.deep.equal(EMPTY_ROOT);
    expect(reg_account.maxPerWallet).to.be.null;
    expect(reg_account.name).to.equal("Alpha Club");
    expect(reg_account.symbol).to.equal("ALPHA");
    expect(reg_account.uri).to.equal("https://example.com/alpha.json");
  });

  it("global counter increments across registrations", async () => {
    const [counter] = counterPda(ctx.programId);
    const before = (await ctx.program.account.globalCounter.fetch(counter)).count.toNumber();
    await registerCommunity(ctx, ctx.owner, {
      name: "Beta",
      symbol: "BETA",
      uri: "https://example.com/beta.json",
      supply: new BN(50),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: 0,
    });
    const after = (await ctx.program.account.globalCounter.fetch(counter)).count.toNumber();
    expect(after).to.equal(before + 1);
  });

  it("rejects name too long (> 64)", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "a".repeat(65),
          symbol: "X",
          uri: "u",
          supply: new BN(1),
          priceValue: new BN(1),
          discount: 0,
        }),
      "NameTooLong"
    );
  });

  it("rejects symbol too long (> 16)", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "x".repeat(17),
          uri: "u",
          supply: new BN(1),
          priceValue: new BN(1),
          discount: 0,
        }),
      "SymbolTooLong"
    );
  });

  it("rejects uri too long (> 200)", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "X",
          uri: "u".repeat(201),
          supply: new BN(1),
          priceValue: new BN(1),
          discount: 0,
        }),
      "UriTooLong"
    );
  });

  it("rejects supply = 0", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "X",
          uri: "u",
          supply: new BN(0),
          priceValue: new BN(1),
          discount: 0,
        }),
      "SupplyCantBeZero"
    );
  });

  it("rejects price = 0", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "X",
          uri: "u",
          supply: new BN(1),
          priceValue: new BN(0),
          discount: 0,
        }),
      "PriceCantBeZero"
    );
  });

  it("rejects discount > BASE", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "X",
          uri: "u",
          supply: new BN(1),
          priceValue: new BN(1),
          discount: BASE + 1,
        }),
      "InvalidDiscount"
    );
  });

  it("rejects whitelist_discount_bps > BASE", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "X",
          uri: "u",
          supply: new BN(1),
          priceValue: new BN(1),
          discount: 0,
          whitelistDiscountBps: BASE + 1,
        }),
      "InvalidWhitelistDiscount"
    );
  });

  it("rejects PriceMode::UsdPegged (deferred to v2.1)", async () => {
    await expectError(
      () =>
        registerCommunity(ctx, ctx.owner, {
          name: "ok",
          symbol: "X",
          uri: "u",
          supply: new BN(1),
          priceValue: new BN(1),
          discount: 0,
          priceMode: PRICE_MODE.UsdPegged,
        }),
      "InvalidPriceMode"
    );
  });

  it("default solo creator: 80/20 creator/platform split, signer is verified", async () => {
    const reg = await registerCommunity(ctx, ctx.owner, {
      name: "Creators Test",
      symbol: "CT",
      uri: "https://example.com/ct.json",
      supply: new BN(10),
      priceValue: new BN(LAMPORTS_PER_SOL),
      discount: 0,
    });
    const metadataInfo = await ctx.connection.getAccountInfo(reg.metadata);
    expect(metadataInfo).to.not.be.null;
    expect(metadataInfo!.owner.toBase58()).to.equal(
      TOKEN_METADATA_PROGRAM_ID.toBase58()
    );

    const md = await fetchMetaplexMetadata(ctx.connection, reg.metadata);
    expect(md.name).to.equal("Creators Test");
    expect(md.symbol).to.equal("CT");
    expect(md.sellerFeeBasisPoints).to.equal(450);
    expect(md.creators).to.not.be.null;
    expect(md.creators!.length).to.equal(2);
    expect(md.creators![0].address.toBase58()).to.equal(ctx.owner.publicKey.toBase58());
    expect(md.creators![0].share).to.equal(80);
    expect(md.creators![0].verified).to.equal(true); // sign_metadata ran
    expect(md.creators![1].address.toBase58()).to.equal(ctx.royaltyWallet.publicKey.toBase58());
    expect(md.creators![1].share).to.equal(20);
    expect(md.creators![1].verified).to.equal(false);
  });

  describe("creator_splits (multi-collaborator royalties)", () => {
    it("Some(vec![signer @ 80]) is equivalent to None — 2-entry creators (signer, platform)", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "SoloExplicit",
        symbol: "SE",
        uri: "https://example.com/se.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
        creatorSplits: [{ address: ctx.owner.publicKey, share: 80 }],
      });
      const md = await fetchMetaplexMetadata(ctx.connection, reg.metadata);
      expect(md.creators!.length).to.equal(2);
      expect(md.creators![0].address.toBase58()).to.equal(ctx.owner.publicKey.toBase58());
      expect(md.creators![0].share).to.equal(80);
      expect(md.creators![1].address.toBase58()).to.equal(ctx.royaltyWallet.publicKey.toBase58());
      expect(md.creators![1].share).to.equal(20);
    });

    it("two-collaborator split: signer @ 50 + alice @ 30 + platform @ 20 = 3 creators", async () => {
      const alice = Keypair.generate();
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "Duo",
        symbol: "DUO",
        uri: "https://example.com/duo.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
        creatorSplits: [
          { address: ctx.owner.publicKey, share: 50 },
          { address: alice.publicKey, share: 30 },
        ],
      });
      const md = await fetchMetaplexMetadata(ctx.connection, reg.metadata);
      expect(md.creators!.length).to.equal(3);
      expect(md.creators![0].address.toBase58()).to.equal(ctx.owner.publicKey.toBase58());
      expect(md.creators![0].share).to.equal(50);
      expect(md.creators![0].verified).to.equal(true); // sign_metadata signed signer entry
      expect(md.creators![1].address.toBase58()).to.equal(alice.publicKey.toBase58());
      expect(md.creators![1].share).to.equal(30);
      expect(md.creators![1].verified).to.equal(false);
      expect(md.creators![2].address.toBase58()).to.equal(ctx.royaltyWallet.publicKey.toBase58());
      expect(md.creators![2].share).to.equal(20);
    });

    it("4-way split summing to 80 → 5-entry creators (max Metaplex allows)", async () => {
      const a = Keypair.generate();
      const b = Keypair.generate();
      const c = Keypair.generate();
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "FourCollab",
        symbol: "FC",
        uri: "https://example.com/fc.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
        creatorSplits: [
          { address: ctx.owner.publicKey, share: 30 },
          { address: a.publicKey, share: 25 },
          { address: b.publicKey, share: 15 },
          { address: c.publicKey, share: 10 },
        ],
      });
      const md = await fetchMetaplexMetadata(ctx.connection, reg.metadata);
      expect(md.creators!.length).to.equal(5);
      expect(md.creators!.map((cr) => cr.share)).to.deep.equal([30, 25, 15, 10, 20]);
    });

    it("rejects 5+ splits (exceeds 4 collaborator cap)", async () => {
      const k = () => Keypair.generate().publicKey;
      await expectError(
        () =>
          registerCommunity(ctx, ctx.owner, {
            name: "TooMany",
            symbol: "TM",
            uri: "https://example.com/tm.json",
            supply: new BN(1),
            priceValue: new BN(1),
            discount: 0,
            creatorSplits: [
              { address: ctx.owner.publicKey, share: 16 },
              { address: k(), share: 16 },
              { address: k(), share: 16 },
              { address: k(), share: 16 },
              { address: k(), share: 16 },
            ],
          }),
        "InvalidCreatorSplits"
      );
    });

    it("rejects splits that don't sum to CREATOR_SHARE (80)", async () => {
      const alice = Keypair.generate();
      await expectError(
        () =>
          registerCommunity(ctx, ctx.owner, {
            name: "BadSum",
            symbol: "BS",
            uri: "https://example.com/bs.json",
            supply: new BN(1),
            priceValue: new BN(1),
            discount: 0,
            creatorSplits: [
              { address: ctx.owner.publicKey, share: 50 },
              { address: alice.publicKey, share: 25 }, // 75, not 80
            ],
          }),
        "InvalidCreatorSplits"
      );
    });

    it("rejects splits not including the signer", async () => {
      const a = Keypair.generate();
      const b = Keypair.generate();
      await expectError(
        () =>
          registerCommunity(ctx, ctx.owner, {
            name: "NoSigner",
            symbol: "NS",
            uri: "https://example.com/ns.json",
            supply: new BN(1),
            priceValue: new BN(1),
            discount: 0,
            creatorSplits: [
              { address: a.publicKey, share: 50 },
              { address: b.publicKey, share: 30 },
            ],
          }),
        "InvalidCreatorSplits"
      );
    });

    it("rejects duplicate addresses in splits", async () => {
      await expectError(
        () =>
          registerCommunity(ctx, ctx.owner, {
            name: "Dup",
            symbol: "DP",
            uri: "https://example.com/dp.json",
            supply: new BN(1),
            priceValue: new BN(1),
            discount: 0,
            creatorSplits: [
              { address: ctx.owner.publicKey, share: 50 },
              { address: ctx.owner.publicKey, share: 30 },
            ],
          }),
        "InvalidCreatorSplits"
      );
    });

    it("rejects default Pubkey in splits", async () => {
      await expectError(
        () =>
          registerCommunity(ctx, ctx.owner, {
            name: "Default",
            symbol: "DF",
            uri: "https://example.com/df.json",
            supply: new BN(1),
            priceValue: new BN(1),
            discount: 0,
            creatorSplits: [
              { address: ctx.owner.publicKey, share: 50 },
              { address: PublicKey.default, share: 30 },
            ],
          }),
        "InvalidCreatorSplits"
      );
    });

    it("rejects empty splits vec", async () => {
      await expectError(
        () =>
          registerCommunity(ctx, ctx.owner, {
            name: "Empty",
            symbol: "EM",
            uri: "https://example.com/em.json",
            supply: new BN(1),
            priceValue: new BN(1),
            discount: 0,
            creatorSplits: [],
          }),
        "InvalidCreatorSplits"
      );
    });
  });
});
