/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TTriageRule, TTriageRuleDryRunMatch } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class TriageRuleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TTriageRule[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<TTriageRule>): Promise<TTriageRule> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    data: Partial<TTriageRule>
  ): Promise<TTriageRule> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/${ruleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, ruleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/${ruleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reorder(workspaceSlug: string, projectId: string, ruleIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/reorder/`, {
      rule_ids: ruleIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async dryRun(
    workspaceSlug: string,
    projectId: string,
    ruleId: string
  ): Promise<{ matches: TTriageRuleDryRunMatch[] }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/${ruleId}/dry-run/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reapply(workspaceSlug: string, projectId: string): Promise<{ applied_count: number }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/triage-rules/reapply/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
