/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  ITeamspace,
  ITeamspaceDetail,
  ITeamspaceMember,
  ITeamspaceProject,
  TTeamspaceMemberWritePayload,
  TTeamspaceProjectWritePayload,
  TTeamspaceWritePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class TeamspaceService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getTeamspaces(workspaceSlug: string): Promise<ITeamspace[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getTeamspaceDetails(workspaceSlug: string, teamspaceId: string): Promise<ITeamspaceDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTeamspace(workspaceSlug: string, data: TTeamspaceWritePayload): Promise<ITeamspace> {
    return this.post(`/api/workspaces/${workspaceSlug}/teamspaces/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchTeamspace(workspaceSlug: string, teamspaceId: string, data: TTeamspaceWritePayload): Promise<ITeamspace> {
    return this.patch(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTeamspace(workspaceSlug: string, teamspaceId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addTeamspaceMember(
    workspaceSlug: string,
    teamspaceId: string,
    data: TTeamspaceMemberWritePayload
  ): Promise<ITeamspaceMember> {
    return this.post(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/members/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeTeamspaceMember(workspaceSlug: string, teamspaceId: string, memberId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/members/${memberId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addTeamspaceProject(
    workspaceSlug: string,
    teamspaceId: string,
    data: TTeamspaceProjectWritePayload
  ): Promise<ITeamspaceProject> {
    return this.post(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/projects/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeTeamspaceProject(workspaceSlug: string, teamspaceId: string, projectId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // Category 13, feature 2 - team overview/dashboard aggregation (spec
  // section 2). Only the summary "overview" endpoint is wired up here for
  // the MVP frontend - cycles/relations/stats have no dedicated UI yet
  // (see the create-update/list-only scope of this iteration) but their
  // backend endpoints already exist at the same base path if a future
  // detail page needs them.
  async getTeamspaceOverview(workspaceSlug: string, teamspaceId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/overview/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
