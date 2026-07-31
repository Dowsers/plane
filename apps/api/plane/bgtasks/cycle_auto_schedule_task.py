# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Django imports
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

# Module imports
from plane.db.models import Cycle, CycleAutoScheduleConfig
from plane.utils.cycle_auto_schedule import build_cycle_name, compute_next_cycle_window
from plane.utils.exception_logger import log_exception


@shared_task
def cycle_auto_schedule_task():
    """
    Runs hourly - creates the next auto-scheduled cycle(s) for every project
    whose lookahead isn't already satisfied. See
    docs/feature-specs/02-cycles-intake.md ("Moteur de auto-scheduling de
    cycles récurrents") in plane-selfhost.
    """
    config_ids = list(
        CycleAutoScheduleConfig.objects.filter(is_enabled=True, project__archived_at__isnull=True).values_list(
            "id", flat=True
        )
    )
    for config_id in config_ids:
        _schedule_next_cycles_for_config(config_id)


def _schedule_next_cycles_for_config(config_id):
    try:
        with transaction.atomic():
            # select_for_update serializes concurrent/delayed runs of this
            # task for the same project, which is what makes it idempotent -
            # exigence 7 de la spec.
            config = (
                CycleAutoScheduleConfig.objects.select_for_update()
                .select_related("project")
                .filter(id=config_id, is_enabled=True, project__archived_at__isnull=True)
                .first()
            )
            if config is None:
                return

            project = config.project
            owner_id = config.created_by_id or project.created_by_id
            if owner_id is None:
                log_exception(
                    Exception(
                        f"cycle_auto_schedule_task: no owner available for config {config.id} "
                        f"(project {project.id}), skipping"
                    )
                )
                return

            future_cycles_count = Cycle.objects.filter(project_id=project.id, start_date__gt=timezone.now()).count()

            created_any = False
            # Bounded by lookahead_count (max 3) - never an unbounded loop.
            while future_cycles_count < config.lookahead_count:
                start_date, end_date = compute_next_cycle_window(config, project)

                overlapping = Cycle.objects.filter(project_id=project.id).filter(
                    Q(start_date__lt=end_date) & Q(end_date__gt=start_date)
                )
                if overlapping.exists():
                    log_exception(
                        Exception(
                            f"cycle_auto_schedule_task: computed window {start_date}..{end_date} for "
                            f"project {project.id} overlaps an existing cycle, stopping for this run"
                        )
                    )
                    break

                cycle = Cycle(
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    name=build_cycle_name(config),
                    start_date=start_date,
                    end_date=end_date,
                    owned_by_id=owner_id,
                    created_by_id=owner_id,
                    generated_by_schedule_id=config.id,
                    is_auto_scheduled=True,
                )
                cycle.save(created_by_id=owner_id, disable_auto_set_user=True)

                config.next_auto_number += 1
                future_cycles_count += 1
                created_any = True

            config.last_run_at = timezone.now()
            update_fields = ["last_run_at"]
            if created_any:
                update_fields.append("next_auto_number")
            config.save(update_fields=update_fields)
    except Exception as e:
        log_exception(e)
