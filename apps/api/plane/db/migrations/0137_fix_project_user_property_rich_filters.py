from django.db import migrations

from plane.utils.filters import LegacyToRichFiltersConverter
from plane.utils.filters.filter_migrations import (
    migrate_models_filters_to_rich_filters,
    clear_models_rich_filters,
)


# Corrective follow-up to 0107_migrate_filters_to_rich_filters.py, which
# referenced a nonexistent model name ("IssueUserProperty" - the real model
# is "ProjectUserProperty"), silently caught by its own broad except-and-log,
# so ProjectUserProperty.rich_filters was never backfilled on any install.
# See docs/feature-specs/04-views-filters.md ("Jeu complet d'operateurs de
# filtre") in plane-selfhost. migrate_single_model_filters only touches rows
# where rich_filters={} and filters is non-empty, so this is safe to run
# alongside 0107 regardless of whether that migration already ran.
MODEL_NAMES = ["ProjectUserProperty"]


def migrate_filters_to_rich_filters(apps, schema_editor):
    models_to_migrate = {}
    for model_name in MODEL_NAMES:
        models_to_migrate[model_name] = apps.get_model("db", model_name)

    converter = LegacyToRichFiltersConverter()
    migrate_models_filters_to_rich_filters(models_to_migrate, converter)


def reverse_migrate_rich_filters_to_filters(apps, schema_editor):
    models_to_clear = {}
    for model_name in MODEL_NAMES:
        models_to_clear[model_name] = apps.get_model("db", model_name)

    clear_models_rich_filters(models_to_clear)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0136_issue_relation_gantt_dependency_indexes"),
    ]

    operations = [
        migrations.RunPython(
            migrate_filters_to_rich_filters,
            reverse_code=reverse_migrate_rich_filters_to_filters,
        ),
    ]
