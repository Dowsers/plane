/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueAllowedTransitionEntry,
  TIssueTransitionApprovalRequest,
  TPaginatedResponse,
  TWorkflowTransition,
  TWorkflowTransitionAction,
  TWorkflowTransitionApprover,
  TWorkflowTransitionAuditLog,
  TWorkflowTransitionAuditLogParams,
  TWorkflowTransitionCondition,
  TWorkflowTransitionPayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for the project-scoped governed-workflows engine (from-state ->
 * to-state graph edges with approvers/conditions/actions) - see
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations", section 4) in plane-selfhost, and
 * apps/api/plane/app/views/workflow_transition/base.py. The `WorkflowTransition`
 * CRUD (list/retrieve/create/update/remove/addApprover/.../addAction/...) and
 * the audit log are ADMIN-only on the backend for every verb, including
 * read - callers of those methods must gate access accordingly rather than
 * relying on the API to hide anything. `allowedTransitions`/`requestApproval`/
 * `approveRequest`/`rejectRequest` are open to any active project member
 * (Admin/Member/Guest).
 */
export class WorkflowTransitionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, issueTypeId?: string): Promise<TWorkflowTransition[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/`, {
      params: issueTypeId ? { issue_type: issueTypeId } : undefined,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, transitionId: string): Promise<TWorkflowTransition> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TWorkflowTransitionPayload
  ): Promise<TWorkflowTransition> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: TWorkflowTransitionPayload
  ): Promise<TWorkflowTransition> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, transitionId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Granular add/remove for a single nested row - an alternative to
   * reconciling the whole `approvers`/`conditions`/`actions` array through
   * `update()`, mirroring the backend's own dual support for both paths. */
  async addApprover(
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: Omit<TWorkflowTransitionApprover, "id">
  ): Promise<TWorkflowTransitionApprover> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/approvers/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeApprover(workspaceSlug: string, projectId: string, transitionId: string, approverId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/approvers/${approverId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addCondition(
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: Omit<TWorkflowTransitionCondition, "id">
  ): Promise<TWorkflowTransitionCondition> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/conditions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeCondition(
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    conditionId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/conditions/${conditionId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addAction(
    workspaceSlug: string,
    projectId: string,
    transitionId: string,
    data: Omit<TWorkflowTransitionAction, "id">
  ): Promise<TWorkflowTransitionAction> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/actions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeAction(workspaceSlug: string, projectId: string, transitionId: string, actionId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workflows/${transitionId}/actions/${actionId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async auditLogs(
    workspaceSlug: string,
    projectId: string,
    params?: TWorkflowTransitionAuditLogParams
  ): Promise<TPaginatedResponse<TWorkflowTransitionAuditLog[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/workflow-transition-audit-logs/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Open to any active project member - drives the state-picker UI (which
   * options are clickable, and why the rest aren't). Re-evaluated fresh on
   * every call, not cached server-side. */
  async allowedTransitions(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssueAllowedTransitionEntry[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/allowed-transitions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async requestApproval(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    transitionId: string
  ): Promise<TIssueTransitionApprovalRequest> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/transitions/${transitionId}/request-approval/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async approveRequest(
    workspaceSlug: string,
    projectId: string,
    approvalRequestId: string,
    comment?: string
  ): Promise<TIssueTransitionApprovalRequest> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-transition-approvals/${approvalRequestId}/approve/`,
      comment ? { comment } : undefined
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async rejectRequest(
    workspaceSlug: string,
    projectId: string,
    approvalRequestId: string,
    comment?: string
  ): Promise<TIssueTransitionApprovalRequest> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-transition-approvals/${approvalRequestId}/reject/`,
      comment ? { comment } : undefined
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
