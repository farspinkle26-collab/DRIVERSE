/**
 * Re-exports jest's test globals under the `bun:test` module specifier, so the
 * unit tests originally written for bun's runner (`import { describe, it,
 * expect } from "bun:test"`) run unchanged under jest via a moduleNameMapper
 * entry in jest.config.js. `mock` maps to `jest.fn` for the few tests that use
 * it. These globals exist by the time a test file imports this shim.
 */
module.exports = {
  describe: global.describe,
  it: global.it,
  test: global.test,
  expect: global.expect,
  beforeAll: global.beforeAll,
  beforeEach: global.beforeEach,
  afterAll: global.afterAll,
  afterEach: global.afterEach,
  jest: global.jest,
  mock: (impl) => global.jest.fn(impl),
};
