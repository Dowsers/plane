# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Backfill management command for the shared embedding pipeline - a
category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost) INFRASTRUCTURE PREREQUISITE, required later by feature 2's
own spec (duplicate/similarity detection, exigence 11) but lives here since
it's pipeline-level, not feature-specific.

Unlike `sync_issue_version`/`sync_issue_description_version`'s interactive
`input()` prompts, this command takes real argparse flags: a backfill that
calls out to an external embedding-provider API benefits from being
scriptable/cron-able without a TTY, and needs a `--countdown` throttle
knob so it doesn't hammer that provider's rate limits.

Thin by design - delegates all batching/throttling/staleness logic to
`plane.bgtasks.issue_embedding_task.backfill_issue_embeddings_batch`.
"""

from django.core.management.base import BaseCommand

from plane.bgtasks.issue_embedding_task import backfill_issue_embeddings_batch


class Command(BaseCommand):
    help = (
        "Enqueues embedding computation (via compute_issue_embedding_task) for existing, "
        "non-draft Issues missing an IssueEmbedding or whose stored embedding is stale, in "
        "throttled batches."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="Number of issues to consider per batch (default: 200).",
        )
        parser.add_argument(
            "--countdown",
            type=int,
            default=60,
            help="Seconds to wait between batches, to throttle load on the embedding provider (default: 60).",
        )
        parser.add_argument(
            "--workspace-slug",
            type=str,
            default=None,
            help="Only backfill issues belonging to this workspace slug.",
        )
        parser.add_argument(
            "--project-id",
            type=str,
            default=None,
            help="Only backfill issues belonging to this project id.",
        )

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        countdown = options["countdown"]
        workspace_slug = options["workspace_slug"]
        project_id = options["project_id"]

        backfill_issue_embeddings_batch.delay(
            batch_size=batch_size,
            offset=0,
            countdown=countdown,
            workspace_slug=workspace_slug,
            project_id=project_id,
        )

        scope_bits = []
        if workspace_slug:
            scope_bits.append(f"workspace_slug={workspace_slug}")
        if project_id:
            scope_bits.append(f"project_id={project_id}")
        scope_desc = f" ({', '.join(scope_bits)})" if scope_bits else ""

        self.stdout.write(
            self.style.SUCCESS(
                f"Scheduled issue embedding backfill: batch_size={batch_size}, "
                f"countdown={countdown}s{scope_desc}."
            )
        )
