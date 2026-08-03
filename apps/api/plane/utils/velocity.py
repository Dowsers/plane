# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pure-python projected-completion-date math for the project-level "Scope &
velocity" chart - see docs/feature-specs/05-insights-analytics.md, section
"1. Graphiques de progression cycle/projet", exigence 8:

    date_projetee = aujourd'hui + (issues_restantes / velocite_moyenne) *
    duree_moyenne_cycle

with an optimistic estimate (velocity = max of the last N closed cycles) and
a pessimistic one (velocity = min of the last N closed cycles).

Kept dependency-free (no Django ORM imports) on purpose so it can be
sanity-checked directly with plain Python data structures - see the
verification steps in the 05-insights-analytics patch notes - without
needing a live database.
"""

# Python imports
from datetime import date, timedelta


def compute_velocity_projection(
    remaining_work: float,
    velocities: list[float],
    avg_cycle_duration_days: float | None,
    today: date | None = None,
) -> dict:
    """
    Args:
        remaining_work: count of issues (or sum of estimate points,
            depending on the project's estimation mode) still open
            (state.group not in {completed, cancelled}) across the project.
        velocities: completed work (issues or points, same unit as
            remaining_work) for each of the last N *closed* cycles
            (end_date < now), most-recent-first or in any order - only the
            aggregate min/max/average are used.
        avg_cycle_duration_days: average length in days of the cycles the
            velocities were computed over. None/0 makes an ETA
            un-computable even if velocities are present (e.g. cycles with
            same start/end date).
        today: injectable for deterministic testing; defaults to
            ``timezone.now().date()``.

    Returns:
        A dict always containing ``has_enough_data``. When there are zero
        closed cycles to derive a velocity from, every numeric field is
        ``None`` and ``has_enough_data`` is ``False`` - callers must render
        an explicit "not enough data" state (exigence 7) instead of
        dividing by zero or fabricating a number.
    """
    if today is None:
        # Imported lazily so this module has zero required Django imports
        # for the "pure python" verification path described above.
        from django.utils import timezone

        today = timezone.now().date()

    if not velocities:
        return {
            "has_enough_data": False,
            "average_velocity": None,
            "optimistic_velocity": None,
            "pessimistic_velocity": None,
            "window_size": 0,
            "remaining_work": remaining_work,
            "projected_completion_date": None,
            "optimistic_completion_date": None,
            "pessimistic_completion_date": None,
        }

    average_velocity = sum(velocities) / len(velocities)
    optimistic_velocity = max(velocities)
    pessimistic_velocity = min(velocities)

    def _eta(velocity: float) -> date | None:
        # A velocity of 0 (or a degenerate 0-day average cycle duration)
        # would make the ETA infinite - surface that as "cannot project"
        # (None) rather than raising or returning `today`.
        if not velocity or velocity <= 0 or not avg_cycle_duration_days:
            return None
        days_needed = (remaining_work / velocity) * avg_cycle_duration_days
        return today + timedelta(days=days_needed)

    return {
        "has_enough_data": True,
        "average_velocity": average_velocity,
        "optimistic_velocity": optimistic_velocity,
        "pessimistic_velocity": pessimistic_velocity,
        "window_size": len(velocities),
        "remaining_work": remaining_work,
        "projected_completion_date": _eta(average_velocity),
        "optimistic_completion_date": _eta(optimistic_velocity),
        "pessimistic_completion_date": _eta(pessimistic_velocity),
    }
