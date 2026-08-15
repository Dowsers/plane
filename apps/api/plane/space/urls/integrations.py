# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Public inbound webhook routes for category 7 features 5 and 6 - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native", "6. Pont support client type Zendesk/Front") in plane-selfhost.
Mounted under `/api/public/` (see plane/urls.py), same namespace as the
existing Slack/email inbound webhooks (plane/space/urls/intake.py).
"""

from django.urls import path

from plane.space.views import SentryWebhookEndpoint, SupportWebhookEndpoint

urlpatterns = [
    path(
        "integrations/sentry/webhook/<uuid:connection_id>/",
        SentryWebhookEndpoint.as_view(),
        name="sentry-webhook",
    ),
    path(
        "support-webhooks/<uuid:connector_id>/<str:inbound_token>/",
        SupportWebhookEndpoint.as_view(),
        name="support-webhook",
    ),
]
