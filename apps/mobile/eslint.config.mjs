import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

const SERVER_ONLY =
  "The iPhone app talks only to the mobile API and Supabase Auth. Server modules stay in apps/web (CLAUDE.md, mobile app rules).";

export default defineConfig([
  expoConfig,
  { ignores: ["dist/*", "ios/*", "android/*", ".expo/*"] },
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@prisma/client", message: SERVER_ONLY },
            { name: "server-only", message: SERVER_ONLY },
            { name: "next", message: SERVER_ONLY },
            { name: "@supabase/ssr", message: SERVER_ONLY },
            {
              name: "@react-native-async-storage/async-storage",
              message: "Tokens live only in the Keychain (spec §11, B8).",
            },
          ],
          patterns: [
            {
              group: ["@overload/web", "@overload/web/*", "@/*"],
              message: SERVER_ONLY,
            },
            { group: ["next/*"], message: SERVER_ONLY },
          ],
        },
      ],
    },
  },
]);
