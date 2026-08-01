/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TGanttDependencyPair } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class GanttDependencyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, issueIds: string[]): Promise<TGanttDependencyPair[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/gantt-dependencies/`, {
      params: { issues: issueIds.join(",") },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
