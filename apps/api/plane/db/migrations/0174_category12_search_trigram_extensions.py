# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written migration (per this initiative's convention - migrations
are otherwise always auto-generated via `makemigrations`) - category 12
(docs/feature-specs/12-keyboard-mobile-desktop.md in plane-selfhost),
feature 6 ("Recherche approfondie dans la Command Palette").

Enabling a Postgres extension has no Django model-state representation for
`makemigrations` to autodetect a diff against, so - like
`TrigramExtension`/`UnaccentExtension` themselves are always manually
added to a migration's `operations` list per Django's own documentation -
this migration has to be hand-written. It must run BEFORE the
auto-generated index migration that follows it
(`0175_issue_issue_name_trgm_gin_idx_and_more`), since a `GinIndex` using
the `gin_trgm_ops` operator class requires `pg_trgm` to already be
installed, and this migration's `immutable_unaccent` wrapper function must
already exist before that migration's functional indexes can be created
on top of it.

Both `pg_trgm` and `unaccent` were empirically confirmed available and
installable (`CREATE EXTENSION IF NOT EXISTS pg_trgm/unaccent;` both
succeed) against the real Postgres 15.7-alpine instance this fork's
dev/test workflow runs against - unlike category 9's `pgvector`, which
turned out to be genuinely unavailable on the same image. No fallback
needed here.

`immutable_unaccent`: Postgres's built-in `unaccent()` is declared STABLE
(not IMMUTABLE), so it cannot be referenced directly inside a functional
index expression - `CREATE INDEX ... USING gin (unaccent(lower(x))
gin_trgm_ops)` fails with `functions in index expression must be marked
IMMUTABLE` (empirically confirmed against the same instance). This
one-line SQL wrapper, explicitly (if technically over-optimistically)
declared IMMUTABLE, is the standard documented workaround (Postgres wiki /
pg_trgm docs) - safe in practice since the `unaccent` dictionary is not
mutated at runtime for a given deployment. See
`plane.db.models.functions.ImmutableUnaccent` (the Django `Func` wrapper
around this SQL function) for the ORM-level half of this, used both by
the indexes in the next migration and by the runtime queries in
`plane.app.views.search.base.GlobalSearchEndpoint` that need to hit them.
"""

from django.contrib.postgres.operations import TrigramExtension, UnaccentExtension
from django.db import migrations

CREATE_IMMUTABLE_UNACCENT = """
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS
$$
SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
"""

DROP_IMMUTABLE_UNACCENT = "DROP FUNCTION IF EXISTS immutable_unaccent(text);"


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0173_category11_rbac_seed"),
    ]

    operations = [
        TrigramExtension(),
        UnaccentExtension(),
        migrations.RunSQL(
            sql=CREATE_IMMUTABLE_UNACCENT,
            reverse_sql=DROP_IMMUTABLE_UNACCENT,
        ),
    ]
