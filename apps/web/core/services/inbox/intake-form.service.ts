/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIntakeForm } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IntakeFormService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIntakeForm[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-forms/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<TIntakeForm>): Promise<TIntakeForm> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-forms/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    formId: string,
    data: Partial<TIntakeForm>
  ): Promise<TIntakeForm> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-forms/${formId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, formId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-forms/${formId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async regenerateToken(workspaceSlug: string, projectId: string, formId: string): Promise<TIntakeForm> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-forms/${formId}/regenerate-token/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
