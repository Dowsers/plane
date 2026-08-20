/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared frontend helper for "publicly visible" bot actor types -
// category 9, feature 7 (docs/feature-specs/09-ai-features.md "7. Type
// d'acteur agent de premiere classe" in plane-selfhost) introduced this
// module for exactly one such type (`WORKSPACE_AGENT`); category 9,
// feature 3 ("3. Assistant de chat IA in-app" in the same spec file)
// generalizes it to a second (`AI_ASSISTANT_BOT`), mirroring the backend's
// own split (`plane.utils.agent_actor.PUBLICLY_VISIBLE_BOT_TYPES` /
// `is_workspace_agent`, apps/api/plane/utils/agent_actor.py) exactly:
//
// - `isPubliclyVisibleBotActor` - true for EITHER publicly-visible bot
//   type. Use this for member-visibility filters (workspace/project
//   member lists, @mention autocomplete, assignee selectors) - anywhere
//   the question is "should this bot appear in this list of people at
//   all", matching the backend's own `member_visibility_q`/
//   `is_member_visible`.
// - `isWorkspaceAgentActor` - true ONLY for `WORKSPACE_AGENT`, unchanged
//   from feature 7. Use this for anything that is specifically about the
//   first-class AGENT identity (the shared `AgentBadge`, the "real
//   display name instead of an ad hoc {name}Bot suffix" comment/activity
//   treatment) - `AI_ASSISTANT_BOT` deliberately does NOT get either of
//   those, exactly like the six category-7 integration bots, even though
//   it IS publicly visible; it renders with the same generic bot-name-
//   suffix convention those use.
//
// Every other `is_bot=True` row (the six category-7 integration bots,
// `AI_TRIAGE_BOT`, `WORKSPACE_SEED`) stays excluded/unbadged from both
// helpers exactly as before.

/** Matches `BotTypeEnum.WORKSPACE_AGENT` in apps/api/plane/db/models/user.py
 * verbatim - the first-class AGENT identity (badge-worthy, real display
 * name). */
export const WORKSPACE_AGENT_BOT_TYPE = "WORKSPACE_AGENT";

/** Matches `BotTypeEnum.AI_ASSISTANT_BOT` verbatim - publicly visible/
 * mentionable (category 9, feature 3's own comment-mention reply path
 * depends on this bot being selectable from the same mention autocomplete
 * a human member uses), but never badge-worthy - see module docstring. */
export const AI_ASSISTANT_BOT_TYPE = "AI_ASSISTANT_BOT";

/** Mirrors `PUBLICLY_VISIBLE_BOT_TYPES` (apps/api/plane/utils/agent_actor.py)
 * verbatim - the single source of truth for "which bot types get member
 * visibility" on the frontend, a set rather than one hardcoded type so a
 * future third type never needs a third parallel carve-out. */
export const PUBLICLY_VISIBLE_BOT_TYPES: ReadonlySet<string> = new Set([
  WORKSPACE_AGENT_BOT_TYPE,
  AI_ASSISTANT_BOT_TYPE,
]);

type TAgentActorLike = {
  is_bot?: boolean | null;
  bot_type?: string | null;
} | null;

/** True only for a first-class workspace agent - never for
 * `AI_ASSISTANT_BOT`, the six category-7 integration bots, or
 * `WORKSPACE_SEED` (`is_bot` true but a different `bot_type`). Gates the
 * shared `AgentBadge` and the "show the real display name" comment/
 * activity treatment - NOT member-visibility, see `isPubliclyVisibleBotActor`
 * for that. */
export function isWorkspaceAgentActor(actor: TAgentActorLike | undefined): boolean {
  if (!actor) return false;
  return Boolean(actor.is_bot) && actor.bot_type === WORKSPACE_AGENT_BOT_TYPE;
}

/** True for a human (`is_bot` falsy) or any bot type in
 * `PUBLICLY_VISIBLE_BOT_TYPES` - the check every member-visibility filter
 * (workspace/project member lists, @mention autocomplete, assignee
 * selectors) should use instead of a blanket `!is_bot` exclusion. */
export function isPubliclyVisibleBotActor(actor: TAgentActorLike | undefined): boolean {
  if (!actor) return false;
  return !actor.is_bot || PUBLICLY_VISIBLE_BOT_TYPES.has(actor.bot_type ?? "");
}
