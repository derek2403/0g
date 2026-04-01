const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("FederatedLearningINFTModule", (m) => {
  const fl = m.contract("FederatedLearningINFT");
  return { fl };
});
