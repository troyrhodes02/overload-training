/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo/ios",
  testMatch: ["<rootDir>/tests/**/*.test.ts?(x)"],
  setupFiles: ["<rootDir>/tests/setup.ts"],
  // React Native and Expo ship untranspiled ESM; the workspace's shared
  // package is TypeScript source.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|expo-router|@supabase/.*|@tanstack/.*))",
  ],
};
