/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  IProjectUpdate,
  TAIGenerationLog,
  TAIGenerationLogParams,
  TPaginatedResponse,
  TProjectUpdateAIDraftResponse,
  TProjectUpdateGeneratedSummary,
  TProjectUpdateWritePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class ProjectUpdateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, cursor?: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/`, {
      params: cursor ? { cursor } : undefined,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieveLatest(workspaceSlug: string, projectId: string): Promise<IProjectUpdate | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/latest/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async generateSummary(workspaceSlug: string, projectId: string): Promise<TProjectUpdateGeneratedSummary> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/generate-summary/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TProjectUpdateWritePayload): Promise<IProjectUpdate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    updateId: string,
    data: Partial<TProjectUpdateWritePayload>
  ): Promise<IProjectUpdate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/${updateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, updateId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/${updateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Category 9, feature 6 - "AI-assisted status update drafting"
   * (docs/feature-specs/09-ai-features.md in plane-selfhost, PROJECT-only in
   * this fork). Fully synchronous - `ProjectUpdateAIDraftEndpoint`
   * (apps/api/plane/app/views/project_update/ai_draft.py) has a 20s
   * server-side LLM timeout and NEVER creates a `ProjectUpdate` row; the
   * caller is responsible for feeding the response into the existing
   * create-update form. The thrown error keeps the original HTTP `status`
   * alongside the `{error}` body (unlike this class's other methods) so
   * callers can special-case 429 (regeneration cap reached) vs. 400/503
   * (not enabled/configured, or LLM failure) without parsing message text.
   */
  async generateDraft(workspaceSlug: string, projectId: string): Promise<TProjectUpdateAIDraftResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/updates/draft/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }

  /** Admin-only (PROJECT level, same as manual update creation - not a
   * workspace-level permission) paginated audit trail - see
   * `ProjectUpdateAIGenerationLogEndpoint`
   * (apps/api/plane/app/views/project_update/ai_draft.py). */
  async getAIGenerationLogs(
    workspaceSlug: string,
    projectId: string,
    params?: TAIGenerationLogParams
  ): Promise<TPaginatedResponse<TAIGenerationLog[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/ai-update-logs/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
