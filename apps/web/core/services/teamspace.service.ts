/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  ITeamspace,
  ITeamspaceCycles,
  ITeamspaceDetail,
  ITeamspaceMember,
  ITeamspaceOverview,
  ITeamspacePage,
  ITeamspaceProject,
  ITeamspaceRelations,
  ITeamspaceStats,
  ITeamspaceView,
  TTeamspaceMemberWritePayload,
  TTeamspaceOverviewGroupBy,
  TTeamspacePageWritePayload,
  TTeamspaceProjectWritePayload,
  TTeamspaceRelationDirection,
  TTeamspaceStatsGroupBy,
  TTeamspaceViewWritePayload,
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
  // section 2): the detail page's Overview/Cycles/Relations/Stats tabs.
  async getTeamspaceOverview(
    workspaceSlug: string,
    teamspaceId: string,
    groupBy?: TTeamspaceOverviewGroupBy
  ): Promise<ITeamspaceOverview> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/overview/`, {
      params: { group_by: groupBy },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getTeamspaceCycles(workspaceSlug: string, teamspaceId: string): Promise<ITeamspaceCycles> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/cycles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getTeamspaceRelations(
    workspaceSlug: string,
    teamspaceId: string,
    direction: TTeamspaceRelationDirection
  ): Promise<ITeamspaceRelations> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/relations/`, {
      params: { direction },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getTeamspaceStats(
    workspaceSlug: string,
    teamspaceId: string,
    groupBy: TTeamspaceStatsGroupBy
  ): Promise<ITeamspaceStats> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/stats/`, {
      params: { group_by: groupBy },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // Category 13, feature 3 - Teamspace Pages/Views (spec section 3).
  async getTeamspacePages(workspaceSlug: string, teamspaceId: string): Promise<ITeamspacePage[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/pages/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTeamspacePage(
    workspaceSlug: string,
    teamspaceId: string,
    data: TTeamspacePageWritePayload
  ): Promise<ITeamspacePage> {
    return this.post(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/pages/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTeamspacePage(workspaceSlug: string, teamspaceId: string, pageId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/pages/${pageId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getTeamspaceViews(workspaceSlug: string, teamspaceId: string): Promise<ITeamspaceView[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/views/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTeamspaceView(
    workspaceSlug: string,
    teamspaceId: string,
    data: TTeamspaceViewWritePayload
  ): Promise<ITeamspaceView> {
    return this.post(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/views/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTeamspaceView(workspaceSlug: string, teamspaceId: string, viewId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamspaceId}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
