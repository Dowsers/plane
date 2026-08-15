# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Public inbound webhook routes for category 7 features 1 and 2 - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif", "2. GitLab
natif") in plane-selfhost. Mounted under `/api/public/` (see
plane/urls.py), same namespace as the existing Slack/Sentry/Support
inbound webhooks.

DEVIATION FROM THE SPECS' OWN LITERAL PATHS: the GitHub spec's own
"Considerations API/UX" suggests `POST /webhooks/github/` "hors espace de
nom workspace" and the GitLab spec suggests
`POST /integrations/gitlab/webhook/{repository_id}/` un-namespaced under
`/api/`. Both are placed under `/api/public/` instead, for consistency
with every other real, working inbound-webhook precedent in this fork
(Slack events/interactive, Sentry, support-desk - see
plane/space/urls/intake.py and plane/space/urls/integrations.py) rather
than inventing a fourth different namespacing convention.
"""

from django.urls import path

from plane.space.views import GithubWebhookEndpoint, GitlabWebhookEndpoint

urlpatterns = [
    path("webhooks/github/", GithubWebhookEndpoint.as_view(), name="github-webhook"),
    path(
        "integrations/gitlab/webhook/<uuid:repository_id>/",
        GitlabWebhookEndpoint.as_view(),
        name="gitlab-webhook",
    ),
]
