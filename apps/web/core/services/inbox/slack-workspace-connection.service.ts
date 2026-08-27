/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TSlackWorkspaceConnectionStatus } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class SlackWorkspaceConnectionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async retrieve(workspaceSlug: string): Promise<TSlackWorkspaceConnectionStatus> {
    return this.get(`/api/workspaces/${workspaceSlug}/slack-connection/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async connectWithBotToken(
    workspaceSlug: string,
    data: { bot_access_token: string; signing_secret: string }
  ): Promise<TSlackWorkspaceConnectionStatus> {
    return this.post(`/api/workspaces/${workspaceSlug}/slack-connection/connect/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async connectWithOAuthCode(workspaceSlug: string, code: string): Promise<TSlackWorkspaceConnectionStatus> {
    return this.post(`/api/workspaces/${workspaceSlug}/slack-connection/connect/`, { code })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async disconnect(workspaceSlug: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/slack-connection/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
