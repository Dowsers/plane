/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAgentStatus, TAgentType } from "@plane/types";

/** Mirrors `AgentProfile.AgentType` (apps/api/plane/db/models/agent.py)
 * verbatim - keep in sync if the backend ever adds a value. */
export const AGENT_TYPE_OPTIONS: { value: TAgentType; label: string }[] = [
  { value: "claude_code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "generic", label: "Generic" },
];

export const AGENT_TYPE_LABELS: Record<TAgentType, string> = {
  claude_code: "Claude Code",
  cursor: "Cursor",
  generic: "Generic",
};

export const AGENT_STATUS_LABELS: Record<TAgentStatus, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
};
