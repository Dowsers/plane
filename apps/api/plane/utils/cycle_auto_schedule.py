# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta

import pytz

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import Cycle
from plane.utils.timezone_converter import convert_to_utc


def _next_occurrence_of_weekday(local_date, start_day_of_week):
    """Next date on/after local_date whose weekday() == start_day_of_week."""
    days_ahead = (start_day_of_week - local_date.weekday()) % 7
    return local_date + timedelta(days=days_ahead)


def get_last_cycle_end_date(project_id):
    last_cycle = (
        Cycle.objects.filter(project_id=project_id).exclude(end_date__isnull=True).order_by("-end_date").first()
    )
    return last_cycle.end_date if last_cycle else None


def _compute_window_from_baseline(config, project, baseline_end_date_utc):
    """
    baseline_end_date_utc: end_date (UTC datetime) of the cycle immediately
    preceding this window, or None if the project has no cycle yet. The
    window always starts strictly after this baseline + cooldown, snapped
    forward to the configured day of week - see
    docs/feature-specs/02-cycles-intake.md ("Moteur de auto-scheduling de
    cycles récurrents", exigence 5) in plane-selfhost.
    """
    local_tz = pytz.timezone(project.timezone or "UTC")

    if baseline_end_date_utc is None:
        earliest_local_date = timezone.now().astimezone(local_tz).date()
    else:
        earliest_local_date = baseline_end_date_utc.astimezone(local_tz).date() + timedelta(
            days=1 + config.cooldown_days
        )

    start_local_date = _next_occurrence_of_weekday(earliest_local_date, config.start_day_of_week)
    end_local_date = start_local_date + timedelta(weeks=config.cadence_weeks) - timedelta(days=1)

    start_date = convert_to_utc(date=str(start_local_date), project_id=project.id, is_start_date=True)
    end_date = convert_to_utc(date=str(end_local_date), project_id=project.id)
    return start_date, end_date


def compute_next_cycle_window(config, project):
    baseline = get_last_cycle_end_date(project.id)
    return _compute_window_from_baseline(config, project, baseline)


def build_cycle_name(config, offset=0):
    return config.naming_template.replace("{number}", str(config.next_auto_number + offset))


def preview_next_windows(config, project, count):
    """
    Read-only preview of the next `count` auto-scheduled windows. Never
    touches the database or mutates `config` - chains simulated windows off
    each other's computed end_date instead of re-querying Cycle.
    """
    windows = []
    baseline = get_last_cycle_end_date(project.id)
    for i in range(count):
        start_date, end_date = _compute_window_from_baseline(config, project, baseline)
        windows.append({"name": build_cycle_name(config, i), "start_date": start_date, "end_date": end_date})
        baseline = end_date
    return windows
