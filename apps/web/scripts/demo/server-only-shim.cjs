/* eslint-disable @typescript-eslint/no-require-imports -- a node --require preload must be CommonJS. */
/**
 * Lets the demo seed CLI load the application's server modules outside Next.
 * `server-only` is a build-time marker that throws when imported without the
 * `react-server` condition; but under that condition React has no
 * createContext, which `next/navigation` (reached through the account module)
 * needs. This hook resolves ONLY the `server-only` marker to an empty module,
 * so the CLI runs under the normal condition. Tooling only: never imported by
 * src/ and never used by the app or the build.
 */
const Module = require("node:module");
const path = require("node:path");
const original = Module._resolveFilename;
const empty = path.join(__dirname, "server-only-empty.cjs");
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return empty;
  return original.call(this, request, ...rest);
};
