# Fixes issue/draft-issue/page creation returning a generic 400 ("The
# payload is not valid") on every insert. The `issues`, `draft_issues`, and
# `pages` tables each carry a stray `description jsonb NOT NULL` column with
# no default and no corresponding field on the current model (superseded by
# `description_json` in migration 0117) - Postgres rejects every INSERT
# since Django never populates a column it doesn't know exists. Verified no
# constraints, indexes, or other columns depend on it.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0179_add_team_member_and_team_project'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                'ALTER TABLE issues DROP COLUMN IF EXISTS description;',
                'ALTER TABLE draft_issues DROP COLUMN IF EXISTS description;',
                'ALTER TABLE pages DROP COLUMN IF EXISTS description;',
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
