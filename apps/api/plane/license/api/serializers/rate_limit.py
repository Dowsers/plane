# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.db.models import RateLimitTier
from plane.app.serializers import BaseSerializer


class RateLimitTierSerializer(BaseSerializer):
    class Meta:
        model = RateLimitTier
        fields = "__all__"
        read_only_fields = ["id", "key", "is_default", "created_at", "updated_at"]
