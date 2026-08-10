/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { ApiExplorerService } from "@/services/api-explorer.service";

// Module-level singleton (same convention as e.g. `flexibleQueryService` in
// the near-identical precedent this session, category 8 feature 1) -
// shared by every component under this directory so they don't each spin
// up their own axios instance.
export const apiExplorerService = new ApiExplorerService();
