require("@nomiclabs/hardhat-waffle");
require('dotenv').config({path: __dirname+'/.env'})
require("@nomiclabs/hardhat-etherscan");
require('hardhat-contract-sizer');

module.exports = {
  solidity: {
    compilers: [{
      
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },},
      {
      
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },},
    {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
    {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
]
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 1337,
      gasPrice: 225000000000,
      forking: {
        // url: "https://rpc.ankr.com/avalanche-c"    //Avalanch mainnet C-chain
         url: 'https://eth-mainnet.g.alchemy.com/v2/hmgNbqVFAngktTuwmAB2KceU06IJx-Fh', //eth
        //  url: 'https://arb-mainnet.g.alchemy.com/v2/ffcQWjI00R3YSRuqQXZTCtm_BtxqFE8t', //arbitrum
        //  url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API}`, //goerli
        //   url: `https://bsc-dataseed1.binance.org/`, //bsc testnet 
          // url : "https://wiser-wider-valley.bsc.discover.quiknode.pro/050ea5d25ccade9d764fac15bd4709b810d543a1/" //bsc
      },
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_GOERLI}`,
      accounts: [`0x${process.env.privateKey}`],
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_SEPOLIA}`,
      accounts: [`0x${process.env.privateKey}`],
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_MUMBAI}`,
      accounts: [`0x${process.env.privateKey}`],
    },
    testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      gasPrice: 21000000000,
      accounts: [`0x${process.env.privateKey}`],
    },
    binance: {
      url: `https://wiser-wider-valley.bsc.discover.quiknode.pro/${process.env.ALCHEMY_API_BINANCE}`,
      chainId: 56,
      gasPrice: 21000000000,
      accounts: [`0x${process.env.privateKey}`],
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API}`,
      accounts: [`0x${process.env.privateKey}`],
    },
  },

  etherscan: {
    // apiKey: "CJ7TB195YK5BTVMHJGRZMD1XFU72BM41V1"         //ETH
    apiKey: "DTZ2S1S4M5DQD58AGCIF4P3I2HPVEEQGG4"            //BNB
  },
  mocha: {
    timeout: 1000000
  }
};
