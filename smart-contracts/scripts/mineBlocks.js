

async function main() {

console.log("Started Mining........")
    // Increase time by 86400 seconds (1 day)
    await network.provider.request({
      method: "evm_increaseTime",
      params: [86400]  // Number of seconds to increase
  });

  // Mine a new block with the updated timestamp
  await network.provider.request({
      method: "evm_mine",
      params: []
  });
  console.log("Mining Completed!")


}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });