/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIntakeChannel } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * 14d ("Intake Email and Slack", levee du squelette, section 3) -
 * IntakeChannelViewSet (apps/api/plane/app/views/intake/channel.py)
 * deliberately mounts no `retrieve` action (no GET on the detail route -
 * see the ViewSet's own routing) so `update`/`remove` below don't return
 * the updated row; callers re-fetch via `list()` instead, same
 * constraint already documented in the spec's own Considerations API/UX.
 */
export class IntakeChannelService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIntakeChannel[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-channels/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: { channel_type: "EMAIL" | "SLACK"; config?: Record<string, unknown> }
  ): Promise<TIntakeChannel> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-channels/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    channelId: string,
    data: Partial<Pick<TIntakeChannel, "is_enabled" | "config">>
  ): Promise<TIntakeChannel> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-channels/${channelId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, channelId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-channels/${channelId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async regenerateEmail(
    workspaceSlug: string,
    projectId: string,
    channelId: string
  ): Promise<{ full_address: string }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-channels/${channelId}/regenerate-email/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
