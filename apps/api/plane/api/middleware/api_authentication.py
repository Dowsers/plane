# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone
from django.db.models import Q

# Third party imports
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed

# Module imports
from plane.db.models import AgentProfile, APIToken


class APIKeyAuthentication(authentication.BaseAuthentication):
    """
    Authentication with an API Key
    """

    www_authenticate_realm = "api"
    media_type = "application/json"
    auth_header_name = "X-Api-Key"

    def get_api_token(self, request):
        return request.headers.get(self.auth_header_name)

    def validate_api_token(self, token):
        try:
            api_token = APIToken.objects.get(
                Q(Q(expired_at__gt=timezone.now()) | Q(expired_at__isnull=True)),
                token=token,
                is_active=True,
            )
        except APIToken.DoesNotExist:
            raise AuthenticationFailed("Given API token is not valid")

        # save api token last used
        api_token.last_used = timezone.now()
        api_token.save(update_fields=["last_used"])

        # Category 9 feature 7 (docs/feature-specs/09-ai-features.md "7.
        # Type d'acteur agent de premiere classe" in plane-selfhost) -
        # cheap active/inactive indicator for the agent settings UI
        # (`AgentProfile.last_seen_at`), updated on every request
        # authenticated by one of that agent's tokens. A single UPDATE,
        # no extra SELECT - this is the real, wired-in equivalent of the
        # "middleware" the spec's data model section gestures at, without
        # actually adding a new middleware class.
        if api_token.agent_id:
            AgentProfile.objects.filter(pk=api_token.agent_id).update(last_seen_at=timezone.now())

        # Returning the APIToken instance itself (not just the raw token
        # string) as the DRF "auth" object lets `request.auth.scope` be
        # read directly wherever a permission/view needs it (see
        # `plane.api.views.base.APITokenScopePermission`) without a second
        # lookup by token string. Confirmed safe: nothing in this codebase
        # reads `request.auth` today (it would previously have gotten the
        # token string), so there is no prior expectation to preserve.
        return (api_token.user, api_token)

    def authenticate(self, request):
        token = self.get_api_token(request=request)
        if not token:
            return None

        # Validate the API token
        user, token = self.validate_api_token(token)
        return user, token
