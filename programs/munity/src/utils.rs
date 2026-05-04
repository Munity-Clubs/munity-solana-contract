use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_lang::system_program::{self, Transfer};

use crate::constants::{MERKLE_LEAF_PREFIX, MERKLE_NODE_PREFIX};

pub fn transfer_lamports<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }
    let cpi_ctx = CpiContext::new(system_program, Transfer { from, to });
    system_program::transfer(cpi_ctx, lamports)
}

pub fn keccak_leaf(buyer: &Pubkey) -> [u8; 32] {
    let mut buf = [0u8; 33];
    buf[0] = MERKLE_LEAF_PREFIX;
    buf[1..].copy_from_slice(buyer.as_ref());
    keccak::hashv(&[&buf]).to_bytes()
}

pub fn verify_merkle_proof(buyer: &Pubkey, proof: &[[u8; 32]], root: &[u8; 32]) -> bool {
    let mut computed = keccak_leaf(buyer);
    for sibling in proof {
        let (lo, hi) = if computed <= *sibling {
            (computed, *sibling)
        } else {
            (*sibling, computed)
        };
        let mut buf = [0u8; 65];
        buf[0] = MERKLE_NODE_PREFIX;
        buf[1..33].copy_from_slice(&lo);
        buf[33..].copy_from_slice(&hi);
        computed = keccak::hashv(&[&buf]).to_bytes();
    }
    &computed == root
}

pub fn find_metadata_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            crate::constants::METADATA_PREFIX.as_bytes(),
            mpl_token_metadata::ID.as_ref(),
            mint.as_ref(),
        ],
        &mpl_token_metadata::ID,
    )
}
