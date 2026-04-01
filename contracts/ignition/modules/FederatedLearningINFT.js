const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("FederatedLearningINFTModule", (m) => {
  // Deploy MockVerifier first
  const verifier = m.contract("MockVerifier");

  // Deploy FederatedLearningINFT with verifier address
  const fl = m.contract("FederatedLearningINFT", [verifier]);

  return { verifier, fl };
});
