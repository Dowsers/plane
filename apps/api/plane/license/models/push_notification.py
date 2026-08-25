# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - "Notifications push en self-hosted", god-mode
admin config for VAPID/FCM/APNs credentials.

STORAGE DECISION (pre-implementation research point 3, worth restating
here since it's the one genuinely security-relevant design choice in this
feature): the spec claims `InstanceConfiguration`-backed secrets are
"never returned in clear by the API", citing the existing SMTP/OpenAI
config as precedent. That claim is FALSE for this fork as it stands today
- `GET /api/instances/configurations/` (`InstanceConfigurationEndpoint`,
`plane.license.api.views.configuration`) decrypts and returns
`EMAIL_HOST_PASSWORD`/`LLM_API_KEY` in cleartext to any instance admin,
because `InstanceConfigurationSerializer.to_representation` unconditionally
decrypts every `is_encrypted` row. Encryption-AT-REST is real; write-only-
via-API is not, for that specific endpoint.

The REAL write-only precedent in this fork is `WorkspaceAIConfig`/
`WorkspaceAIConfigSerializer` (`plane.db.models.ai_config`,
`plane.app.serializers.ai_config`) - `api_key` is an `EncryptedTextField`
that is simply never listed on the serializer at all, so a client only
ever learns whether a key is configured (`is_configured`, a
`SerializerMethodField`), never its value; writes go through the view
directly (`request.data.get("api_key")`), never through the serializer.

This model follows THAT precedent instead of extending
`InstanceConfiguration`: `vapid_private_key`/`fcm_service_account_json`/
`apns_auth_key` are `EncryptedTextField`s that never appear on
`PushNotificationConfigSerializer` (see `plane.license.api.serializers.
push_notification`) - only derived `is_vapid_configured`/
`is_fcm_configured`/`is_apns_configured` booleans do. This sidesteps the
`InstanceConfigurationSerializer` bug entirely rather than requiring a
field-stripping patch to that shared serializer (the other valid option
research offered - not taken here, since a dedicated model+serializer is
self-contained and cannot regress if some future key is added to that
shared table without remembering the strip-list).

SPLIT WITH `InstanceConfiguration` (deliberate, not an oversight): only
the two flags below actually need PUBLIC/authenticated-user visibility
(the frontend "Enable push" toggle needs to know push is even possible,
and needs `VAPID_PUBLIC_KEY` verbatim to call
`pushManager.subscribe({applicationServerKey: ...})`) -
- `PUSH_NOTIFICATIONS_ENABLED` (instance kill switch, exigence 10) - a
  plain "0"/"1" `InstanceConfiguration` row, matching the established
  `ENABLE_SCIM`/`IS_GOOGLE_ENABLED` convention for every other simple
  instance-wide feature flag, editable via the existing generic god-mode
  `PATCH /api/instances/configurations/` - no new view code needed for
  the toggle itself.
- `VAPID_PUBLIC_KEY` - not a secret (it's handed to every browser that
  subscribes), also an ordinary `InstanceConfiguration` row.
Both are also surfaced on the pre-existing PUBLIC `GET /api/instances/`
(`InstanceEndpoint`, `AllowAny`) alongside `IS_GOOGLE_ENABLED` etc., since
a non-admin user's browser needs to read them to decide whether/how to
subscribe - see that view for the wiring.

Everything that IS genuinely secret (`vapid_private_key`) or not needed by
any non-admin caller (`vapid_admin_email`, the FCM/APNs fields) lives on
THIS model instead, reachable only via
`plane.license.api.views.push_notification` (`InstanceAdminPermission`
gated, same as every other god-mode endpoint).

SINGLETON: exactly one row is ever meant to exist (one push config per
instance, not per workspace) - enforced by convention via `get_solo()`
below rather than a DB-level constraint (no existing precedent in this
fork for a hard one-row-table constraint; `Instance` itself has the same
"just one row in practice" shape with no enforced constraint either).

FCM/APNS STUB DECISION: `fcm_service_account_json`/`apns_key_id`/
`apns_team_id`/`apns_auth_key`/`apns_topic` are schema-complete so an
admin can fill them in and this model never needs a second migration, but
the actual SENDING code (`plane.bgtasks.push_notification_task`) only
really implements Web Push (`pywebpush`) - FCM HTTP v1/APNs HTTP2 sending
are present as clearly-labeled stub functions that log and no-op, not
real `firebase-admin`/`aioapns` integrations. Rationale: categories 12
features 1/2/5 (the mobile app itself) were confirmed as total fabrication
- no real mobile client exists anywhere in this repo or its history to
ever call FCM/APNs with a real token, so a fully-wired HTTP v1/HTTP2
client would be genuinely untestable dead code exercising credentials
nobody can supply a real device for. Web Push (this feature's only
reachable path today, per the browser `Notification`/`Push` API) is fully
implemented.
"""

from django.db import models

from plane.db.fields import EncryptedTextField
from plane.db.models import BaseModel


class PushNotificationConfig(BaseModel):
    # VAPID (Web Push) - `VAPID_PUBLIC_KEY` itself lives on
    # `InstanceConfiguration` (see module docstring), not here.
    vapid_private_key = EncryptedTextField(null=True, blank=True)
    # The "sub" claim `pywebpush`/RFC 8292 requires on every VAPID JWT -
    # an admin contact address, not a user secret, but also not something
    # any non-admin caller needs to read, hence living here rather than on
    # the public `InstanceConfiguration` row.
    vapid_admin_email = models.CharField(max_length=255, null=True, blank=True)

    # FCM (HTTP v1 - the only mode targeted, per the spec's own explicit
    # exclusion of the deprecated Legacy Server Key). See module docstring
    # for why sending against this is currently a stub.
    fcm_service_account_json = EncryptedTextField(null=True, blank=True)

    # APNs. `apns_auth_key` is the secret (.p8 file contents); the other
    # three are identifiers, not secrets, but grouped here with their
    # secret sibling rather than split across two stores for no benefit -
    # none of the four are needed by any non-admin caller.
    apns_key_id = models.CharField(max_length=255, null=True, blank=True)
    apns_team_id = models.CharField(max_length=255, null=True, blank=True)
    apns_auth_key = EncryptedTextField(null=True, blank=True)
    apns_topic = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Push Notification Config"
        verbose_name_plural = "Push Notification Configs"
        db_table = "push_notification_configs"
        ordering = ("-created_at",)

    def __str__(self):
        return "Push Notification Config"

    @classmethod
    def get_solo(cls):
        """Returns the single instance-wide config row, creating it (with
        every field at its unset default) on first access. Mirrors the
        "just create it lazily" shape `Instance.objects.first()` callers
        already use elsewhere in this app rather than requiring a
        first-deploy data migration to pre-seed a row."""
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj
