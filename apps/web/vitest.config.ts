/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import path from "path";
import { defineConfig } from "vitest/config";

/**
 * This app had no test runner at all before this. The environment is `node`, not
 * jsdom, on purpose: the repo carries neither jsdom nor @testing-library, so
 * rendering React components is out of scope here. What IS covered is the pure
 * logic that sits under the components - the rules whose drift actually breaks
 * behaviour silently - plus static guards over the settings-tab and i18n
 * registries, each of which has already caught a real bug.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./core"),
      "@/helpers": path.resolve(__dirname, "./helpers"),
      // Point workspace packages at their SOURCE, not their built `dist`.
      // Without this, a test that asserts something about `@plane/constants`
      // silently validates the last build output instead of the working tree -
      // verified by mutation: reintroducing a known bug in the source left the
      // test green.
      "@plane/constants": path.resolve(__dirname, "../../packages/constants/src/index.ts"),
      "@plane/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@plane/i18n": path.resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
});
