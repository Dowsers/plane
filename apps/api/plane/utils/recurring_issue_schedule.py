# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pure recurrence-math helpers for recurring issue templates - see
docs/feature-specs/06-automation-workflow-sla.md ("Work items récurrents",
section 3) in plane-selfhost.

Deliberately free of any Django/DB imports so this module can be exercised
directly with `python3` against a plain duck-typed object exposing the
attributes below - no Django settings, no database. This keeps the
recurrence rules easy to unit-test in isolation from everything else this
feature touches (models, Celery task, views).

`compute_next_run_at` expects a `template`-shaped object with the following
attributes (mirroring `RecurringIssueTemplate`'s own fields):
    - frequency: one of "DAILY", "WEEKLY", "MONTHLY", "YEARLY"
    - interval: positive int, "every N <frequency units>"
    - weekdays: list[int], Python `date.weekday()` convention (0=Monday,
      6=Sunday) - only consulted for WEEKLY
    - day_of_month: int|None, 1-31 - only consulted for MONTHLY/YEARLY
    - month_of_year: int|None, 1-12 - only consulted for YEARLY
    - timezone: IANA tz name string (e.g. "Europe/Paris")
    - start_date: datetime.date - the recurrence's phase anchor

Semantics notes (the spec's own text is loose on a couple of these -
picking one clear, documented interpretation for each):

- WEEKLY + interval: weeks are numbered from the Monday of `start_date`'s
  own week (week 0). A week is "active" when `week_index % interval == 0`.
  Within an active week, one occurrence is generated per weekday listed in
  `weekdays` (or, if `weekdays` is empty, a single occurrence on
  `start_date`'s own weekday). This keeps the schedule phase-locked to
  `start_date` - e.g. interval=2, weekdays=[0, 2] (Mon/Wed), starting on a
  week-0 Monday: occurrences land Mon+Wed of week 0, then Mon+Wed of week
  2, week 4, etc. - week 1, 3, 5... are skipped entirely. This is distinct
  from (and more useful than) "every matching weekday, with `interval`
  merely multiplying total cycle length" - it gives interval a stable,
  predictable meaning independent of which day within the active week
  `after` happens to fall on.

- MONTHLY/YEARLY + interval: same phase-locked-to-`start_date` idea, but
  counting months (resp. years) since `start_date`'s month (resp. year)
  instead of weeks.

- day_of_month clamping: `day_of_month` values of 29/30/31 clamp to the
  actual last day of a shorter target month (e.g. 31 -> 30 in April, -> 28
  or 29 in February) via `calendar.monthrange`, rather than rolling over
  into the next month. This is implemented directly with
  `calendar.monthrange` + `datetime.date(...)` rather than
  `dateutil.relativedelta(day=31)` - both clamp (verified empirically, see
  the docstring of `_clamp_day_of_month` and this feature's manual
  verification notes), but `calendar.monthrange` is unambiguous by
  construction and doesn't depend on relativedelta's less-obvious
  `day=` vs `days=` distinction, so it's used for all month/year-length
  clamping in this module. `relativedelta` is still used for the (much
  simpler) DAILY case, per this feature's own brief.

- DST safety: every candidate date is converted to a timezone-aware
  datetime by combining it with midnight and running it through
  `pytz.timezone(...).localize(...)` followed by `pytz.normalize(...)`,
  mirroring the existing style in `plane/utils/timezone_converter.py`.
  This guarantees a recurrence crossing a DST boundary still lands on the
  intended local calendar date at local midnight, with the correct UTC
  offset, instead of silently drifting by an hour.

Every function here is dependency-injected on `after`/`now` - nothing in
this module ever calls `django.utils.timezone.now()` or touches the
database, so it is fully testable in isolation.
"""

import calendar
from datetime import date, datetime, time, timedelta

import pytz
from dateutil.relativedelta import relativedelta

FREQUENCY_DAILY = "DAILY"
FREQUENCY_WEEKLY = "WEEKLY"
FREQUENCY_MONTHLY = "MONTHLY"
FREQUENCY_YEARLY = "YEARLY"


def _clamp_day_of_month(year, month, day):
    """Clamp `day` to the last valid day of `(year, month)`. E.g.
    `_clamp_day_of_month(2026, 4, 31) == 30` (April has 30 days),
    `_clamp_day_of_month(2026, 2, 31) == 28` (2026 is not a leap year),
    `_clamp_day_of_month(2028, 2, 29) == 29` (2028 is a leap year)."""
    last_day = calendar.monthrange(year, month)[1]
    return min(day, last_day)


def _local_midnight(tz, d):
    """Timezone-aware local midnight for calendar date `d`, DST-normalized.

    Note: pytz's normalization API is a method on the tz object itself
    (`tz.normalize(dt)`), not a top-level `pytz.normalize` function -
    verified directly against the installed pytz version while writing
    this module."""
    naive = datetime.combine(d, time.min)
    localized = tz.localize(naive)
    return tz.normalize(localized)


def _next_daily_date(interval, after_date):
    return after_date + relativedelta(days=interval)


def _next_weekly_date(start_date, weekdays, interval, after_date):
    weekdays = sorted(set(weekdays)) if weekdays else [start_date.weekday()]
    start_monday = start_date - timedelta(days=start_date.weekday())
    after_monday = after_date - timedelta(days=after_date.weekday())

    # Within any `interval` consecutive weeks there is exactly one active
    # week; if none of its weekdays qualify (all already <= after_date) the
    # next candidate is exactly one more active cycle (`interval` weeks)
    # away. Two full cycles is always enough to find a hit.
    max_weeks_to_scan = interval * 2 + 8
    monday = after_monday
    for _ in range(max_weeks_to_scan):
        week_index = (monday - start_monday).days // 7
        if week_index >= 0 and week_index % interval == 0:
            for weekday in weekdays:
                candidate = monday + timedelta(days=weekday)
                if candidate > after_date:
                    return candidate
        monday += timedelta(days=7)
    raise ValueError("Unable to compute next WEEKLY occurrence within bounded scan")


def _next_monthly_date(start_date, day_of_month, interval, after_date):
    day_of_month = day_of_month or start_date.day
    year, month = after_date.year, after_date.month

    max_months_to_scan = interval * 2 + 6
    for _ in range(max_months_to_scan):
        month_index = (year - start_date.year) * 12 + (month - start_date.month)
        if month_index >= 0 and month_index % interval == 0:
            day = _clamp_day_of_month(year, month, day_of_month)
            candidate = date(year, month, day)
            if candidate > after_date:
                return candidate
        month += 1
        if month == 13:
            month = 1
            year += 1
    raise ValueError("Unable to compute next MONTHLY occurrence within bounded scan")


def _next_yearly_date(start_date, month_of_year, day_of_month, interval, after_date):
    month_of_year = month_of_year or start_date.month
    day_of_month = day_of_month or start_date.day
    year = after_date.year

    max_years_to_scan = interval * 2 + 6
    for _ in range(max_years_to_scan):
        year_index = year - start_date.year
        if year_index >= 0 and year_index % interval == 0:
            day = _clamp_day_of_month(year, month_of_year, day_of_month)
            candidate = date(year, month_of_year, day)
            if candidate > after_date:
                return candidate
        year += 1
    raise ValueError("Unable to compute next YEARLY occurrence within bounded scan")


def compute_next_run_at(template, after):
    """Returns the next tz-aware local-midnight datetime, strictly after
    `after`, matching `template`'s recurrence rule.

    `after` may be aware in any timezone (in particular, UTC - which is
    what Django hands back for a DateTimeField read from the DB); it is
    defensively re-localized into `template.timezone` before any date
    arithmetic, so callers never need to convert it themselves.
    """
    tz = pytz.timezone(template.timezone)
    interval = template.interval or 1
    after_date = after.astimezone(tz).date()

    if template.frequency == FREQUENCY_DAILY:
        candidate = _next_daily_date(interval, after_date)
    elif template.frequency == FREQUENCY_WEEKLY:
        candidate = _next_weekly_date(template.start_date, template.weekdays, interval, after_date)
    elif template.frequency == FREQUENCY_MONTHLY:
        candidate = _next_monthly_date(template.start_date, template.day_of_month, interval, after_date)
    elif template.frequency == FREQUENCY_YEARLY:
        candidate = _next_yearly_date(
            template.start_date, template.month_of_year, template.day_of_month, interval, after_date
        )
    else:
        raise ValueError(f"Unknown recurrence frequency: {template.frequency!r}")

    return _local_midnight(tz, candidate)


def compute_first_run_at(template):
    """The first occurrence at/after `template.start_date` matching the
    recurrence rule - reuses `compute_next_run_at`'s "strictly after"
    search by seeding it with local midnight of the day *before*
    `start_date`, so `start_date` itself is a valid first hit."""
    tz = pytz.timezone(template.timezone)
    day_before_start = template.start_date - timedelta(days=1)
    seed = _local_midnight(tz, day_before_start)
    return compute_next_run_at(template, seed)


def resolve_template_name(name, occurrence_date):
    """Resolves the `{{date}}` token in a template's `name` to
    `occurrence_date` formatted as an unambiguous ISO-8601 date
    (`YYYY-MM-DD`) - e.g. "Weekly standup — {{date}}" ->
    "Weekly standup — 2026-08-04"."""
    return name.replace("{{date}}", occurrence_date.strftime("%Y-%m-%d"))
