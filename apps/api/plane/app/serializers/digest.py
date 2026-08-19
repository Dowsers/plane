# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializers for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost), feature 5 - "Digest periodique automatise". See
`plane.app.views.digest` for the endpoints and `plane.db.models.digest` for
the model shapes.
"""

from rest_framework import serializers

from plane.db.models import DigestItem, DigestPreference, DigestRun, Workspace

from .base import BaseSerializer
from .user import UserLiteSerializer


class DigestPreferenceSerializer(BaseSerializer):
    """Read/write - `GET`/`PATCH .../users/me/digest-preferences/`. `user`/
    `workspace` are set by the view (the row is always "my own preference
    in this workspace"), never client-writable.

    `custom_projects` is read-only here, same convention as
    `SLAPolicySerializer.project_ids` - a plain writable
    `PrimaryKeyRelatedField(many=True)` would silently accept project ids
    from another workspace with no cross-workspace check. The view applies
    writes to the M2M directly after validating each id belongs to this
    preference's own workspace.
    """

    custom_projects = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = DigestPreference
        fields = [
            "id",
            "user",
            "workspace",
            "is_enabled",
            "frequency",
            "day_of_week",
            "time_of_day",
            "scope",
            "custom_projects",
            "send_in_app",
            "send_email",
            "send_audio",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "workspace", "created_at", "updated_at"]


class DigestItemSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = DigestItem
        fields = [
            "id",
            "digest_run",
            "project",
            "cycle",
            "issue",
            "item_type",
            "actor",
            "actor_detail",
            "payload",
            "position",
            "created_at",
        ]
        read_only_fields = fields


class DigestRunSerializer(BaseSerializer):
    """List shape - `GET .../users/me/digests/`. Deliberately excludes
    `summary_text`/`items` (kept for the detail endpoint only) to keep the
    paginated list response light."""

    class Meta:
        model = DigestRun
        fields = [
            "id",
            "workspace",
            "period_start",
            "period_end",
            "frequency",
            "status",
            "generation_method",
            "item_count",
            "sent_at",
            "created_at",
        ]
        read_only_fields = fields


class DigestRunDetailSerializer(BaseSerializer):
    """Detail shape - `GET .../users/me/digests/<id>/`. `items_by_project`
    groups the flat `items` list by project (then item type) for the UI,
    matching the "Considerations API/UX" wording ("detail d'un digest avec
    ses items groupes par projet/cycle") - the flat `items` list is also
    included for callers that would rather group client-side.
    """

    items = DigestItemSerializer(many=True, read_only=True)
    items_by_project = serializers.SerializerMethodField()

    class Meta:
        model = DigestRun
        fields = [
            "id",
            "workspace",
            "period_start",
            "period_end",
            "frequency",
            "status",
            "generation_method",
            "summary_text",
            "item_count",
            "sent_at",
            "created_at",
            "items",
            "items_by_project",
        ]
        read_only_fields = fields

    def get_items_by_project(self, instance):
        grouped = {}
        order = []
        for item in instance.items.all():
            project_id = str(item.project_id)
            project_name = (item.payload or {}).get("project_name", "")
            if project_id not in grouped:
                grouped[project_id] = {"project_id": project_id, "project_name": project_name, "items_by_type": {}}
                order.append(project_id)
            grouped[project_id]["items_by_type"].setdefault(item.item_type, []).append(
                DigestItemSerializer(item).data
            )
        return [grouped[project_id] for project_id in order]


class WorkspaceDigestSettingsSerializer(BaseSerializer):
    """Admin-only workspace settings - `GET`/`PATCH .../digest-settings/`
    (exigence 13)."""

    class Meta:
        model = Workspace
        fields = ["id", "digest_feature_enabled", "is_digest_llm_enrichment_enabled"]
        read_only_fields = ["id"]
