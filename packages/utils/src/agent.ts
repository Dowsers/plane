/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared frontend helper for the first-class workspace-agent actor type -
// category 9, feature 7 (docs/feature-specs/09-ai-features.md "7. Type
// d'acteur agent de premiere classe" in plane-selfhost). Mirrors the
// backend's own `plane.utils.agent_actor.is_workspace_agent` (
// apps/api/plane/utils/agent_actor.py) exactly: a `WORKSPACE_AGENT` bot is
// deliberately member-visible (assignable, mentionable, badge-worthy)
// everywhere, unlike every other `is_bot=True` row (the six category-7
// integration bots, `WORKSPACE_SEED`), which must stay excluded/unbadged
// exactly as before. Every frontend call site that needs this distinction
// (member-visibility filters, the shared `AgentBadge`) should go through
// this single helper rather than re-deriving the `"WORKSPACE_AGENT"`
// string comparison inline.

/** The one `bot_type` value that is member-visible (see module docstring
 * above) - matches `BotTypeEnum.WORKSPACE_AGENT` in
 * apps/api/plane/db/models/user.py verbatim. */
export const WORKSPACE_AGENT_BOT_TYPE = "WORKSPACE_AGENT";

type TAgentActorLike = {
  is_bot?: boolean | null;
  bot_type?: string | null;
} | null;

/** True only for a first-class workspace agent - never for a human
 * (`is_bot` falsy) and never for the six category-7 integration bots or
 * `WORKSPACE_SEED` (`is_bot` true but a different `bot_type`). */
export function isWorkspaceAgentActor(actor: TAgentActorLike | undefined): boolean {
  if (!actor) return false;
  return Boolean(actor.is_bot) && actor.bot_type === WORKSPACE_AGENT_BOT_TYPE;
}
