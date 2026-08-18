/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TWorkspaceAIConfig,
  TWorkspaceAIConfigPayload,
  TWorkspaceAIConfigTestPayload,
  TWorkspaceAIConfigTestResponse,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for the shared per-workspace LLM config - category 9 (AI
 * features, docs/feature-specs/09-ai-features.md in plane-selfhost)
 * infrastructure prerequisite that every AI feature's frontend (starting
 * with feature 4, thread summary) builds on top of. Backend:
 * `WorkspaceAIConfigEndpoint`/`WorkspaceAIConfigTestEndpoint`
 * (apps/api/plane/app/views/workspace_ai_config.py) - Admin only for every
 * verb including read.
 *
 * `testConfig` uses `validateStatus: () => true` (matching
 * `FlexibleQueryService.runQuery`'s reasoning) since the test endpoint
 * returns a structured `{ success, error }` body on both 200 and 400 -
 * that body needs to be read and displayed, not discarded into a thrown
 * error.
 */
export class AIConfigService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getConfig(workspaceSlug: string): Promise<TWorkspaceAIConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateConfig(workspaceSlug: string, data: TWorkspaceAIConfigPayload): Promise<TWorkspaceAIConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/ai-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async testConfig(
    workspaceSlug: string,
    data: TWorkspaceAIConfigTestPayload
  ): Promise<TWorkspaceAIConfigTestResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-config/test/`, data, {
      validateStatus: () => true,
    }).then((response) => response?.data);
  }
}
