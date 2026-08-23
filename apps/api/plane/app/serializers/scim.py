# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif" - `SCIMToken` serializers for
the ADMIN-facing (workspace-settings) surface, `plane.app.views.workspace.
scim_admin`. This is the "manage my SCIM setup" surface, session-
authenticated, this fork's normal conventions - NOT the `/api/scim/v2/*`
protocol surface itself (`plane.scim`), which never uses DRF serializers
at all (it builds/parses RFC 7644 JSON shapes directly, see
`plane.scim.resources`).

Mirrors `APITokenSerializer`/`APITokenReadSerializer`'s own write/read
split (`plane.app.serializers.api`) - but note `SCIMToken` has no `token`
FIELD to serialize at all (decision #2 - only `token_hash`, HMAC-SHA256,
is ever persisted). `SCIMTokenWriteSerializer.token` is therefore a
`SerializerMethodField` reading a transient `_raw_token` attribute the
CREATE view attaches to the just-created instance in memory (never
persisted) - the one and only place the raw value exists outside the
IdP's own configuration.
"""

from rest_framework import serializers

from plane.db.models import SCIMToken

from .base import BaseSerializer


class SCIMTokenWriteSerializer(BaseSerializer):
    """Creation-response shape only - the raw token is shown exactly
    once. Never used to render a list/detail GET."""

    token = serializers.SerializerMethodField()

    class Meta:
        model = SCIMToken
        fields = ["id", "workspace", "label", "is_active", "last_used_at", "created_at", "created_by", "token"]
        # "token" is a SerializerMethodField (always implicitly read-only,
        # see get_token below) - only the genuine model fields need to be
        # listed here; DRF errors if an explicitly-declared field is also
        # named in read_only_fields.
        read_only_fields = ["id", "workspace", "label", "is_active", "last_used_at", "created_at", "created_by"]

    def get_token(self, obj) -> str:
        return getattr(obj, "_raw_token", "")


class SCIMTokenReadSerializer(BaseSerializer):
    """List/detail shape - `token_hash` is never included, matching
    `APITokenReadSerializer`'s own `exclude = ("token",)` precedent."""

    class Meta:
        model = SCIMToken
        exclude = ("token_hash",)
