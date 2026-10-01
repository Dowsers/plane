# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written DATA migration (per this repo's convention - migrations are
otherwise always auto-generated via `makemigrations`, except necessary data
migrations like this one and its precedents 0007/0008/0010/0012) - inspection
compliance (ISO/IEC 17020 §4.1/§4.2).

Seeds `InstanceConfiguration.ENABLE_INSPECTION_ENFORCEMENT` (default "0" -
off) for instances ALREADY provisioned before this key existed.
`plane.license.management.commands.configure_instance` (which reads
`plane.utils.instance_config_variables.extended_config_variables`, where this
same key is also declared) only ever runs `get_or_create` and is typically
invoked once at first-deploy time, so it never retroactively backfills a key
on an instance that has already been configured.

Defaulting off is not timidity: this switch gates a check that can deny READ
access to a project, so an upgrade must not turn it on by itself. See
`plane.utils.inspection_compliance` for the gate and its three independent
lockout escape hatches. No model change - `InstanceConfiguration` is a plain
key/value store.
"""

import os

from django.db import migrations


def seed_enable_inspection_enforcement_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.get_or_create(
        key="ENABLE_INSPECTION_ENFORCEMENT",
        defaults={
            "value": os.environ.get("ENABLE_INSPECTION_ENFORCEMENT", "0"),
            "category": "SECURITY",
            "is_encrypted": False,
        },
    )


def unseed_enable_inspection_enforcement_config(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.filter(key="ENABLE_INSPECTION_ENFORCEMENT").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0012_push_notification_instance_config"),
    ]

    operations = [
        migrations.RunPython(
            seed_enable_inspection_enforcement_config,
            unseed_enable_inspection_enforcement_config,
        ),
    ]
