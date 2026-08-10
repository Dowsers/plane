// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Reads package.json's own version rather than hardcoding a copy here -
// works both from src/ (via tsx) and from the bundled dist/ (via
// tsdown/node), since in both cases "../package.json" from this file's
// directory lands on apps/cli/package.json.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };

export const CLI_VERSION = pkg.version;
