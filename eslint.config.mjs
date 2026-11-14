// ESLint 9 flat config. eslint-config-next 15 still ships the legacy format, so it is
// loaded through FlatCompat. Its plugins (react, react-hooks, jsx-a11y…) are its own
// dependencies and pnpm does not hoist them, so resolve plugins from its folder.
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next/package.json")),
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "graphify-out/**",
      "public/**",
      "storage/**",
      ".agents/**",
      ".claude/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
