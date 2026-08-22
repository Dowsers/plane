# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written DATA migration (per this initiative's convention -
migrations are otherwise always auto-generated via `makemigrations`,
except necessary data migrations like this one) - category 11
(docs/feature-specs/11-admin-security-sso.md in plane-selfhost),
features 3+5 merged, decision #6.

Seeds `InstanceConfiguration.AUDIT_LOG_RETENTION_DAYS` (default 90 days)
for instances that were ALREADY provisioned before this key existed -
`plane.license.management.commands.configure_instance` (which reads
`plane.utils.instance_config_variables.extended_config_variables`, where
this same key is also declared) only ever runs `get_or_create` and is
typically invoked once at first-deploy time, so it will never retroactively
backfill this key on an instance that has already been configured.
No model change - `InstanceConfiguration` is a plain key/value store."""

import os

from django.db import migrations


def seed_audit_log_retention_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.get_or_create(
        key="AUDIT_LOG_RETENTION_DAYS",
        defaults={
            "value": os.environ.get("AUDIT_LOG_RETENTION_DAYS", "90"),
            "category": "SECURITY",
            "is_encrypted": False,
        },
    )


def unseed_audit_log_retention_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.filter(key="AUDIT_LOG_RETENTION_DAYS").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0006_instance_is_current_version_deprecated"),
    ]

    operations = [
        migrations.RunPython(seed_audit_log_retention_config, unseed_audit_log_retention_config),
    ]
