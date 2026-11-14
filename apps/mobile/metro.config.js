// Expo's default Metro config detects the npm workspace (watchFolders and
// nodeModulesPaths), so packages/shared bundles with no custom resolver
// (Pitch 21a spec §10, decision 4).
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
