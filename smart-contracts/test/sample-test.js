const { ethers } = require("hardhat");
var describe = require ('mocha').describe;


async function mineNBlocks(n) {
  for (let index = 0; index < n; index++) {
    await ethers.provider.send('evm_mine');
  }
}



  
