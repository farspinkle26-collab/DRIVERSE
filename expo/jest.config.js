/**
 * Jest config for the Expo app.
 *
 * Uses the `jest-expo` preset so the React Native / Expo module graph
 * transforms and native modules are auto-mocked, which lets the pure business
 * logic (XP, ranks, trip stats, quests, Platinum caps) be tested directly and
 * lets `@testing-library/react-native` render hooks where we need to.
 *
 * `supabase/functions/**` is excluded: those are Deno/Bun tests run separately
 * (`bun test supabase/functions`) and use bun-only APIs jest can't load.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Existing unit tests were written against bun's test runner; the shim
    // re-exports jest's globals so they run unchanged under jest too.
    "^bun:test$": "<rootDir>/test/bunTestShim.js",
  },
  testMatch: [
    "<rootDir>/lib/**/__tests__/**/*.test.ts",
    "<rootDir>/hooks/**/__tests__/**/*.test.ts",
    "<rootDir>/hooks/**/__tests__/**/*.test.tsx",
    "<rootDir>/constants/**/__tests__/**/*.test.ts",
    // Config plugins are plain CommonJS, not TypeScript — they run in Expo's
    // prebuild, not in the app. The release-signing one edits generated Gradle
    // by pattern-matching it, and its failure mode is a build that succeeds
    // and produces a debug-signed bundle, so it is tested like anything else.
    "<rootDir>/plugins/**/__tests__/**/*.test.js",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/supabase/functions/"],
  // jest-expo transforms RN/Expo packages but ships ESM-only deps untouched.
  // Allow the ESM packages our hooks import (create-context-hook) through babel.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@nkzw/create-context-hook|zustand))",
  ],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "hooks/**/*.ts",
    "constants/**/*.ts",
    "!**/__tests__/**",
    "!**/*.d.ts",
  ],
  coverageProvider: "v8",
};
