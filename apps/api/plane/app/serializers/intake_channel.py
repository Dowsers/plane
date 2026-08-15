# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IntakeChannel,
    InboundEmailAlias,
    SlackWorkspaceConnection,
    SlackChannelProjectMapping,
    SlackUserConnection,
    SlackIssueThread,
)


class InboundEmailAliasSerializer(BaseSerializer):
    class Meta:
        model = InboundEmailAlias
        fields = ["id", "local_part", "is_active"]
        read_only_fields = ["id", "local_part"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["full_address"] = instance.full_address
        return data


class IntakeChannelSerializer(BaseSerializer):
    email_alias = InboundEmailAliasSerializer(read_only=True)

    class Meta:
        model = IntakeChannel
        fields = ["id", "workspace_id", "project_id", "channel_type", "is_enabled", "config", "email_alias"]
        read_only_fields = ["id", "workspace_id", "project_id"]


class SlackWorkspaceConnectionSerializer(BaseSerializer):
    class Meta:
        model = SlackWorkspaceConnection
        fields = [
            "id",
            "workspace_id",
            "slack_team_id",
            "slack_team_name",
            "bot_user_id",
            "installation_method",
            "is_active",
            "connected_at",
        ]
        # Never expose bot_access_token/signing_secret over the API.
        read_only_fields = fields


class SlackChannelProjectMappingSerializer(BaseSerializer):
    class Meta:
        model = SlackChannelProjectMapping
        fields = [
            "id",
            "project_id",
            "slack_connection",
            "slack_channel_id",
            "slack_channel_name",
            "is_default_for_dm",
            "notify_on",
            "is_active",
        ]
        read_only_fields = ["id", "project_id"]


class SlackUserConnectionSerializer(BaseSerializer):
    class Meta:
        model = SlackUserConnection
        fields = [
            "id",
            "workspace_id",
            "slack_user_id",
            "slack_user_display_name",
            "user",
            "linked_at",
        ]
        read_only_fields = fields


class SlackIssueThreadSerializer(BaseSerializer):
    class Meta:
        model = SlackIssueThread
        fields = [
            "id",
            "issue",
            "slack_channel_id",
            "slack_message_ts",
            "source",
            "created_at",
        ]
        read_only_fields = fields
