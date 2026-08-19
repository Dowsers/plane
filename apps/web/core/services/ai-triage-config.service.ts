/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TProjectAITriageConfig, TProjectAITriageConfigPayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9, feature 1 - "AI-assisted auto-triage"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost) PROJECT-level
 * settings. Backend: `ProjectAITriageConfigEndpoint`
 * (apps/api/plane/app/views/ai_triage_config.py) - Admin only for every
 * verb including read, same convention as `WorkspaceAIConfigService`.
 *
 * The WORKSPACE-level master switch (`Workspace.is_ai_triage_enabled`) is
 * deliberately NOT wrapped here - it's a plain field already exposed on
 * `IWorkspace` via the generic workspace serializer (`fields = "__all__"`),
 * so Settings > AI's "Features" toggle row reads/writes it through
 * `useWorkspace()`/`updateWorkspace()` directly, exactly like the two
 * earlier category 9 features' own toggles (`is_ai_summary_enabled`,
 * `is_ai_update_draft_enabled`) - no dedicated service needed for it.
 */
export class AITriageConfigService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<TProjectAITriageConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/ai-triage-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProjectConfig(
    workspaceSlug: string,
    projectId: string,
    data: TProjectAITriageConfigPayload
  ): Promise<TProjectAITriageConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/ai-triage-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
