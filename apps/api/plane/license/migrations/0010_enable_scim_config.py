# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written DATA migration (per this initiative's convention -
migrations are otherwise always auto-generated via `makemigrations`, except
necessary data migrations like this one and its two direct precedents,
0007_audit_log_retention_config / 0008_instance_max_session_timeout_config)
- category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 ("SCIM 2.0 natif").

Seeds `InstanceConfiguration.ENABLE_SCIM` (default "0" - off) for instances
that were ALREADY provisioned before this key existed -
`plane.license.management.commands.configure_instance` (which reads
`plane.utils.instance_config_variables.extended_config_variables`, where
this same key is also declared) only ever runs `get_or_create` and is
typically invoked once at first-deploy time, so it will never
retroactively backfill this key on an instance that has already been
configured. No model change - `InstanceConfiguration` is a plain key/value
store."""

import os

from django.db import migrations


def seed_enable_scim_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.get_or_create(
        key="ENABLE_SCIM",
        defaults={
            "value": os.environ.get("ENABLE_SCIM", "0"),
            "category": "SECURITY",
            "is_encrypted": False,
        },
    )


def unseed_enable_scim_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.filter(key="ENABLE_SCIM").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0009_instancesamlconfiguration_samlverifieddomain_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_enable_scim_config, unseed_enable_scim_config),
    ]
