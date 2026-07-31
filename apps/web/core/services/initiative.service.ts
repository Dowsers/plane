/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { IInitiative, IInitiativeActivity, IInitiativeProject, TInitiativeWritePayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class InitiativeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getInitiatives(workspaceSlug: string): Promise<IInitiative[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInitiativeDetails(workspaceSlug: string, initiativeId: string): Promise<IInitiative> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createInitiative(workspaceSlug: string, data: TInitiativeWritePayload): Promise<IInitiative> {
    return this.post(`/api/workspaces/${workspaceSlug}/initiatives/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchInitiative(
    workspaceSlug: string,
    initiativeId: string,
    data: TInitiativeWritePayload
  ): Promise<IInitiative> {
    return this.patch(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteInitiative(workspaceSlug: string, initiativeId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInitiativeProjects(workspaceSlug: string, initiativeId: string): Promise<IInitiativeProject[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkProjectsToInitiative(
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ): Promise<IInitiativeProject[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/`, {
      project_ids: projectIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkProjectFromInitiative(workspaceSlug: string, initiativeId: string, projectId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInitiativeActivities(workspaceSlug: string, initiativeId: string): Promise<IInitiativeActivity[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/activities/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
