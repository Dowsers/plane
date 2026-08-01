/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TRoadmapProject } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class RoadmapService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TRoadmapProject[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/roadmap/projects/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
