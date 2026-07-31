/**
 * Jest config for the admin (content dashboard) app.
 *
 * The content pipeline's numbers — save/engagement/hold rates and the
 * aggregate stats — are pure functions, so a plain ts-jest + node setup
 * exercises them directly. `server-only` (imported by the store modules to
 * fence them to the server) is stubbed so those modules load under jest.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^server-only$": "<rootDir>/test/serverOnlyStub.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          jsx: "react-jsx",
          isolatedModules: true,
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  collectCoverageFrom: [
    "src/lib/content/store.ts",
    "src/lib/content/metrics.ts",
    "!**/__tests__/**",
  ],
};
