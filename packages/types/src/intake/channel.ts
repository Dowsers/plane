/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// docs/feature-specs/14-pricing-gap-remediation.md ("14d. Intake Email
// and Slack (levee du squelette)", section 3) - mirrors the field lists
// exposed by apps/api/plane/app/serializers/intake_channel.py exactly
// (never guessed - bot_access_token/signing_secret are read_only_fields
// = fields on the backend serializer and are never sent to the client).

export type TIntakeChannelType = "EMAIL" | "SLACK";

export type TInboundEmailAlias = {
  id: string;
  local_part: string;
  is_active: boolean;
  full_address: string;
};

export type TIntakeChannel = {
  id: string;
  workspace_id: string;
  project_id: string;
  channel_type: TIntakeChannelType;
  is_enabled: boolean;
  config: Record<string, unknown>;
  email_alias: TInboundEmailAlias | null;
};

export type TSlackInstallationMethod = "MANUAL_BOT_TOKEN" | "OAUTH";

export type TSlackWorkspaceConnection = {
  id: string;
  workspace_id: string;
  slack_team_id: string;
  slack_team_name: string;
  bot_user_id: string;
  installation_method: TSlackInstallationMethod;
  is_active: boolean;
  connected_at: string | null;
};

export type TSlackWorkspaceConnectionStatus = { connected: false } | ({ connected: true } & TSlackWorkspaceConnection);

// Mirrors SLACK_NOTIFY_EVENT_CHOICES (apps/api/plane/db/models/intake_channel.py).
export type TSlackNotifyEvent =
  | "issue_created"
  | "issue_status_changed"
  | "issue_assigned"
  | "comment_added"
  | "issue_closed";

export type TSlackChannelProjectMapping = {
  id: string;
  project_id: string;
  slack_connection: string;
  slack_channel_id: string;
  slack_channel_name: string;
  is_default_for_dm: boolean;
  notify_on: TSlackNotifyEvent[];
  is_active: boolean;
};

export type TSlackUserConnection = {
  id: string;
  workspace_id: string;
  slack_user_id: string;
  slack_user_display_name: string;
  user: string | null;
  linked_at: string | null;
};

export type TSlackUserConnectionStatus = { linked: false } | ({ linked: true } & TSlackUserConnection);
