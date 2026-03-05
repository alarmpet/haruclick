const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEBUG_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function writeDebugNetworkConfig(projectRoot, variantDir) {
  const xmlDir = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    variantDir,
    "res",
    "xml"
  );
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(
    path.join(xmlDir, "network_security_config.xml"),
    DEBUG_CONFIG_XML,
    "utf8"
  );
}

module.exports = function withAndroidDebugCleartextConfig(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const { projectRoot } = config.modRequest;
      writeDebugNetworkConfig(projectRoot, "debug");
      writeDebugNetworkConfig(projectRoot, "debugOptimized");
      return config;
    },
  ]);
};
