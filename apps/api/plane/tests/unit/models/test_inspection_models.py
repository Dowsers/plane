# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Model-level guarantees of the inspection compliance feature
(`plane.db.models.inspection`).

The immutability tests below are the load-bearing ones: a signature is only
evidence if the text it points at provably cannot have been edited after the
fact, so each of the three enforcement levels described in
`InspectionDocumentTemplateVersion`'s docstring gets its own test.
"""

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from plane.db.models import (
    INSPECTION_SIGNING_ORDER,
    InspectionDocumentKind,
    InspectionDocumentTemplate,
    InspectionDocumentTemplateVersion,
    InspectionObligation,
    InspectionSignature,
)
from plane.tests.factories import (
    InspectionDocumentTemplateFactory,
    InspectionDocumentTemplateVersionFactory,
    InspectionObligationFactory,
    InspectionSignatureFactory,
    ProjectFactory,
    UserFactory,
    WorkspaceFactory,
)


@pytest.mark.unit
class TestProjectInspectionFields:
    """The flat switches on `Project`."""

    @pytest.mark.django_db
    def test_inspection_is_off_by_default(self):
        """Migration 0192 must be a no-op for every existing project."""
        project = ProjectFactory()

        assert project.is_inspection_enabled is False
        assert project.inspection_mode == "MANUAL"
        assert project.inspection_grace_period_days == 7
        assert project.inspection_enforcement_paused is False
        assert project.inspection_enabled_at is None
        assert project.inspection_review_manager is None


@pytest.mark.unit
class TestInspectionDocumentKind:
    """The enum IS the definition of what an inspection project owes."""

    def test_three_documents_are_required(self):
        assert set(InspectionDocumentKind.values) == {
            "IMPARTIALITY",
            "CONFIDENTIALITY",
            "ETHICS_CHARTER",
        }

    def test_ethics_charter_is_a_document_not_a_checkbox(self):
        """Question 12 of the impartiality form asks whether the charter was
        accepted; this kind is what makes a specific charter VERSION signable,
        which a self-declared checkbox can never evidence."""
        assert InspectionDocumentKind.ETHICS_CHARTER in InspectionDocumentKind


@pytest.mark.unit
class TestInspectionSigningOrder:
    """The business-mandated sequence, stated once and asserted here."""

    def test_order_is_charter_then_impartiality_then_nda(self):
        assert INSPECTION_SIGNING_ORDER == ("ETHICS_CHARTER", "IMPARTIALITY", "CONFIDENTIALITY")

    def test_order_covers_every_kind_exactly_once(self):
        # A kind missing from the order would silently never be sequenced; a
        # duplicate would make `.index()` lie about its position.
        assert sorted(INSPECTION_SIGNING_ORDER) == sorted(InspectionDocumentKind.values)
        assert len(set(INSPECTION_SIGNING_ORDER)) == len(INSPECTION_SIGNING_ORDER)


@pytest.mark.unit
class TestInspectionDocumentTemplateScoping:
    """`project IS NULL` = workspace default, `project` set = override."""

    @pytest.mark.django_db
    def test_workspace_default_and_project_override_coexist(self):
        """Both scopes of the same kind must be storable at once - that is the
        whole point of resolving project-first, workspace-second."""
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace)

        default = InspectionDocumentTemplateFactory(
            workspace=workspace, project=None, kind=InspectionDocumentKind.CONFIDENTIALITY
        )
        override = InspectionDocumentTemplateFactory(
            workspace=workspace, project=project, kind=InspectionDocumentKind.CONFIDENTIALITY
        )

        assert default.project_id is None
        assert override.project_id == project.id
        # WorkspaceBaseModel.save() derives the workspace from the project.
        assert override.workspace_id == workspace.id

    @pytest.mark.django_db
    def test_second_workspace_default_of_same_kind_is_rejected(self):
        workspace = WorkspaceFactory()
        InspectionDocumentTemplateFactory(
            workspace=workspace, project=None, kind=InspectionDocumentKind.IMPARTIALITY
        )

        with pytest.raises(IntegrityError), transaction.atomic():
            InspectionDocumentTemplateFactory(
                workspace=workspace, project=None, kind=InspectionDocumentKind.IMPARTIALITY
            )

    @pytest.mark.django_db
    def test_every_kind_can_be_a_workspace_default(self):
        """All three kinds coexist as defaults - impartiality, NDA and the
        mission ethics charter."""
        workspace = WorkspaceFactory()

        for kind in InspectionDocumentKind:
            InspectionDocumentTemplateFactory(workspace=workspace, project=None, kind=kind)

        assert InspectionDocumentTemplate.objects.filter(workspace=workspace).count() == len(
            InspectionDocumentKind
        )

    @pytest.mark.django_db
    def test_second_project_override_of_same_kind_is_rejected(self):
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace)
        InspectionDocumentTemplateFactory(
            workspace=workspace, project=project, kind=InspectionDocumentKind.IMPARTIALITY
        )

        with pytest.raises(IntegrityError), transaction.atomic():
            InspectionDocumentTemplateFactory(
                workspace=workspace, project=project, kind=InspectionDocumentKind.IMPARTIALITY
            )

    @pytest.mark.django_db
    def test_soft_deleted_template_does_not_block_its_replacement(self):
        """The constraints are partial on `deleted_at IS NULL` precisely so a
        retired template can be replaced without a hard delete first.

        Sets `deleted_at` via `.update()` rather than `.delete()` on purpose:
        `SoftDeleteModel.delete()` dispatches a Celery task, which is not what
        this test is about.
        """
        workspace = WorkspaceFactory()
        retired = InspectionDocumentTemplateFactory(
            workspace=workspace, project=None, kind=InspectionDocumentKind.IMPARTIALITY
        )
        InspectionDocumentTemplate.all_objects.filter(pk=retired.pk).update(
            deleted_at=timezone.now()
        )

        replacement = InspectionDocumentTemplateFactory(
            workspace=workspace, project=None, kind=InspectionDocumentKind.IMPARTIALITY
        )

        assert replacement.pk != retired.pk
        assert InspectionDocumentTemplate.objects.filter(workspace=workspace).count() == 1


@pytest.mark.unit
class TestInspectionDocumentTemplateVersionImmutability:
    """Level 1 of the immutability guarantee - the `save()` guard."""

    @pytest.mark.django_db
    def test_draft_content_is_editable(self):
        version = InspectionDocumentTemplateVersionFactory(published_at=None)

        version.body = "Revised draft text"
        version.save()
        version.refresh_from_db()

        assert version.body == "Revised draft text"
        assert version.is_published is False

    @pytest.mark.django_db
    def test_publishing_a_draft_is_not_blocked_by_its_own_guard(self):
        """Regression guard: keying the check on the in-memory `published_at`
        instead of the stored one would make publishing trip its own check."""
        version = InspectionDocumentTemplateVersionFactory(published_at=None)

        version.published_at = timezone.now()
        version.save()
        version.refresh_from_db()

        assert version.is_published is True

    @pytest.mark.django_db
    def test_published_body_cannot_be_modified(self):
        version = InspectionDocumentTemplateVersionFactory(published_at=timezone.now())
        version.refresh_from_db()

        version.body = "Tampered text"
        with pytest.raises(ValidationError):
            version.save()

    @pytest.mark.django_db
    def test_published_questionnaire_schema_cannot_be_modified(self):
        """The question set is what makes §4.1 auditable - it must be as frozen
        as the declaration text itself."""
        version = InspectionDocumentTemplateVersionFactory(published_at=timezone.now())
        version.refresh_from_db()

        version.questionnaire_schema = [{"key": "sneaky", "label": "?", "type": "boolean"}]
        with pytest.raises(ValidationError):
            version.save()

    @pytest.mark.django_db
    def test_published_non_content_fields_remain_editable(self):
        """`requires_resignature` is policy, not signed content - freezing it
        would mean a published version could never be corrected on that axis."""
        version = InspectionDocumentTemplateVersionFactory(
            published_at=timezone.now(), requires_resignature=True
        )
        version.refresh_from_db()

        version.requires_resignature = False
        version.save()
        version.refresh_from_db()

        assert version.requires_resignature is False

    @pytest.mark.django_db
    def test_version_numbers_are_unique_per_template(self):
        template = InspectionDocumentTemplateFactory()
        InspectionDocumentTemplateVersionFactory(template=template, version=1)

        with pytest.raises(IntegrityError), transaction.atomic():
            InspectionDocumentTemplateVersionFactory(template=template, version=1)

    @pytest.mark.django_db
    def test_same_version_number_allowed_across_templates(self):
        first = InspectionDocumentTemplateVersionFactory(version=1)
        second = InspectionDocumentTemplateVersionFactory(version=1)

        assert first.template_id != second.template_id
        assert InspectionDocumentTemplateVersion.objects.filter(version=1).count() == 2


@pytest.mark.unit
class TestInspectionSignature:
    @pytest.mark.django_db
    def test_signature_records_its_evidence(self):
        signature = InspectionSignatureFactory()

        assert signature.signed_at is not None
        assert signature.signer_email_snapshot
        assert signature.document_checksum
        assert signature.ip_address == "198.51.100.10"
        # Review is not pending until the signing endpoint says so - see
        # InspectionReviewStatus' docstring.
        assert signature.review_status == "NOT_REQUIRED"
        assert signature.declared_conflicts is False

    @pytest.mark.django_db
    def test_signed_version_cannot_be_deleted(self):
        """Level 3 of the immutability guarantee - `PROTECT`. Destroying the
        text somebody signed would destroy the evidence itself."""
        signature = InspectionSignatureFactory()

        with pytest.raises(IntegrityError), transaction.atomic():
            # Hard delete - a soft delete leaves the row (and the evidence)
            # perfectly readable, which is why only this path needs protecting.
            signature.template_version.delete(soft=False)

    @pytest.mark.django_db
    def test_member_cannot_sign_the_same_version_twice(self):
        signature = InspectionSignatureFactory()

        with pytest.raises(IntegrityError), transaction.atomic():
            InspectionSignatureFactory(
                project=signature.project,
                member=signature.member,
                template_version=signature.template_version,
            )

    @pytest.mark.django_db
    def test_resigning_a_new_version_adds_a_row_and_keeps_the_old_one(self):
        """Republication must preserve history, not overwrite it - that is why
        the unique constraint includes `template_version`."""
        first = InspectionSignatureFactory()
        next_version = InspectionDocumentTemplateVersionFactory(
            template=first.template_version.template, version=first.template_version.version + 1
        )

        InspectionSignatureFactory(
            project=first.project, member=first.member, template_version=next_version
        )

        assert (
            InspectionSignature.objects.filter(
                project=first.project, member=first.member
            ).count()
            == 2
        )

    @pytest.mark.django_db
    def test_review_fields_capture_the_risk_analysis(self):
        """§4.1 wants an analysis, not just a signature."""
        reviewer = UserFactory()
        signature = InspectionSignatureFactory(
            declared_conflicts=True,
            questionnaire_answers={"prior_relationship": True, "details": "Audited them in 2024"},
            review_status="PENDING",
        )

        signature.review_status = "ACCEPTED_WITH_MEASURES"
        signature.risk_level = "MEDIUM"
        signature.mitigation_measures = "Second reviewer assigned to cross-check findings."
        signature.reviewed_by = reviewer
        signature.reviewed_at = timezone.now()
        signature.save()
        signature.refresh_from_db()

        assert signature.declared_conflicts is True
        assert signature.questionnaire_answers["prior_relationship"] is True
        assert signature.risk_level == "MEDIUM"
        assert signature.reviewed_by_id == reviewer.id


@pytest.mark.unit
class TestInspectionObligation:
    @pytest.mark.django_db
    def test_obligation_starts_an_unblocked_clock(self):
        obligation = InspectionObligationFactory()

        assert obligation.obligation_started_at is not None
        assert obligation.blocked_since is None
        assert obligation.reminder_count == 0
        assert obligation.last_reminder_sent_at is None

    @pytest.mark.django_db
    def test_one_obligation_per_member_and_kind(self):
        obligation = InspectionObligationFactory()

        with pytest.raises(IntegrityError), transaction.atomic():
            InspectionObligationFactory(
                project=obligation.project,
                member=obligation.member,
                kind=obligation.kind,
            )

    @pytest.mark.django_db
    def test_every_kind_is_owed_independently(self):
        """A member owes one obligation per kind - the enum is the definition of
        what an inspection project requires, so this count must track it."""
        first = InspectionObligationFactory(kind=InspectionDocumentKind.IMPARTIALITY)
        for kind in InspectionDocumentKind:
            if kind == InspectionDocumentKind.IMPARTIALITY:
                continue
            InspectionObligationFactory(project=first.project, member=first.member, kind=kind)

        assert InspectionObligation.objects.filter(
            project=first.project, member=first.member
        ).count() == len(InspectionDocumentKind)
