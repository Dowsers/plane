/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  ITeam,
  ITeamDetail,
  ITeamMember,
  ITeamProject,
  TTeamMemberWritePayload,
  TTeamProjectWritePayload,
  TTeamWritePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class TeamService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getTeams(workspaceSlug: string): Promise<ITeam[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/teams/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getTeamDetails(workspaceSlug: string, teamId: string): Promise<ITeamDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/teams/${teamId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTeam(workspaceSlug: string, data: TTeamWritePayload): Promise<ITeam> {
    return this.post(`/api/workspaces/${workspaceSlug}/teams/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchTeam(workspaceSlug: string, teamId: string, data: TTeamWritePayload): Promise<ITeam> {
    return this.patch(`/api/workspaces/${workspaceSlug}/teams/${teamId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTeam(workspaceSlug: string, teamId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teams/${teamId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addTeamMember(workspaceSlug: string, teamId: string, data: TTeamMemberWritePayload): Promise<ITeamMember> {
    return this.post(`/api/workspaces/${workspaceSlug}/teams/${teamId}/members/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeTeamMember(workspaceSlug: string, teamId: string, memberId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teams/${teamId}/members/${memberId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addTeamProject(workspaceSlug: string, teamId: string, data: TTeamProjectWritePayload): Promise<ITeamProject> {
    return this.post(`/api/workspaces/${workspaceSlug}/teams/${teamId}/projects/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeTeamProject(workspaceSlug: string, teamId: string, projectId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teams/${teamId}/projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
