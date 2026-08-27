/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TSlackUserConnectionStatus } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * 14d ("Intake Email and Slack", levee du squelette, section 3, exigence
 * 8) - links the CURRENT session user's Slack identity for a given
 * workspace. Deliberately workspace-scoped (`SlackUserConnection` is a
 * `WorkspaceBaseModel`, not a global-account model) even though the page
 * consuming this lives under account-level Profile Settings - see
 * `SlackUserLinkVerifyEndpoint`'s own docstring
 * (apps/api/plane/app/views/intake/channel.py).
 */
export class SlackUserConnectionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async retrieve(workspaceSlug: string): Promise<TSlackUserConnectionStatus> {
    return this.get(`/api/workspaces/${workspaceSlug}/slack-user-link/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async verify(workspaceSlug: string, code: string): Promise<TSlackUserConnectionStatus> {
    return this.post(`/api/workspaces/${workspaceSlug}/slack-user-link/verify/`, { code })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlink(workspaceSlug: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/slack-user-link/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
