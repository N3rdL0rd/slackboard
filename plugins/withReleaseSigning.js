// Signs the Android release build with your own keystore when SLACKBOARD_KEYSTORE is set; otherwise it keeps the debug key,
// which installs fine but cannot be uploaded to a store. Environment variables are read at build time, so no secret is
// written into the generated project.
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes("SLACKBOARD_KEYSTORE")) return c;
    g = g.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        release {
            def ks = System.getenv('SLACKBOARD_KEYSTORE')
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv('SLACKBOARD_KEYSTORE_PASSWORD')
                keyAlias System.getenv('SLACKBOARD_KEY_ALIAS')
                keyPassword System.getenv('SLACKBOARD_KEY_PASSWORD')
            }
        }
`,
    );
    const marker = /(\/\/ Caution! In production[^\n]*\n\s*\/\/ see [^\n]*\n\s*)signingConfig signingConfigs\.debug/;
    if (!marker.test(g)) throw new Error("withReleaseSigning: release signingConfig not found in app/build.gradle; the Expo template changed.");
    g = g.replace(marker, "$1signingConfig System.getenv('SLACKBOARD_KEYSTORE') ? signingConfigs.release : signingConfigs.debug");
    c.modResults.contents = g;
    return c;
  });
};
