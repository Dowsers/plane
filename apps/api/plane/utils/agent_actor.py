# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared helpers for the workspace-agent actor type - category 9, feature 7
(docs/feature-specs/09-ai-features.md "7. Type d'acteur agent de premiere
classe" in plane-selfhost).

A `WORKSPACE_AGENT` bot (`plane.db.models.user.BotTypeEnum.WORKSPACE_AGENT`)
is a first-class, member-visible actor - unlike every other `is_bot=True`
row in this codebase (`WORKSPACE_SEED` and the six category-7 integration
bots created through `plane.utils.integration_bot`), which must stay
hidden from every member-listing/search surface exactly as before. This
module centralizes the two cross-cutting rules that follow from that
split, so every call site touches the same two functions instead of
re-deriving the logic:

- `member_visibility_q` - the Q object every "hide bots from this member
  surface" call site needs, now bot-type-aware instead of a blanket
  `is_bot=False`.
- `is_workspace_agent` / `agent_role_error` - the Admin-role / project-lead
  / workspace-owner guard (exigence 8, 11), which applies only to
  WORKSPACE_AGENT bots, never to `is_bot=True` in general - the six
  integration bots keep their existing role=20 membership unchanged.
"""

from django.db.models import Q

from plane.db.models.user import BotTypeEnum

AGENT_ROLE_NOT_ALLOWED_CODE = "AGENT_ROLE_NOT_ALLOWED"
AGENT_ROLE_NOT_ALLOWED_MESSAGE = "An agent can never be granted the Admin role or ownership."

ADMIN_ROLE = 20


def is_workspace_agent(user) -> bool:
    """True only for the first-class agent bot type (exigence 2), never
    for the six category-7 integration bots or WORKSPACE_SEED."""
    if user is None:
        return False
    return bool(getattr(user, "is_bot", False)) and getattr(user, "bot_type", None) == BotTypeEnum.WORKSPACE_AGENT


def member_visibility_q(prefix: str = "") -> Q:
    """Q object equivalent to the old blanket `<prefix>is_bot=False`
    member-visibility filter, except it also lets WORKSPACE_AGENT bots
    through - they're meant to be exactly as visible as a human member
    (assignee selectors, @mention search, member lists). Every other bot
    type (WORKSPACE_SEED, the six category-7 integration bots) stays
    excluded exactly as before.

    `prefix` is the ORM lookup prefix to the User row, e.g. "member__" for
    a WorkspaceMember/ProjectMember queryset, or "" when filtering User
    directly.
    """
    return Q(**{f"{prefix}is_bot": False}) | Q(**{f"{prefix}bot_type": BotTypeEnum.WORKSPACE_AGENT})


def is_member_visible(user) -> bool:
    """Python-level (non-queryset) equivalent of `member_visibility_q`,
    for call sites that already have model instances in hand rather than
    building a queryset filter (e.g. serializer `SerializerMethodField`s)."""
    if user is None:
        return False
    return not getattr(user, "is_bot", False) or getattr(user, "bot_type", None) == BotTypeEnum.WORKSPACE_AGENT


def agent_role_error(field: str = "role") -> dict:
    """Standard 400 error payload for exigence 8 (role=20) / 11
    (project lead). Kept as a plain dict (not a DRF Response) so both
    ViewSet-style (`Response(agent_role_error(), status=400)`) and
    serializer-style (`raise serializers.ValidationError(agent_role_error())`)
    call sites can reuse it verbatim.
    """
    return {
        "error": AGENT_ROLE_NOT_ALLOWED_MESSAGE,
        "error_code": AGENT_ROLE_NOT_ALLOWED_CODE,
        field: AGENT_ROLE_NOT_ALLOWED_MESSAGE,
    }
