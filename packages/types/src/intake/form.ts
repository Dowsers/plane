/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TIntakeForm = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description_html: string;
  token: string;
  is_enabled: boolean;
  default_state: string | null;
  default_priority: string | null;
  default_labels: string[];
  show_priority_field: boolean;
  show_labels_field: boolean;
  allow_attachments: boolean;
  max_attachments: number;
  require_submitter_name: boolean;
  require_submitter_email: boolean;
  send_confirmation_email: boolean;
  success_message: string;
  redirect_url: string | null;
  rate_limit_per_ip_per_hour: number;
};

export type TIntakeFormPublicLabel = {
  id: string;
  name: string;
  color: string;
};

export type TIntakeFormPublicConfig = {
  name: string;
  description_html: string;
  show_priority_field: boolean;
  show_labels_field: boolean;
  allow_attachments: boolean;
  require_submitter_name: boolean;
  require_submitter_email: boolean;
  priorities: string[];
  labels: TIntakeFormPublicLabel[];
};

export type TIntakeFormSubmitResponse = {
  success_message: string;
  redirect_url: string | null;
};
