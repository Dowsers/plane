# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.db.models import Cycle
from plane.utils.cycle_transfer_issues import transfer_cycle_issues
from plane.utils.exception_logger import log_exception


@shared_task
def cycle_auto_rollover_task():
    """
    Runs hourly - once an auto-scheduled cycle's end_date has passed, moves
    its incomplete issues to its successor cycle if rollover_enabled is set
    on its auto-schedule config. See docs/feature-specs/02-cycles-intake.md
    ("Moteur de auto-scheduling de cycles récurrents", exigences 9-11) in
    plane-selfhost.
    """
    cycle_ids = list(
        Cycle.objects.filter(
            is_auto_scheduled=True,
            generated_by_schedule__rollover_enabled=True,
            end_date__lt=timezone.now(),
            auto_rollover_completed_at__isnull=True,
            archived_at__isnull=True,
        ).values_list("id", flat=True)
    )
    for cycle_id in cycle_ids:
        _rollover_cycle(cycle_id)


def _rollover_cycle(cycle_id):
    try:
        with transaction.atomic():
            # select_for_update makes a delayed/retried run for the same
            # cycle a no-op once auto_rollover_completed_at is set -
            # exigence 7 de la spec (idempotence), appliquée ici aussi.
            cycle = (
                Cycle.objects.select_for_update()
                .select_related("workspace")
                .filter(id=cycle_id, is_auto_scheduled=True, auto_rollover_completed_at__isnull=True)
                .first()
            )
            if cycle is None:
                return

            next_cycle = (
                Cycle.objects.filter(project_id=cycle.project_id, start_date__gt=cycle.end_date)
                .order_by("start_date")
                .first()
            )

            if next_cycle is None:
                # Exigence 11 : pas de transfert, log d'erreur, pas de
                # marquage "done" pour permettre une reprise si un
                # successeur apparaît sur une exécution ultérieure.
                log_exception(
                    Exception(
                        f"cycle_auto_rollover_task: no successor cycle found for auto-scheduled "
                        f"cycle {cycle.id} (project {cycle.project_id}), skipping rollover for now"
                    )
                )
                return

            result = transfer_cycle_issues(
                slug=cycle.workspace.slug,
                project_id=cycle.project_id,
                cycle_id=cycle.id,
                new_cycle_id=next_cycle.id,
                # No HTTP request in a periodic task context; base_host()'s
                # request param is unused in its body regardless of the
                # value passed, so None is safe here.
                request=None,
                user_id=cycle.owned_by_id,
            )
            if not result.get("success"):
                log_exception(
                    Exception(
                        f"cycle_auto_rollover_task: transfer failed for cycle {cycle.id}: {result.get('error')}"
                    )
                )
                return

            cycle.auto_rollover_completed_at = timezone.now()
            cycle.save(update_fields=["auto_rollover_completed_at"])
    except Exception as e:
        log_exception(e)
