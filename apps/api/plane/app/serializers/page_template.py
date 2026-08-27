# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import PageTemplate


class PageTemplateWriteSerializer(BaseSerializer):
    class Meta:
        model = PageTemplate
        fields = ["id", "name", "description_html", "description_json", "logo_props"]

    def validate(self, data):
        name = data.get("name")
        if name is not None:
            workspace_id = self.context["workspace_id"]
            existing = PageTemplate.objects.filter(workspace_id=workspace_id, name__iexact=name)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({"name": "A page template with this name already exists"})
        return data


class PageTemplateListSerializer(BaseSerializer):
    """Compact shape for the template gallery/management list - no
    description payload, mirrors ProjectTemplateListSerializer.
    """

    class Meta:
        model = PageTemplate
        fields = [
            "id",
            "workspace_id",
            "name",
            "logo_props",
            "usage_count",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields


class PageTemplateSerializer(BaseSerializer):
    """Full shape for the template editor / detail view / gallery preview,
    including the rich-text content."""

    class Meta:
        model = PageTemplate
        fields = [
            "id",
            "workspace_id",
            "name",
            "description_html",
            "description_json",
            "logo_props",
            "usage_count",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "workspace_id", "usage_count", "created_at", "updated_at", "created_by"]
