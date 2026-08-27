# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared bot-actor helper for category 7 integrations
(`docs/feature-specs/07-integrations-git.md` in plane-selfhost -
GitHub/GitLab/Slack/Figma/Sentry/Zendesk connectors all need a system
actor to attribute automated `IssueActivity`/comments/state changes to,
"GitHub Bot a change le statut...", etc.).

Research before this category found the specs' own cited precedent
("imports automatises Jira/Linear") doesn't exist as a real feature in
this fork - the actual, working bot-actor pattern is `BotTypeEnum` +
a real bot `User` row, used today by exactly one caller,
`plane.bgtasks.workspace_seed_task` (`bot_type=BotTypeEnum.WORKSPACE_SEED`,
one bot per newly-created workspace, `role=20` workspace-membership so
the bot can actually write project data). This module generalizes that
exact shape - one bot per (workspace, bot_type) pair, created once and
reused - to every category 7 connector, rather than each feature
reimplementing user creation independently six times with six subtly
different shapes.

Also reused, unmodified, by category 9 feature 1 (AI-assisted auto-triage,
`BotTypeEnum.AI_TRIAGE_BOT`, see `plane.utils.issue_triage_suggestion`) -
the same "one bot per (workspace, bot_type)" shape applies equally well to
an internally-generated automation actor as it does to an external
connector's actor, so no second factory was written.
"""

import uuid

from django.contrib.auth.hashers import make_password

from plane.db.models import User, WorkspaceMember
from plane.db.models.user import BotTypeEnum

# Human-readable defaults for the activity feed / member list - a connector
# can override `display_name` at call time if a per-connection nickname is
# ever wanted (e.g. a GitHub org name), but the bot's underlying `bot_type`
# and email are always the fixed, deterministic ones below so repeated
# calls for the same (workspace, bot_type) never create a second bot.
DEFAULT_BOT_DISPLAY_NAMES = {
    BotTypeEnum.GITHUB_BOT: "GitHub Bot",
    BotTypeEnum.GITLAB_BOT: "GitLab Bot",
    BotTypeEnum.SLACK_BOT: "Slack Bot",
    # 14d ("Intake Email and Slack", levee du squelette, exigence 6).
    BotTypeEnum.EMAIL_BOT: "Email Bot",
    BotTypeEnum.FIGMA_BOT: "Figma Bot",
    BotTypeEnum.SENTRY_BOT: "Sentry Bot",
    BotTypeEnum.SUPPORT_BOT: "Support Bot",
    # Category 9 feature 1 (docs/feature-specs/09-ai-features.md "1.
    # Auto-triage assiste par IA" in plane-selfhost, exigence 6) - matches
    # the spec's own suggested display name ("compte bot 'Plane AI'").
    BotTypeEnum.AI_TRIAGE_BOT: "Plane AI",
    # Category 9 feature 3 (docs/feature-specs/09-ai-features.md "3.
    # Assistant de chat IA in-app" in plane-selfhost) - the @mentionable
    # display name shown in autocomplete and as the comment-reply author,
    # matching the spec's own literal `@AI Assistant` wording (exigence 1b).
    BotTypeEnum.AI_ASSISTANT_BOT: "AI Assistant",
}

# Workspace role granted to every integration bot - matches the existing
# `workspace_seed_task` bot precedent exactly (role=20, Admin). A narrower
# role was considered and rejected: these bots write across whichever
# projects a connector is configured for, which isn't knowable in advance
# at bot-creation time (a GitHub sync can be added to more projects later),
# and every other bot precedent in this codebase already uses Admin rather
# than trying to keep a bot's membership role in sync with its connector's
# evolving project scope.
INTEGRATION_BOT_WORKSPACE_ROLE = 20


def get_or_create_integration_bot(workspace, bot_type, display_name=None):
    """Returns the (possibly newly-created) bot `User` for this
    `(workspace, bot_type)` pair, with active `WorkspaceMember` membership.
    Idempotent: a second call for the same pair returns the same bot,
    never creates a duplicate - identity is keyed on the deterministic
    email `bot_user_{bot_type}_{workspace.id}@plane.so`, the same
    email-as-identity convention `workspace_seed_task` already uses (just
    parameterized by `bot_type` so multiple distinct bots can coexist per
    workspace, where the seed task only ever needed one).
    """
    email = f"bot_user_{bot_type.lower()}_{workspace.id}@plane.so"
    bot_user = User.objects.filter(email=email, is_bot=True).first()
    if bot_user is None:
        resolved_name = display_name or DEFAULT_BOT_DISPLAY_NAMES.get(bot_type, "Integration Bot")
        bot_user = User.objects.create(
            username=f"bot_user_{bot_type.lower()}_{workspace.id}",
            display_name=resolved_name,
            first_name=resolved_name,
            last_name="",
            is_bot=True,
            bot_type=bot_type,
            email=email,
            password=make_password(uuid.uuid4().hex),
            is_password_autoset=True,
        )

    WorkspaceMember.objects.get_or_create(
        workspace=workspace,
        member=bot_user,
        defaults={"role": INTEGRATION_BOT_WORKSPACE_ROLE, "company_role": ""},
    )
    return bot_user
