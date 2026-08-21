# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers
import base64

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.utils.content_validator import (
    validate_binary_data,
    validate_html_content,
)
from plane.db.models import (
    Page,
    PageCollection,
    PageComment,
    PageCommentReaction,
    PageLabel,
    PageReaction,
    PageSubscriber,
    Label,
    ProjectPage,
    Project,
    PageVersion,
)


class PageSerializer(BaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)
    labels = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Label.objects.all()),
        write_only=True,
        required=False,
    )
    # Many to many
    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    # Category 10, feature 4 ("Wiki workspace en GA") - read-only on this
    # shared serializer on purpose: `is_global`/`collection_id`/
    # `sort_order` are mutated exclusively through the dedicated
    # workspace-scoped `convert`/`reorder` endpoints
    # (`plane.app.views.page.workspace`), never through a generic PATCH,
    # since each of those three carries invariants (max Collection depth,
    # descendant cascade, ProjectPage link bookkeeping) a plain
    # serializer.save() can't safely express. `collection_id` reads
    # `instance.collection_id` directly (the FK's attname) rather than
    # joining through `collection` to avoid an extra query on every list
    # row.
    collection_id = serializers.UUIDField(read_only=True)
    # Category 10, features 1+3 (merged, "Commentaires ancres sur les
    # Pages" + "Resolution de fils de commentaires") - decision #11:
    # computed via a queryset annotation
    # (`plane.app.views.page.base.PageViewSet.get_queryset`/
    # `plane.app.views.page.workspace.WorkspacePageViewSet.get_queryset`),
    # NOT denormalized on `Page` - same precedent as `TIssue.sub_issues_count`.
    unresolved_comment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "owned_by",
            "access",
            "color",
            "labels",
            "parent",
            "is_favorite",
            "is_locked",
            "archived_at",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "view_props",
            "logo_props",
            "label_ids",
            "project_ids",
            "is_global",
            "collection_id",
            "sort_order",
            "unresolved_comment_count",
        ]
        read_only_fields = ["workspace", "owned_by", "is_global", "collection_id", "sort_order"]

    def create(self, validated_data):
        labels = validated_data.pop("labels", None)
        project_id = self.context["project_id"]
        owned_by_id = self.context["owned_by_id"]
        description_json = self.context["description_json"]
        description_binary = self.context["description_binary"]
        description_html = self.context["description_html"]

        # Get the workspace id from the project
        project = Project.objects.get(pk=project_id)

        # Create the page
        page = Page.objects.create(
            **validated_data,
            description_json=description_json,
            description_binary=description_binary,
            description_html=description_html,
            owned_by_id=owned_by_id,
            workspace_id=project.workspace_id,
        )

        # Create the project page
        ProjectPage.objects.create(
            workspace_id=page.workspace_id,
            project_id=project_id,
            page_id=page.id,
            created_by_id=page.created_by_id,
            updated_by_id=page.updated_by_id,
        )

        # Category 10, feature 5 ("Abonnements/notifications par page"),
        # exigence 3 - the creator is automatically subscribed, no action
        # required.
        PageSubscriber.objects.get_or_create(
            page=page,
            subscriber_id=owned_by_id,
            defaults={
                "workspace_id": page.workspace_id,
                "subscribed_manually": True,
                "created_by_id": page.created_by_id,
                "updated_by_id": page.updated_by_id,
            },
        )

        # Create page labels
        if labels is not None:
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=page,
                        workspace_id=page.workspace_id,
                        created_by_id=page.created_by_id,
                        updated_by_id=page.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )
        return page

    def update(self, instance, validated_data):
        labels = validated_data.pop("labels", None)
        if labels is not None:
            PageLabel.objects.filter(page=instance).delete()
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=instance,
                        workspace_id=instance.workspace_id,
                        created_by_id=instance.created_by_id,
                        updated_by_id=instance.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )

        return super().update(instance, validated_data)


class PageDetailSerializer(PageSerializer):
    description_html = serializers.CharField()

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["description_html"]


class PageVersionSerializer(BaseSerializer):
    class Meta:
        model = PageVersion
        fields = [
            "id",
            "workspace",
            "page",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "page"]


class PageVersionDetailSerializer(BaseSerializer):
    class Meta:
        model = PageVersion
        fields = [
            "id",
            "workspace",
            "page",
            "last_saved_at",
            "description_binary",
            "description_html",
            "description_json",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "page"]


class PageBinaryUpdateSerializer(serializers.Serializer):
    """Serializer for updating page binary description with validation"""

    description_binary = serializers.CharField(required=False, allow_blank=True)
    description_html = serializers.CharField(required=False, allow_blank=True)
    description_json = serializers.JSONField(required=False, allow_null=True)

    def validate_description_binary(self, value):
        """Validate the base64-encoded binary data"""
        if not value:
            return value

        try:
            # Decode the base64 data
            binary_data = base64.b64decode(value)

            # Validate the binary data
            is_valid, error_message = validate_binary_data(binary_data)
            if not is_valid:
                raise serializers.ValidationError(f"Invalid binary data: {error_message}")

            return binary_data
        except Exception as e:
            if isinstance(e, serializers.ValidationError):
                raise
            raise serializers.ValidationError("Failed to decode base64 data")

    def validate_description_html(self, value):
        """Validate the HTML content"""
        if not value:
            return value

        # Use the validation function from utils
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_message)

        # Return sanitized HTML if available, otherwise return original
        return sanitized_html if sanitized_html is not None else value

    def update(self, instance, validated_data):
        """Update the page instance with validated data"""
        if "description_binary" in validated_data:
            instance.description_binary = validated_data.get("description_binary")

        if "description_html" in validated_data:
            instance.description_html = validated_data.get("description_html")

        if "description_json" in validated_data:
            instance.description_json = validated_data.get("description_json")

        instance.save()
        return instance


class PageSubscriberSerializer(BaseSerializer):
    """Category 10, feature 5 ("Abonnements/notifications par page") -
    backs `GET .../subscribers/` (exigence 12: "id, avatar, display_name").
    """

    subscriber_detail = UserLiteSerializer(read_only=True, source="subscriber")

    class Meta:
        model = PageSubscriber
        fields = "__all__"
        read_only_fields = ["workspace", "page", "subscriber", "deleted_at"]


class PageReactionSerializer(BaseSerializer):
    """Category 10, feature 2 - mirrors IssueReactionSerializer exactly."""

    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = PageReaction
        fields = "__all__"
        read_only_fields = ["workspace", "page", "actor", "deleted_at"]


class PageCommentReactionSerializer(BaseSerializer):
    """Category 10, features 1+3 (merged) - mirrors `PageReactionSerializer`
    exactly, scoped to `PageComment` instead of `Page`.
    """

    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = PageCommentReaction
        fields = "__all__"
        read_only_fields = ["workspace", "comment", "actor", "deleted_at"]


class PageCommentSerializer(BaseSerializer):
    """Category 10, features 1+3 (merged, "Commentaires ancres sur les
    Pages" + "Resolution de fils de commentaires") - mirrors
    `IssueCommentSerializer`'s shape/fields where it makes sense.

    `page`/`parent`/`anchor_id`/`anchor_text`/`is_orphaned`/`is_resolved`/
    `resolved_by`/`resolved_at`/`actor` are all read-only here: the
    *viewset* decides every one of them (root create vs. the dedicated
    `replies`/`resolve`/`reopen` actions), never a generic PATCH - same
    reasoning `PageSerializer` above already documents for
    `is_global`/`collection_id`/`sort_order`. `anchor_id`/`anchor_text` ARE
    writable, but only through `PageCommentCreateSerializer` below (root
    creation only) - this plain serializer is used for read/list/detail
    output and for the author-only text edit (PATCH), where the anchor
    must stay untouchable.
    """

    actor_detail = UserLiteSerializer(read_only=True, source="actor")
    reactions = PageCommentReactionSerializer(read_only=True, many=True)
    replies = serializers.SerializerMethodField()

    class Meta:
        model = PageComment
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "page",
            "parent",
            "anchor_id",
            "anchor_text",
            "is_orphaned",
            "is_resolved",
            "resolved_by",
            "resolved_at",
            "actor",
            "deleted_at",
        ]

    def get_replies(self, obj):
        # Only a thread root ever has replies of its own - a reply's
        # `replies` accessor would technically still resolve (self-FK) but
        # is never meant to be populated; short-circuiting avoids an
        # unnecessary query on every reply row when a whole thread
        # (root + replies) is serialized together.
        if obj.parent_id is not None:
            return []
        replies = obj.replies.all().order_by("created_at")
        return PageCommentSerializer(replies, many=True, context=self.context).data


class PageCommentCreateSerializer(PageCommentSerializer):
    """Root-thread creation only (`PageCommentViewSet.create` and its
    workspace-scoped counterpart) - the one place `anchor_id`/`anchor_text`
    are genuinely client-writable (feature 1 exigence 1/2: the client mints
    `anchor_id` client-side when the Tiptap `InlineComment` Mark is
    inserted, and snapshots `anchor_text` from the current selection).
    Replies (`.../replies/`) reuse the plain `PageCommentSerializer`
    instead, since anchor fields must stay untouchable there - a reply
    inherits the root's anchor (feature 1 exigence 3), it never carries
    its own.

    `anchor_id` is made required here (the model field itself is
    `null=True` to stay valid for a reply) since every root MUST carry one.
    """

    anchor_id = serializers.UUIDField(required=True)

    class Meta(PageCommentSerializer.Meta):
        read_only_fields = [
            field for field in PageCommentSerializer.Meta.read_only_fields if field not in ("anchor_id", "anchor_text")
        ]


class PageCollectionSerializer(BaseSerializer):
    """Category 10, feature 4 ("Wiki workspace en GA") - folders used to
    organize workspace-level Wiki pages. `parent` is the one writable
    field with real invariants (max nesting depth of 3, no cycles) - see
    `validate_parent` below and `plane.utils.page_collection` for the
    depth-computation helpers it shares with the reparent/delete-cascade
    logic in `plane.app.views.page.workspace`.
    """

    class Meta:
        model = PageCollection
        fields = [
            "id",
            "workspace",
            "parent",
            "name",
            "logo_props",
            "sort_order",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "sort_order"]

    def validate_parent(self, value):
        from plane.utils.page_collection import validate_collection_depth

        if value is None:
            return value

        workspace_id = self.context.get("workspace_id") or (self.instance.workspace_id if self.instance else None)
        if workspace_id and str(value.workspace_id) != str(workspace_id):
            raise serializers.ValidationError("The parent Collection must belong to the same workspace.")

        if self.instance is not None:
            if value.id == self.instance.id:
                raise serializers.ValidationError("A Collection cannot be its own parent.")

            from plane.utils.page_collection import collection_descendant_ids

            if value.id in collection_descendant_ids(self.instance):
                raise serializers.ValidationError("A Collection cannot be moved under one of its own descendants.")

        try:
            validate_collection_depth(new_parent=value, existing_instance=self.instance)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

        return value


class WorkspacePageSerializer(PageSerializer):
    """Category 10, feature 4 ("Wiki workspace en GA") - the create() path
    for the workspace-scoped `/pages/` endpoint. Deliberately does NOT
    reuse `PageSerializer.create()`: that path always creates exactly one
    `ProjectPage` row from a required `project_id` context value, which is
    the opposite of what a workspace Page needs (`is_global=True`, zero
    `ProjectPage` rows, optionally filed straight into a Collection at
    creation time via the `collection_id` context value).
    """

    def create(self, validated_data):
        labels = validated_data.pop("labels", None)
        owned_by_id = self.context["owned_by_id"]
        workspace_id = self.context["workspace_id"]
        collection_id = self.context.get("collection_id")
        description_json = self.context["description_json"]
        description_binary = self.context["description_binary"]
        description_html = self.context["description_html"]

        page = Page.objects.create(
            **validated_data,
            description_json=description_json,
            description_binary=description_binary,
            description_html=description_html,
            owned_by_id=owned_by_id,
            workspace_id=workspace_id,
            is_global=True,
            collection_id=collection_id,
        )

        # Category 10, feature 5 - see PageSerializer.create's own comment.
        PageSubscriber.objects.get_or_create(
            page=page,
            subscriber_id=owned_by_id,
            defaults={
                "workspace_id": page.workspace_id,
                "subscribed_manually": True,
                "created_by_id": page.created_by_id,
                "updated_by_id": page.updated_by_id,
            },
        )

        if labels is not None:
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=page,
                        workspace_id=page.workspace_id,
                        created_by_id=page.created_by_id,
                        updated_by_id=page.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )
        return page


class WorkspacePageDetailSerializer(WorkspacePageSerializer):
    description_html = serializers.CharField()

    class Meta(WorkspacePageSerializer.Meta):
        fields = WorkspacePageSerializer.Meta.fields + ["description_html"]
