# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Small custom ORM `Func` expressions shared between model-level index
definitions and the runtime queries that need to hit those same indexes -
category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 6 ("Recherche approfondie dans la Command
Palette").

`ImmutableUnaccent` wraps a thin SQL wrapper function (`immutable_unaccent`,
created in migration `0174_category12_search_trigram_extensions`) around
Postgres's built-in `unaccent()`. This indirection exists for one reason:
`unaccent()` itself is declared STABLE (its behaviour can depend on
`search_path`/the active text search dictionary), and Postgres refuses to
build a functional index ("GinIndex(OpClass(...))" below) on any expression
that isn't provably IMMUTABLE - empirically confirmed against the real
Postgres 15.7 instance this fork's dev/test workflow runs against:
`CREATE INDEX ... USING gin (unaccent(lower(name)) gin_trgm_ops)` fails
outright with `functions in index expression must be marked IMMUTABLE`.
The universally-documented workaround (Postgres wiki, pg_trgm docs) is a
one-line SQL wrapper function explicitly marked IMMUTABLE - safe in
practice because the `unaccent` dictionary is not actually mutated at
runtime for a given deployment.

Both `Issue`/`IssueComment`/`User`'s `Meta.indexes` (this module) AND the
runtime queries in `plane.app.views.search.base` MUST build this exact
expression via `ImmutableUnaccent(Lower(...))` - Postgres only uses a
functional GIN index when the query's own expression is structurally
identical to the indexed one. Never call the bare `unaccent()` SQL
function directly from a queryset destined to hit one of these indexes.
"""

from django.db.models import Func


class ImmutableUnaccent(Func):
    function = "immutable_unaccent"
    arity = 1


class ImmutableConcat(Func):
    """Text concatenation via the `||` operator instead of
    `django.db.models.functions.Concat` (which compiles to Postgres's
    built-in, variadic `concat()` function on this backend). Needed for
    the same reason as `ImmutableUnaccent`: empirically confirmed against
    the real Postgres 15.7 instance this fork's dev/test workflow runs
    against, `concat()` is declared STABLE, not IMMUTABLE
    (`pg_proc.provolatile = 's'`) - so `User.Meta.indexes`'s combined
    name/email GIN trigram index (which needs to join several columns
    into one expression before lowercasing/unaccenting it) cannot use
    `Concat(...)` inside it. The `||` text concatenation operator, by
    contrast, is backed by `textcat()`, which Postgres marks IMMUTABLE.
    Used identically here and in the matching runtime query
    (`plane.app.views.search.base.GlobalSearchEndpoint.filter_members`) -
    same structural-match requirement as `ImmutableUnaccent`.
    """

    function = ""
    template = "%(expressions)s"
    arg_joiner = " || "
