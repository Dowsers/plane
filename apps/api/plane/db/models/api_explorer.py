# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
API Explorer settings - see docs/feature-specs/08-api-webhooks-cli.md
("6. Explorateur d'API interactif") in plane-selfhost.

DESIGN NOTE on satellite-model-vs-flat-boolean: the established convention
elsewhere in this initiative for a *single* per-workspace on/off switch is a
flat boolean directly on `Workspace` (see `is_initiatives_enabled`,
`is_roadmap_enabled`, `is_flexible_query_enabled` in workspace.py, and the
explicit reasoning against a satellite table for that case in
`WorkspaceQuerySettings`'s own module docstring, flexible_query.py). This
model deliberately does NOT follow that precedent, because the task spec
here names a dedicated `WorkspaceAPIExplorerSettings` model explicitly
(unlike the flexible-query spec, which only suggested one) and the feature
has two related-but-independent switches (is the explorer available at
all vs. can Members execute mutating calls through it) that are only ever
read/written together from the same settings panel - grouping them keeps
that panel's endpoint (`WorkspaceAPIExplorerSettingsEndpoint`,
plane/app/views/api_explorer.py) a single get_or_create'd row instead of
two independent flat fields with no shared identity.
"""

# Django imports
from django.db import models

# Module imports
from .base import BaseModel


class WorkspaceAPIExplorerSettings(BaseModel):
    workspace = models.OneToOneField(
        "db.Workspace", on_delete=models.CASCADE, related_name="api_explorer_settings"
    )
    # Per-workspace half of the two-layer gate - the other half is the
    # instance-wide `API_EXPLORER_ENABLED` env var (settings/common.py),
    # which takes priority (schema/ephemeral-token endpoints 404 outright
    # if that is unset), mirroring `FLEXIBLE_QUERY_ENABLED` +
    # `Workspace.is_flexible_query_enabled`. Defaults True (unlike that
    # sibling feature's opt-in default) because the explorer is read-only
    # by default for everyone except Admin (see `allow_members_execute`
    # below) - there is no equivalent "surprises Members with a new nav
    # item" risk to guard against by defaulting it off.
    is_enabled = models.BooleanField(default=True)
    # Spec exigence 14: execution (i.e. actually calling a mutating
    # endpoint through the explorer, as opposed to just browsing the
    # schema/trying GETs) is Admin-only unless this is explicitly turned
    # on. This does not and cannot gate the underlying REST endpoints
    # themselves (the explorer calls them directly from the browser with
    # the user's own token, per the spec's own "hors perimetre" - no new
    # execution/proxy engine) - it gates (a) whether a Member is allowed to
    # mint a `scope=read_write` ephemeral token in the first place (see
    # `APIExplorerEphemeralTokenEndpoint`), which is the one place this
    # backend can actually enforce it, and (b) the frontend's own
    # confirm/disable-execute-button UI built on top of this flag.
    allow_members_execute = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workspace API Explorer Settings"
        verbose_name_plural = "Workspace API Explorer Settings"
        db_table = "workspace_api_explorer_settings"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace_id} api explorer settings"
