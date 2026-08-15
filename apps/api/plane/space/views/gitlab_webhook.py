# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Public inbound GitLab webhook endpoint - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif", exigences
13-14) in plane-selfhost. Resolution via `repository_id` in the URL
(rather than a header, unlike the GitHub receiver) matches this
feature's own cardinality: a `GitlabRepository` maps to at most one Plane
project (enforced at the model level, see gitlab_integration.py), so
there is exactly one webhook/one secret per repository - no ambiguity to
resolve via a hook-id header the way GitHub's monorepo-friendly
one-repo-to-many-syncs design requires.
"""

import json

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .base import BaseAPIView
from plane.bgtasks.gitlab_sync_task import process_gitlab_webhook_event
from plane.db.models import GitlabRepository
from plane.utils.exception_logger import log_exception
from plane.utils.gitlab_signature import verify_gitlab_token


class GitlabWebhookThrottle(SimpleRateThrottle):
    scope = "gitlab_webhook"
    rate = "120/min"

    def get_cache_key(self, request, view):
        repository_id = view.kwargs.get("repository_id", "unknown")
        return self.cache_format % {"scope": self.scope, "ident": repository_id}


class GitlabWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [GitlabWebhookThrottle]

    def post(self, request, repository_id):
        body = request.body if isinstance(request.body, bytes) else str(request.body).encode("utf-8")

        repository = GitlabRepository.objects.filter(pk=repository_id).first()
        if repository is None:
            log_exception(Exception(f"gitlab_webhook: unknown repository {repository_id}"), warning=True)
            return Response({"error": "Unknown repository"}, status=status.HTTP_404_NOT_FOUND)

        provided_token = request.headers.get("X-Gitlab-Token")
        if not verify_gitlab_token(repository.webhook_secret_token, provided_token):
            log_exception(Exception(f"gitlab_webhook: invalid token for repository {repository_id}"), warning=True)
            return Response({"error": "Invalid token"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = json.loads(body or b"{}")
        except (TypeError, ValueError):
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        # Dispatched to Celery so this view can respond well within
        # GitLab's own retry window (exigence 14 - "moins de 5 secondes").
        process_gitlab_webhook_event.delay(repository_id=str(repository.id), payload=payload)

        return Response({"status": "accepted"}, status=status.HTTP_200_OK)
