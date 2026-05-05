import { Keypair } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupContext,
  ensurePlatformInitialized,
  expectError,
  airdrop,
  platformPda,
  ZERO_PUBKEY,
} from "./utils";

describe("2-step ownership transfer", () => {
  const ctx = setupContext();
  const [platformConfig] = platformPda(ctx.programId);

  before(async () => {
    await ensurePlatformInitialized(ctx);
  });

  it("owner proposes; non-proposed cannot accept; proposed accepts; owner changes", async () => {
    const candidate = Keypair.generate();
    await airdrop(ctx.connection, candidate.publicKey, 2);

    await ctx.program.methods
      .proposeOwner(candidate.publicKey)
      .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
      .signers([ctx.owner])
      .rpc();
    const cfg1 = await ctx.program.account.platformConfig.fetch(platformConfig);
    expect(cfg1.pendingOwner?.toBase58()).to.equal(candidate.publicKey.toBase58());
    expect(cfg1.owner.toBase58()).to.equal(ctx.owner.publicKey.toBase58());

    const wrong = Keypair.generate();
    await airdrop(ctx.connection, wrong.publicKey, 1);
    await expectError(
      () =>
        ctx.program.methods
          .acceptOwner()
          .accounts({ signer: wrong.publicKey, platformConfig } as any)
          .signers([wrong])
          .rpc(),
      "OwnerProposalMismatch"
    );

    await ctx.program.methods
      .acceptOwner()
      .accounts({ signer: candidate.publicKey, platformConfig } as any)
      .signers([candidate])
      .rpc();
    const cfg2 = await ctx.program.account.platformConfig.fetch(platformConfig);
    expect(cfg2.owner.toBase58()).to.equal(candidate.publicKey.toBase58());
    expect(cfg2.pendingOwner).to.be.null;

    // restore: candidate proposes the original ctx.owner back, then accept
    await ctx.program.methods
      .proposeOwner(ctx.owner.publicKey)
      .accounts({ signer: candidate.publicKey, platformConfig } as any)
      .signers([candidate])
      .rpc();
    await ctx.program.methods
      .acceptOwner()
      .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
      .signers([ctx.owner])
      .rpc();
    const cfg3 = await ctx.program.account.platformConfig.fetch(platformConfig);
    expect(cfg3.owner.toBase58()).to.equal(ctx.owner.publicKey.toBase58());
  });

  it("propose_owner rejects Pubkey::default()", async () => {
    await expectError(
      () =>
        ctx.program.methods
          .proposeOwner(ZERO_PUBKEY)
          .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
          .signers([ctx.owner])
          .rpc(),
      "InvalidNewOwner"
    );
  });

  it("propose_owner rejects non-owner", async () => {
    const stranger = Keypair.generate();
    await airdrop(ctx.connection, stranger.publicKey, 1);
    await expectError(
      () =>
        ctx.program.methods
          .proposeOwner(stranger.publicKey)
          .accounts({ signer: stranger.publicKey, platformConfig } as any)
          .signers([stranger])
          .rpc(),
      "Unauthorized"
    );
  });

  it("accept_owner rejects when no pending", async () => {
    const stranger = Keypair.generate();
    await airdrop(ctx.connection, stranger.publicKey, 1);
    await expectError(
      () =>
        ctx.program.methods
          .acceptOwner()
          .accounts({ signer: stranger.publicKey, platformConfig } as any)
          .signers([stranger])
          .rpc(),
      "NoPendingOwner"
    );
  });

  it("cancel_pending_owner clears proposal", async () => {
    const candidate = Keypair.generate();
    await ctx.program.methods
      .proposeOwner(candidate.publicKey)
      .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
      .signers([ctx.owner])
      .rpc();
    let cfg = await ctx.program.account.platformConfig.fetch(platformConfig);
    expect(cfg.pendingOwner?.toBase58()).to.equal(candidate.publicKey.toBase58());

    await ctx.program.methods
      .cancelPendingOwner()
      .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
      .signers([ctx.owner])
      .rpc();
    cfg = await ctx.program.account.platformConfig.fetch(platformConfig);
    expect(cfg.pendingOwner).to.be.null;
  });

  it("cancel_pending_owner rejects when no pending", async () => {
    await expectError(
      () =>
        ctx.program.methods
          .cancelPendingOwner()
          .accounts({ signer: ctx.owner.publicKey, platformConfig } as any)
          .signers([ctx.owner])
          .rpc(),
      "NoPendingOwner"
    );
  });
});
