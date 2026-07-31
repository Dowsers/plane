/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIntakeResponsibilitySetting, TIntakeRotationMember } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IntakeResponsibilityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSetting(workspaceSlug: string, projectId: string): Promise<TIntakeResponsibilitySetting> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-responsibility/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSetting(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TIntakeResponsibilitySetting>
  ): Promise<TIntakeResponsibilitySetting> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-responsibility/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listRotationMembers(workspaceSlug: string, projectId: string): Promise<TIntakeRotationMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-responsibility/rotation-members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addRotationMember(workspaceSlug: string, projectId: string, memberId: string): Promise<TIntakeRotationMember> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-responsibility/rotation-members/`, {
      member: memberId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeRotationMember(workspaceSlug: string, projectId: string, rotationMemberId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-responsibility/rotation-members/${rotationMemberId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reorderRotationMembers(workspaceSlug: string, projectId: string, rotationMemberIds: string[]): Promise<void> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-responsibility/rotation-members/reorder/`,
      { rotation_member_ids: rotationMemberIds }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
