 // We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers } = require("hardhat");
const { verify } = require("./verifyContract");


const price = ethers.utils.parseUnits("2000","6")

async function main() {
  
  function getWei(eth){
    return ethers.utils.parseEther(eth)
  }

  function getEth(wei){
    return ethers.utils.formatEther(wei)
  }

  // try {
  // This is just a convenience check
  if (network.name === "hardhat") {
    console.warn(
      "You are trying to deploy a contract to the Hardhat Network, which" +
      "gets automatically created and destroyed every time. Use the Hardhat" +
      " option '--network localhost'"
      );
    } 
    
    const [deployer,per1,per2,per3] = await ethers.getSigners(); 


    ////////////////////////////////////////////Munity////////////////////////////////////////

    const Munity = await ethers.getContractFactory("Munity")
    const munity = await Munity.deploy()
    await munity.deployed()
    console.log("Munity Address", munity.address)


    
    
    await munity.connect(per1).registerCommunity(getWei("0.5"),"200", "0", "hexadecimal.com") 

    console.log("Deployer address",getEth(await ethers.provider.getBalance(deployer.getAddress())))
    console.log("per 1 address",getEth(await ethers.provider.getBalance(per1.getAddress())))
    
    await munity.connect(per2).buy("1","2", {value:getWei(String(2*0.5))}) 

    console.log("Deployer address",getEth(await ethers.provider.getBalance(deployer.getAddress())))
    console.log("per 1 address after",getEth(await ethers.provider.getBalance(per1.getAddress())))


    await munity.transferOwnership(per3.getAddress())
    console.log("=========== Ownership transferred =======")

    console.log("Deployer address",getEth(await ethers.provider.getBalance(deployer.getAddress())))
    console.log("per 3 address",getEth(await ethers.provider.getBalance(per3.getAddress())))
    
    await munity.connect(per2).buy("1","2", {value:getWei(String(2*0.5))}) 

    console.log("Deployer address",getEth(await ethers.provider.getBalance(deployer.getAddress())))
    console.log("per 3 address after",getEth(await ethers.provider.getBalance(per3.getAddress())))



   
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// npx hardhat run scripts/maindeploy.js --network hardhat
