import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupContext,
  ensurePlatformInitialized,
  registerCommunity,
  expectError,
  airdrop,
  platformPda,
  ZERO_PUBKEY,
  BASE,
  DEFAULT_FEE_BPS,
  fetchMetaplexMetadata,
  TOKEN_METADATA_PROGRAM_ID,
} from "./utils";

describe("admin gating", () => {
  const ctx = setupContext();

  before(async () => {
    await ensurePlatformInitialized(ctx);
  });

  describe("change_community_fee", () => {
    const [platformConfig] = platformPda(ctx.programId);

    it("owner can change fee", async () => {
      const newFee = 60;
      await ctx.program.methods
        .changeCommunityFee(newFee)
        .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
        .signers([ctx.owner])
        .rpc();
      const cfg = await ctx.program.account.platformConfig.fetch(platformConfig);
      expect(cfg.communityFee).to.equal(newFee);
      // restore default for downstream tests
      await ctx.program.methods
        .changeCommunityFee(DEFAULT_FEE_BPS)
        .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
        .signers([ctx.owner])
        .rpc();
    });

    it("non-owner cannot change fee", async () => {
      const stranger = Keypair.generate();
      await airdrop(ctx.connection, stranger.publicKey, 2);
      await expectError(
        () =>
          ctx.program.methods
            .changeCommunityFee(60)
            .accounts({ signer: stranger.publicKey, platformConfig } as any)
            .signers([stranger])
            .rpc(),
        "Unauthorized"
      );
    });

    it("rejects fee > BASE", async () => {
      await expectError(
        () =>
          ctx.program.methods
            .changeCommunityFee(BASE + 1)
            .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
            .signers([ctx.owner])
            .rpc(),
        "InvalidFee"
      );
    });
  });

  describe("creator-only Registry mutations", () => {
    it("creator can change_price; non-creator cannot", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "PriceTest",
        symbol: "PT",
        uri: "https://x/pt.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
      });
      await ctx.program.methods
        .changePrice(new BN(2 * LAMPORTS_PER_SOL))
        .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
        .signers([ctx.owner])
        .rpc();
      const r = await ctx.program.account.registry.fetch(reg.registry);
      expect(r.priceValue.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);

      const stranger = Keypair.generate();
      await airdrop(ctx.connection, stranger.publicKey, 1);
      await expectError(
        () =>
          ctx.program.methods
            .changePrice(new BN(LAMPORTS_PER_SOL))
            .accounts({ signer: stranger.publicKey, registry: reg.registry } as any)
            .signers([stranger])
            .rpc(),
        "Unauthorized"
      );
    });

    it("change_price rejects 0", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "ZeroP",
        symbol: "ZP",
        uri: "https://x/zp.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
      });
      await expectError(
        () =>
          ctx.program.methods
            .changePrice(new BN(0))
            .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
            .signers([ctx.owner])
            .rpc(),
        "PriceCantBeZero"
      );
    });

    it("change_discount happy + bound check", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "Disc",
        symbol: "DS",
        uri: "https://x/ds.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
      });
      await ctx.program.methods
        .changeDiscount(250)
        .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
        .signers([ctx.owner])
        .rpc();
      const r = await ctx.program.account.registry.fetch(reg.registry);
      expect(r.discount).to.equal(250);

      await expectError(
        () =>
          ctx.program.methods
            .changeDiscount(BASE + 1)
            .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
            .signers([ctx.owner])
            .rpc(),
        "InvalidDiscount"
      );
    });

    it("add_supply happy + amount=0 reject + non-creator reject", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "Sup",
        symbol: "SP",
        uri: "https://x/sp.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
      });
      await ctx.program.methods
        .addSupply(new BN(10))
        .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
        .signers([ctx.owner])
        .rpc();
      const r = await ctx.program.account.registry.fetch(reg.registry);
      expect(r.remainingSupply.toNumber()).to.equal(15);

      await expectError(
        () =>
          ctx.program.methods
            .addSupply(new BN(0))
            .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
            .signers([ctx.owner])
            .rpc(),
        "AmountCantBeZero"
      );

      const stranger = Keypair.generate();
      await airdrop(ctx.connection, stranger.publicKey, 1);
      await expectError(
        () =>
          ctx.program.methods
            .addSupply(new BN(1))
            .accounts({ signer: stranger.publicKey, registry: reg.registry } as any)
            .signers([stranger])
            .rpc(),
        "Unauthorized"
      );
    });

    it("change_max_per_wallet happy", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "Max",
        symbol: "MX",
        uri: "https://x/mx.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
      });
      await ctx.program.methods
        .changeMaxPerWallet(new BN(7))
        .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
        .signers([ctx.owner])
        .rpc();
      const r = await ctx.program.account.registry.fetch(reg.registry);
      expect(r.maxPerWallet?.toNumber()).to.equal(7);

      await ctx.program.methods
        .changeMaxPerWallet(null)
        .accounts({ signer: ctx.owner.publicKey, registry: reg.registry } as any)
        .signers([ctx.owner])
        .rpc();
      const r2 = await ctx.program.account.registry.fetch(reg.registry);
      expect(r2.maxPerWallet).to.be.null;
    });

    it("change_metadata propagates to Metaplex; creators preserved; creator-only + length checks", async () => {
      const reg = await registerCommunity(ctx, ctx.owner, {
        name: "Meta",
        symbol: "MT",
        uri: "https://x/mt.json",
        supply: new BN(5),
        priceValue: new BN(LAMPORTS_PER_SOL),
        discount: 0,
      });

      // Snapshot pre-change Metaplex creators array.
      const before = await fetchMetaplexMetadata(ctx.connection, reg.metadata);
      expect(before.name).to.equal("Meta");
      expect(before.symbol).to.equal("MT");
      expect(before.uri).to.equal("https://x/mt.json");
      expect(before.sellerFeeBasisPoints).to.equal(450);
      expect(before.creators).to.not.be.null;
      const beforeCreators = before.creators!.map((c) => ({
        address: c.address.toBase58(),
        verified: c.verified,
        share: c.share,
      }));

      await ctx.program.methods
        .changeMetadata("New Name", "NN", "https://x/new.json")
        .accounts({
          signer: ctx.owner.publicKey,
          registry: reg.registry,
          mint: reg.mint,
          mintAuthority: reg.mintAuthority,
          metadataAccount: reg.metadata,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        } as any)
        .signers([ctx.owner])
        .rpc();

      // Registry mutated.
      const r = await ctx.program.account.registry.fetch(reg.registry);
      expect(r.name).to.equal("New Name");
      expect(r.symbol).to.equal("NN");
      expect(r.uri).to.equal("https://x/new.json");

      // Metaplex on-chain metadata also propagated.
      const after = await fetchMetaplexMetadata(ctx.connection, reg.metadata);
      expect(after.name).to.equal("New Name");
      expect(after.symbol).to.equal("NN");
      expect(after.uri).to.equal("https://x/new.json");
      // Royalty bps and creators preserved across the update.
      expect(after.sellerFeeBasisPoints).to.equal(before.sellerFeeBasisPoints);
      expect(after.creators).to.not.be.null;
      const afterCreators = after.creators!.map((c) => ({
        address: c.address.toBase58(),
        verified: c.verified,
        share: c.share,
      }));
      expect(afterCreators).to.deep.equal(beforeCreators);

      // Length checks still fire pre-CPI.
      await expectError(
        () =>
          ctx.program.methods
            .changeMetadata("a".repeat(65), "S", "u")
            .accounts({
              signer: ctx.owner.publicKey,
              registry: reg.registry,
              mint: reg.mint,
              mintAuthority: reg.mintAuthority,
              metadataAccount: reg.metadata,
              tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            } as any)
            .signers([ctx.owner])
            .rpc(),
        "NameTooLong"
      );

      // Non-creator caller still rejected with Unauthorized.
      const stranger = Keypair.generate();
      await airdrop(ctx.connection, stranger.publicKey, 1);
      await expectError(
        () =>
          ctx.program.methods
            .changeMetadata("Anything", "X", "u")
            .accounts({
              signer: stranger.publicKey,
              registry: reg.registry,
              mint: reg.mint,
              mintAuthority: reg.mintAuthority,
              metadataAccount: reg.metadata,
              tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            } as any)
            .signers([stranger])
            .rpc(),
        "Unauthorized"
      );
    });
  });

  describe("set_platform_royalty_wallet", () => {
    const [platformConfig] = platformPda(ctx.programId);

    it("owner can rotate; non-owner cannot; rejects default Pubkey", async () => {
      const newWallet = Keypair.generate();
      await ctx.program.methods
        .setPlatformRoyaltyWallet(newWallet.publicKey)
        .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
        .signers([ctx.owner])
        .rpc();
      const cfg = await ctx.program.account.platformConfig.fetch(platformConfig);
      expect(cfg.platformRoyaltyWallet.toBase58()).to.equal(newWallet.publicKey.toBase58());

      // restore for downstream tests
      await ctx.program.methods
        .setPlatformRoyaltyWallet(ctx.royaltyWallet.publicKey)
        .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
        .signers([ctx.owner])
        .rpc();

      const stranger = Keypair.generate();
      await airdrop(ctx.connection, stranger.publicKey, 1);
      await expectError(
        () =>
          ctx.program.methods
            .setPlatformRoyaltyWallet(stranger.publicKey)
            .accounts({ signer: stranger.publicKey, platformConfig } as any)
            .signers([stranger])
            .rpc(),
        "Unauthorized"
      );

      await expectError(
        () =>
          ctx.program.methods
            .setPlatformRoyaltyWallet(ZERO_PUBKEY)
            .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
            .signers([ctx.owner])
            .rpc(),
        "InvalidPlatformRoyaltyWallet"
      );
    });
  });
});
