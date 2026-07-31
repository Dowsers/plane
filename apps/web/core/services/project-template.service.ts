/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  IProjectTemplate,
  IProjectTemplateListItem,
  TCreateProjectFromTemplatePayload,
  TCreateProjectTemplateFromProjectPayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class ProjectTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<IProjectTemplateListItem[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, templateId: string): Promise<IProjectTemplate> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createFromProject(
    workspaceSlug: string,
    data: TCreateProjectTemplateFromProjectPayload
  ): Promise<IProjectTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/project-templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async duplicate(workspaceSlug: string, templateId: string): Promise<IProjectTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/duplicate/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, templateId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProject(
    workspaceSlug: string,
    templateId: string,
    data: TCreateProjectFromTemplatePayload
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/project-templates/${templateId}/create-project/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
