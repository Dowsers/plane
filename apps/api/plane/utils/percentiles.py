# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Postgres `PERCENTILE_CONT` ordered-set aggregate for the cross-workspace
duration-percentiles analytics endpoint - see
docs/feature-specs/05-insights-analytics.md, section 2.

`django.contrib.postgres.aggregates.PercentileCont`/`PercentileDisc` were
only added in Django 5.0 - this project is pinned to Django 4.2 (verified:
`django.contrib.postgres.aggregates` on this install exposes `ArrayAgg`,
`StringAgg`, `BoolAnd`/`BoolOr`, the `Regr*`/`Corr`/`CovarPop` statistics
aggregates, etc., but no `PercentileCont`). Rather than pull in numpy/scipy
(explicitly out of scope) or backport the whole `django.contrib.postgres`
module, this is a minimal, same-shaped `Aggregate` subclass that emits
Postgres' native ordered-set aggregate syntax directly:

    PERCENTILE_CONT(<percentile>) WITHIN GROUP (ORDER BY <expression>)

The percentile computation itself is done entirely by Postgres - no Python
math involved, matching the spirit of the built-in Django 5.0 class this
stands in for.
"""

from django.db.models import Aggregate, FloatField


class PercentileCont(Aggregate):
    function = "PERCENTILE_CONT"
    name = "PercentileCont"
    output_field = FloatField()
    template = "%(function)s(%(percentile)s) WITHIN GROUP (ORDER BY %(expressions)s)"

    def __init__(self, expression, percentile, **extra):
        if not 0 <= percentile <= 1:
            raise ValueError("percentile must be between 0 and 1")
        super().__init__(expression, percentile=percentile, **extra)
