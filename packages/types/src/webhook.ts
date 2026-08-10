/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface IWebhook {
  created_at: string;
  cycle: boolean;
  id: string;
  is_active: boolean;
  issue: boolean;
  issue_comment: boolean;
  module: boolean;
  project: boolean;
  secret_key?: string;
  updated_at: string;
  url: string;
  // "workflow_rule.triggered" (category 6, feature 1) - a real column on
  // the backend `Webhook` model (apps/api/plane/db/models/webhook.py) that
  // was never previously modeled on this frontend type.
  workflow_rule?: boolean;
  // All four governed-workflow events (category 6, feature 4) - same gap.
  workflow_transition?: boolean;
  // Populated only by a test-send, "explorer" | "settings_ui" - see the
  // API Explorer's webhook test-send panel
  // (apps/web/core/components/web-hooks/test-send-panel.tsx) and
  // docs/feature-specs/08-api-webhooks-cli.md ("6. Explorateur d'API
  // interactif") in plane-selfhost.
  last_test_triggered_via?: string | null;
}

export type TWebhookEventTypes = "all" | "individual";
