import { SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupContext,
  platformPda,
  counterPda,
  expectError,
  ZERO_PUBKEY,
  EMPTY_FEED_ID,
  DEFAULT_FEE_BPS,
  BASE,
} from "./utils";

describe("initialize_platform", () => {
  const ctx = setupContext();
  const [platformConfig] = platformPda(ctx.programId);
  const [counter] = counterPda(ctx.programId);

  function tryInit(opts: {
    fee?: number;
    owner?: any;
    royalty?: any;
  }) {
    return ctx.program.methods
      .initializePlatform(
        opts.owner ?? ctx.owner.publicKey,
        opts.royalty ?? ctx.royaltyWallet.publicKey,
        opts.fee ?? DEFAULT_FEE_BPS,
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
  }

  it("rejects fee_bps > BASE", async () => {
    await expectError(() => tryInit({ fee: BASE + 1 }), "InvalidFee");
  });

  it("rejects owner = Pubkey::default()", async () => {
    await expectError(
      () => tryInit({ owner: ZERO_PUBKEY }),
      "InvalidNewOwner"
    );
  });

  it("rejects royalty_wallet = Pubkey::default()", async () => {
    await expectError(
      () => tryInit({ royalty: ZERO_PUBKEY }),
      "InvalidPlatformRoyaltyWallet"
    );
  });

  it("happy path — initializes platform with explicit args", async () => {
    await tryInit({});
    const cfg = await ctx.program.account.platformConfig.fetch(platformConfig);
    expect(cfg.owner.toBase58()).to.equal(ctx.owner.publicKey.toBase58());
    expect(cfg.platformRoyaltyWallet.toBase58()).to.equal(
      ctx.royaltyWallet.publicKey.toBase58()
    );
    expect(cfg.communityFee).to.equal(DEFAULT_FEE_BPS);
    expect(cfg.programVersion).to.equal(2);
    expect(cfg.pendingOwner).to.be.null;
    expect(cfg.initialized).to.be.true;
    const counterAcc = await ctx.program.account.globalCounter.fetch(counter);
    expect(counterAcc.count.toNumber()).to.equal(0);
  });

  it("rejects re-init (account already exists)", async () => {
    await expectError(() => tryInit({}), "already in use");
  });
});
