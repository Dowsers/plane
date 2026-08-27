/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  IPageTemplate,
  IPageTemplateListItem,
  TCreatePageFromTemplatePayload,
  TCreatePageTemplatePayload,
  TSaveAsPageTemplatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class PageTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<IPageTemplateListItem[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/page-templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, templateId: string): Promise<IPageTemplate> {
    return this.get(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TCreatePageTemplatePayload): Promise<IPageTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    data: Partial<TCreatePageTemplatePayload>
  ): Promise<IPageTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async duplicate(workspaceSlug: string, templateId: string): Promise<IPageTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/duplicate/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async saveAsTemplate(
    workspaceSlug: string,
    pageId: string,
    data: TSaveAsPageTemplatePayload
  ): Promise<IPageTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/save-as-template/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPage(workspaceSlug: string, templateId: string, data: TCreatePageFromTemplatePayload): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-templates/${templateId}/create-page/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
