/** Unit tests for the security- and money-critical logic. These are pure/mocked
 *  and need no database or Stripe — they run fast in CI and locally. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
};
