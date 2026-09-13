# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Max
from django.db import connection, transaction

# Module imports
from plane.db.models import Teamspace, Workspace, Issue, IssueSequence
from plane.utils.uuid import convert_uuid_to_integer


class Command(BaseCommand):
    help = "Fix duplicate sequences"

    def add_arguments(self, parser):
        # Positional argument
        parser.add_argument("issue_identifier", type=str, help="Issue Identifier")

    def strict_str_to_int(self, s):
        if not s.isdigit() and not (s.startswith("-") and s[1:].isdigit()):
            raise ValueError("Invalid integer string")
        return int(s)

    def handle(self, *args, **options):
        workspace_slug = input("Workspace slug: ")

        if not workspace_slug:
            raise CommandError("Workspace slug is required")

        issue_identifier = options.get("issue_identifier", False)

        # Validate issue_identifier
        if not issue_identifier:
            raise CommandError("Issue identifier is required")

        # Validate issue identifier
        try:
            identifier = issue_identifier.split("-")

            if len(identifier) != 2:
                raise ValueError("Invalid issue identifier format")

            code = identifier[0]
            issue_sequence = self.strict_str_to_int(identifier[1])

            # Resolve `code` to a pool: a Teamspace's shared series first,
            # then this workspace's own shared default series - a
            # project's own `identifier` is never used for this anymore.
            teamspace = Teamspace.objects.filter(
                default_project_identifier__iexact=code, workspace__slug=workspace_slug
            ).first()
            if teamspace is not None:
                issues = Issue.objects.filter(sequence_teamspace=teamspace, sequence_id=issue_sequence)
                lock_key = convert_uuid_to_integer(teamspace.id)
                sequence_filter = {"teamspace": teamspace}
            else:
                workspace = Workspace.objects.filter(
                    slug=workspace_slug, default_project_identifier__iexact=code
                ).first()
                if workspace is None:
                    raise CommandError(f"No team or workspace found with identifier prefix '{code}'")
                issues = Issue.objects.filter(
                    sequence_teamspace__isnull=True, workspace=workspace, sequence_id=issue_sequence
                )
                lock_key = convert_uuid_to_integer(workspace.id)
                sequence_filter = {"teamspace__isnull": True, "workspace": workspace}

            # Check if there are duplicate issues
            if not issues.count() > 1:
                raise CommandError("No duplicate issues found with the given identifier")

            self.stdout.write(self.style.SUCCESS(f"{issues.count()} issues found with identifier {issue_identifier}"))
            with transaction.atomic():
                # This ensures only one transaction per pool can execute this code at a time
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])

                # Get the maximum sequence ID for the pool
                last_sequence = IssueSequence.objects.filter(**sequence_filter).aggregate(largest=Max("sequence"))[
                    "largest"
                ]

                bulk_issues = []
                bulk_issue_sequences = []

                issue_sequence_map = {isq.issue_id: isq for isq in IssueSequence.objects.filter(**sequence_filter)}

                # change the ids of duplicate issues
                for index, issue in enumerate(issues[1:]):
                    updated_sequence_id = last_sequence + index + 1
                    issue.sequence_id = updated_sequence_id
                    bulk_issues.append(issue)

                    # Find the same issue sequence instance from the above queryset
                    sequence_identifier = issue_sequence_map.get(issue.id)
                    if sequence_identifier:
                        sequence_identifier.sequence = updated_sequence_id
                        bulk_issue_sequences.append(sequence_identifier)

                Issue.objects.bulk_update(bulk_issues, ["sequence_id"])
                IssueSequence.objects.bulk_update(bulk_issue_sequences, ["sequence"])

            self.stdout.write(self.style.SUCCESS("Sequence IDs updated successfully"))
        except Exception as e:
            raise CommandError(str(e))
