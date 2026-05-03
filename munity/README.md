# Build the program (produces the .so binary in target/deploy/)
anchor build

# Delete the program build
anchor clean

# Deploy the program (choose cluster: localnet, devnet, testnet, or mainnet)
anchor deploy --provider.cluster <cluster_name>

# Generate a new keypair for the program (creates munity-keypair.json)
solana-keygen new --outfile target/deploy/munity-keypair.json --force

# install the node modules if needed
yarn or npm install

# Run tests against devnet (skip redeploy, use existing deploy)
anchor test --skip-deploy --provider.cluster devnet

# View on-chain logs for a deployed program
solana logs <PROGRAM_ID> --url https://api.devnet.solana.com

# Get the compiled binary size (in bytes) of your program
wc -c < target/deploy/<your_program>.so

# Check the rent-exempt minimum balance required for that size on mainnet
solana rent <BYTES> --url https://api.mainnet-beta.solana.com

# to change the config of solana
solana config set --url https://api.mainnet-beta.solana.com

# to get the solana config
solana config get

# To sync the program id in the whole project
anchor keys sync

# To check the program is deployed
solana program show <PROGRAM_ID> --url https://api.devnet.solana.com

# To close the deployed program
solana program close <PROGRAM_ID> --bypass-warning --url https://api.devnet.solana.com

# To get the airdrop on devnet
solana airdrop 2 --url https://api.devnet.solana.com

# TIP
no need to write (https://api.devnet.solana.com) if you have already set the environment to devnet, testnet or mainnnet

# versions
Installed Versions:
Rust: rustc 1.90.0
Solana CLI: solana-cli 1.18.12
Anchor CLI: 0.29.0
Node.js: v24.4.1
Yarn: 1.22.22

