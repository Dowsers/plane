/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TProjectAIAssistantConfig,
  TProjectAIAssistantConfigPayload,
  TWorkspaceAIAssistantConfig,
  TWorkspaceAIAssistantConfigPayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9 (AI features, docs/feature-specs/09-ai-features.md
 * in plane-selfhost), feature 3 - "Assistant de chat IA in-app"
 * workspace + project settings. Backend:
 * `WorkspaceAIAssistantConfigEndpoint`/`ProjectAIAssistantConfigEndpoint`
 * (apps/api/plane/app/views/ai_assistant_config.py) - Admin only for every
 * verb, including read, on BOTH resources.
 *
 * Unlike `is_ai_triage_enabled`/`is_ai_summary_enabled` (read/written
 * through `useWorkspace()`/`updateWorkspace()` since they sit on the
 * generically-readable workspace object), this feature's workspace master
 * switch has its own dedicated endpoint and is never exposed to non-admins
 * - same reasoning as `DuplicateDetectionConfigService`'s own workspace
 * config (`ai_assistant_max_messages_per_user_per_hour` needs no range
 * validation today, but the pairing with the master switch on one
 * Admin-only endpoint follows that same precedent rather than splitting
 * two related admin fields across two different read paths).
 */
export class AIAssistantConfigService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getWorkspaceConfig(workspaceSlug: string): Promise<TWorkspaceAIAssistantConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-assistant-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceConfig(
    workspaceSlug: string,
    data: TWorkspaceAIAssistantConfigPayload
  ): Promise<TWorkspaceAIAssistantConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/ai-assistant-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<TProjectAIAssistantConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/ai-assistant-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProjectConfig(
    workspaceSlug: string,
    projectId: string,
    data: TProjectAIAssistantConfigPayload
  ): Promise<TProjectAIAssistantConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/ai-assistant-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
