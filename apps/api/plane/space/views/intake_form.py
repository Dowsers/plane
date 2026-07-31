# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hashlib
import json
from datetime import timedelta

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from django.utils.dateparse import parse_datetime

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

# Module imports
from .base import BaseAPIView
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.triage_rule_task import run_triage_rules_for_intake_issue
from plane.db.models import Intake, IntakeForm, IntakeIssue, Issue, Label, State, StateGroup
from plane.db.models.intake import SourceType
from plane.utils.intake_responsibility import assign_intake_responsibility

# A submission is considered spam if it arrives faster than a human could
# plausibly fill the form - exigence 10 de
# docs/feature-specs/02-cycles-intake.md ("Formulaire web public d'intake")
# in plane-selfhost.
MIN_SUBMISSION_SECONDS = 3


class IntakeFormSubmitThrottle(SimpleRateThrottle):
    """
    Rate limited per (form token, IP) pair, at the form's own configured
    rate rather than a single instance-wide setting - exigence 9 de la
    spec. Throttles every attempt (not just ones that pass the anti-spam
    check below), which is a stricter, intentional deviation from the
    literal spec wording - see docker/api/public-intake-form/README.md.
    """

    scope = "intake_form_submit"

    def get_cache_key(self, request, view):
        token = view.kwargs.get("token")
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": f"{token}:{ident}"}

    def allow_request(self, request, view):
        token = view.kwargs.get("token")
        configured_rate = (
            IntakeForm.objects.filter(token=token).values_list("rate_limit_per_ip_per_hour", flat=True).first()
        )
        self.num_requests, self.duration = self.parse_rate(f"{configured_rate or 10}/hour")
        return super().allow_request(request, view)


def _hash_ip(ip):
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()


class IntakeFormPublicEndpoint(BaseAPIView):
    """
    Sanitized public read of an intake form's rendering configuration -
    never exposes members, other issues, states, or workspace metadata
    beyond what's needed to render the form (exigence 11).
    """

    permission_classes = [AllowAny]

    def get(self, request, token):
        form = IntakeForm.objects.filter(token=token, is_enabled=True).first()
        # Same generic response for "token doesn't exist" and "form
        # disabled" - no information leak on which one it is (exigence 4).
        if form is None:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "name": form.name,
                "description_html": form.description_html,
                "show_priority_field": form.show_priority_field,
                "show_labels_field": form.show_labels_field,
                # File uploads are out of scope for this iteration even
                # though allow_attachments exists on the model - see README.
                "allow_attachments": False,
                "require_submitter_name": form.require_submitter_name,
                "require_submitter_email": form.require_submitter_email,
                "priorities": [choice[0] for choice in Issue.PRIORITY_CHOICES] if form.show_priority_field else [],
                "labels": (
                    list(Label.objects.filter(project_id=form.project_id).values("id", "name", "color"))
                    if form.show_labels_field
                    else []
                ),
            },
            status=status.HTTP_200_OK,
        )


class IntakeFormSubmitEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [IntakeFormSubmitThrottle]

    def post(self, request, token):
        form = IntakeForm.objects.filter(token=token, is_enabled=True).first()
        if form is None:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)

        success_response = {"success_message": form.success_message, "redirect_url": form.redirect_url}

        # Honeypot + minimum time-to-submit anti-spam - exigence 10. A
        # detected spam submission gets an apparent success response, never
        # an error, so an attacker can't use the response to fingerprint
        # the check.
        if request.data.get("honeypot"):
            return Response(success_response, status=status.HTTP_201_CREATED)

        rendered_at = parse_datetime(str(request.data.get("form_rendered_at", "")))
        if rendered_at is None or (timezone.now() - rendered_at) < timedelta(seconds=MIN_SUBMISSION_SECONDS):
            return Response(success_response, status=status.HTTP_201_CREATED)

        title = str(request.data.get("title", "")).strip()
        if not title or len(title) > 255:
            return Response(
                {"error": "A title of at most 255 characters is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        submitter_name = str(request.data.get("submitter_name", "")).strip() or None
        submitter_email = str(request.data.get("submitter_email", "")).strip() or None
        if form.require_submitter_name and not submitter_name:
            return Response({"error": "submitter_name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if form.require_submitter_email and not submitter_email:
            return Response({"error": "submitter_email is required"}, status=status.HTTP_400_BAD_REQUEST)

        priority = "none"
        if form.show_priority_field:
            submitted_priority = request.data.get("priority")
            if submitted_priority in dict(Issue.PRIORITY_CHOICES):
                priority = submitted_priority
        if form.default_priority:
            priority = form.default_priority

        # Double-click/network-retry dedup via the client-supplied
        # external_id, reusing external_id/external_source as the spec
        # suggests rather than a new field.
        external_id = request.data.get("external_id")
        if external_id and IntakeIssue.objects.filter(
            project_id=form.project_id, issue__external_id=external_id, issue__external_source="INTAKE_FORM"
        ).exists():
            return Response(success_response, status=status.HTTP_201_CREATED)

        triage_state = State.triage_objects.filter(project_id=form.project_id, workspace_id=form.workspace_id).first()
        if not triage_state:
            triage_state = State.objects.create(
                name="Triage",
                group=StateGroup.TRIAGE.value,
                project_id=form.project_id,
                workspace_id=form.workspace_id,
                color="#4E5355",
                sequence=65000,
                default=False,
            )

        issue = Issue.objects.create(
            name=title[:255],
            description_html=str(request.data.get("description_html") or "<p></p>"),
            priority=priority,
            state_id=form.default_state_id or triage_state.id,
            project_id=form.project_id,
            workspace_id=form.workspace_id,
            external_id=external_id or None,
            external_source="INTAKE_FORM" if external_id else None,
        )

        if form.show_labels_field:
            submitted_label_ids = list(
                Label.objects.filter(
                    id__in=request.data.get("label_ids", []) or [], project_id=form.project_id
                ).values_list("id", flat=True)
            )
            if submitted_label_ids:
                issue.labels.add(*submitted_label_ids)
        default_label_ids = list(form.default_labels.values_list("id", flat=True))
        if default_label_ids:
            issue.labels.add(*default_label_ids)

        intake = Intake.objects.filter(project_id=form.project_id, workspace_id=form.workspace_id).first()
        intake_issue = IntakeIssue.objects.create(
            intake=intake,
            project_id=form.project_id,
            workspace_id=form.workspace_id,
            issue=issue,
            source=SourceType.PUBLIC_FORM,
            intake_form=form,
            submitter_name=submitter_name,
            submitter_email=submitter_email,
            submitter_ip_hash=_hash_ip(request.META.get("REMOTE_ADDR")),
        )

        # created_by stays null on both Issue and IntakeIssue for a public
        # submission (exigence 7) - BaseModel.save() already does this
        # automatically since there's no authenticated user in this
        # request's context.
        assign_intake_responsibility(intake_issue, form.project, actor_id=None)
        run_triage_rules_for_intake_issue.delay(str(intake_issue.id), None)

        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps({"name": issue.name, "source": "intake_form"}, cls=DjangoJSONEncoder),
            actor_id=None,
            issue_id=str(issue.id),
            project_id=str(form.project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
        )

        # exigence 12 : never leaks the issue's internal id/sequence.
        return Response(success_response, status=status.HTTP_201_CREATED)
