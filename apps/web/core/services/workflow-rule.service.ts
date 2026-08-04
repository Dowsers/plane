/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TPaginatedResponse,
  TWorkflowRule,
  TWorkflowRuleExecutionLog,
  TWorkflowRuleExecutionLogParams,
  TWorkflowRulePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for the project-scoped workflow rule engine (trigger -> AND-
 * combined conditions -> ordered actions) - see
 * docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
 * d'automatisation") in plane-selfhost, and
 * apps/api/plane/app/views/workflow_rule/base.py. ADMIN-only on the backend
 * for every verb, including read - callers of this service must gate
 * access accordingly rather than relying on the API to hide anything.
 */
export class WorkflowRuleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TWorkflowRule[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, ruleId: string): Promise<TWorkflowRule> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TWorkflowRulePayload): Promise<TWorkflowRule> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    data: TWorkflowRulePayload
  ): Promise<TWorkflowRule> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, ruleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Flips `is_active` - returns the full, updated rule. */
  async toggle(workspaceSlug: string, projectId: string, ruleId: string): Promise<TWorkflowRule> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/toggle/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Deep-copies the rule + actions into a new, inactive rule named
   * `"<name> (copy)"`. */
  async duplicate(workspaceSlug: string, projectId: string, ruleId: string): Promise<TWorkflowRule> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/duplicate/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async executionLogs(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    params?: TWorkflowRuleExecutionLogParams
  ): Promise<TPaginatedResponse<TWorkflowRuleExecutionLog[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-rules/${ruleId}/execution-logs/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
