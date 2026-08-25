# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written DATA migration (per this initiative's convention -
migrations are otherwise always auto-generated via `makemigrations`,
except necessary data migrations like this one and its direct precedents,
0007_audit_log_retention_config / 0008_instance_max_session_timeout_config
/ 0010_enable_scim_config) - category 12
(docs/feature-specs/12-keyboard-mobile-desktop.md in plane-selfhost),
feature 3 ("Notifications push en self-hosted").

Seeds `InstanceConfiguration.PUSH_NOTIFICATIONS_ENABLED` (default "0" -
off, exigence 10's own explicit "pas d'activation surprise" requirement
for an instance being upgraded) and `VAPID_PUBLIC_KEY` (default "" - unset
until an admin generates/enters a keypair) for instances that were
ALREADY provisioned before these keys existed -
`plane.license.management.commands.configure_instance` (which reads
`plane.utils.instance_config_variables.extended_config_variables`, where
these same two keys are also declared) only ever runs `get_or_create` and
is typically invoked once at first-deploy time, so it will never
retroactively backfill these keys on an instance that has already been
configured. No model change - `InstanceConfiguration` is a plain
key/value store."""

import os

from django.db import migrations


def seed_push_notification_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.get_or_create(
        key="PUSH_NOTIFICATIONS_ENABLED",
        defaults={
            "value": os.environ.get("PUSH_NOTIFICATIONS_ENABLED", "0"),
            "category": "PUSH_NOTIFICATIONS",
            "is_encrypted": False,
        },
    )
    InstanceConfiguration.objects.get_or_create(
        key="VAPID_PUBLIC_KEY",
        defaults={
            "value": os.environ.get("VAPID_PUBLIC_KEY", ""),
            "category": "PUSH_NOTIFICATIONS",
            "is_encrypted": False,
        },
    )


def unseed_push_notification_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.filter(key__in=["PUSH_NOTIFICATIONS_ENABLED", "VAPID_PUBLIC_KEY"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0011_push_notification_models"),
    ]

    operations = [
        migrations.RunPython(seed_push_notification_config, unseed_push_notification_config),
    ]
