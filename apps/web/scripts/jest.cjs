/* eslint-disable @typescript-eslint/no-require-imports -- a node entry script run as `node scripts/jest.cjs` must be CommonJS. */
// Runs the Jest CLI this workspace depends on, wherever npm placed it (npm
// workspaces hoist it to the repository root today), so `npm test` no longer
// names a node_modules path. Arguments pass through unchanged. The scripts in
// package.json run it as `node --experimental-vm-modules scripts/jest.cjs …`,
// exactly as they ran node_modules/jest/bin/jest.js before Pitch 21a.
require(require.resolve("jest/bin/jest", { paths: [__dirname] }));
