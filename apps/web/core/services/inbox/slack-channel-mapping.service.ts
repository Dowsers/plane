/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TSlackChannelProjectMapping, TSlackNotifyEvent } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class SlackChannelMappingService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TSlackChannelProjectMapping[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-mappings/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: {
      slack_channel_id: string;
      slack_channel_name?: string;
      is_default_for_dm?: boolean;
      notify_on?: TSlackNotifyEvent[];
    }
  ): Promise<TSlackChannelProjectMapping> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-mappings/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    mappingId: string,
    data: Partial<Pick<TSlackChannelProjectMapping, "notify_on" | "is_active">>
  ): Promise<TSlackChannelProjectMapping> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-mappings/${mappingId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, mappingId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-mappings/${mappingId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
