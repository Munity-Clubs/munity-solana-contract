import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

export function leafHash(pubkey: PublicKey): Buffer {
  const buf = Buffer.concat([Buffer.from([LEAF_PREFIX]), pubkey.toBuffer()]);
  return Buffer.from(keccak_256(buf));
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  const cmp = Buffer.compare(left, right);
  const [lo, hi] = cmp <= 0 ? [left, right] : [right, left];
  const buf = Buffer.concat([Buffer.from([NODE_PREFIX]), lo, hi]);
  return Buffer.from(keccak_256(buf));
}

export interface MerkleTree {
  root: Buffer;
  layers: Buffer[][];
  leaves: Buffer[];
}

export function buildTree(pubkeys: PublicKey[]): MerkleTree {
  if (pubkeys.length === 0) {
    throw new Error("empty pubkey list");
  }
  const leaves = pubkeys.map(leafHash);
  let layer = [...leaves];
  const layers: Buffer[][] = [layer];
  while (layer.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(nodeHash(layer[i], layer[i + 1]));
      } else {
        next.push(layer[i]);
      }
    }
    layer = next;
    layers.push(layer);
  }
  return { root: layer[0], layers, leaves };
}

export function getProof(tree: MerkleTree, target: PublicKey): Buffer[] {
  const targetHash = leafHash(target);
  let idx = tree.leaves.findIndex((h) => h.equals(targetHash));
  if (idx === -1) throw new Error("target not in tree");
  const proof: Buffer[] = [];
  for (let lvl = 0; lvl < tree.layers.length - 1; lvl++) {
    const layer = tree.layers[lvl];
    const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sibIdx < layer.length && sibIdx >= 0) {
      proof.push(layer[sibIdx]);
    }
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function proofToArrays(proof: Buffer[]): number[][] {
  return proof.map((b) => Array.from(b));
}
