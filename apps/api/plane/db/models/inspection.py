# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Inspection compliance - the evidentiary record that every active member of
a project flagged as an "inspection" (an audit/evaluation engagement) has
signed an impartiality declaration (ISO/IEC 17020 §4.1) and a confidentiality
agreement/NDA (§4.2).

## Why these are NOT in `audit.py`

`plane.db.models.audit` already owns `WorkspaceAuditLog`/`AuditEventType` -
and the name collision is a trap worth stating once, loudly: in THIS codebase
"audit" means a security-event trail (logins, role changes, token
revocations) that is deliberately immutable-but-PURGEABLE, hard-deleted in
bulk by a retention task (`plane.bgtasks.cleanup_task.
purge_expired_audit_logs`). In the BUSINESS domain this feature serves,
"audit" means the inspection engagement itself.

What this module stores is the opposite of purgeable: it is the permanent
proof, producible years later in front of an accreditation assessor, that a
named person accepted a specific text on a specific date. So none of it
extends `WorkspaceAuditLog`, and none of it is named `*AuditLog`. Emitting an
extra `WorkspaceAuditLog` row alongside a signature (for admin visibility) is
fine and planned, but it is never the source of truth.

## Flat-vs-satellite split

The project-level switches (`is_inspection_enabled`, `inspection_mode`, the
grace period, the review manager) are FLAT FIELDS ON `Project`, not a
satellite config model - matching this fork's established convention,
documented at length on `Project.is_ai_triage_enabled` in `project.py`:
nothing about those switches has a lifecycle independent of the project
itself.

The four models below are satellites because each genuinely does have its own
lifecycle: immutable published versions, per-row evidentiary provenance, and a
per-member grace clock that must survive a member leaving and rejoining.
"""

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

# Module imports
from plane.db.mixins import ChangeTrackerMixin

from .base import BaseModel
from .project import ProjectBaseModel
from .workspace import WorkspaceBaseModel


class InspectionDocumentKind(models.TextChoices):
    """The documents an inspection project's evaluators must sign.

    Deliberately a closed enum rather than free-form: this enum IS the
    definition of what a project owes, so "which obligations exist" is
    answerable by the enforcement gate without a database lookup. Every member
    here is required on every inspection project - there is no per-kind opt-out
    (the inspection mode does not modulate this, see `Project.inspection_mode`).

    `ETHICS_CHARTER` is a first-class signable document rather than merely
    question 12 of the impartiality questionnaire ("Avez-vous lu et accepté une
    charte d'éthique spécifique à cette mission ?"). Q12 remains in the form as
    issued - it is the signer's own attestation - but a self-declared "yes" is
    not evidence that a specific charter text was presented and accepted. Only
    a signature against a versioned charter is, which is exactly the same
    reason the NDA is not a checkbox either.

    Only `IMPARTIALITY` carries a questionnaire and a managerial review; the
    other two are accept-the-text documents (see `InspectionReviewStatus`).
    """

    IMPARTIALITY = "IMPARTIALITY", "Impartiality declaration (§4.1)"
    CONFIDENTIALITY = "CONFIDENTIALITY", "Confidentiality agreement / NDA (§4.2)"
    ETHICS_CHARTER = "ETHICS_CHARTER", "Mission ethics charter"


class InspectionQuestionCategory(models.TextChoices):
    """The five sections of the impartiality questionnaire. Carried per
    question in `questionnaire_schema` so the signed record reproduces the
    form's own structure, not just a flat list of answers."""

    PERSONAL_CONFLICTS = "PERSONAL_CONFLICTS", "I. Conflits d'intérêts personnels"
    PROFESSIONAL_COMMITMENTS = "PROFESSIONAL_COMMITMENTS", "II. Engagements professionnels"
    ANALYSIS_OBJECTIVITY = "ANALYSIS_OBJECTIVITY", "III. Objectivité de l'analyse"
    ETHICAL_CONDUCT = "ETHICAL_CONDUCT", "IV. Attitude et comportement éthique"
    FINAL_DECLARATION = "FINAL_DECLARATION", "V. Déclaration finale"


# The impartiality questionnaire as issued by the business (15 questions, 5
# sections). Shipped as a constant so a workspace admin never retypes it -
# the template-creation endpoint uses this as the initial
# `questionnaire_schema` of version 1. Same convention as `DEFAULT_STATES` in
# `state.py`: reference data as a module-level list next to the model it seeds.
#
# Question text is French because it is the legal text shown to and accepted
# by the signer - it is DATA, not UI copy, and must never be translated at
# render time (an evidentiary record has to reproduce exactly what was
# signed). Everything around it stays English, per this codebase's norms.
#
# Two fields carry the polarity, and getting them right is the whole point of
# this structure - the answers are NOT uniformly "true is good":
#
# - `conflict_if`: answering this way discloses a potential impartiality risk
#   (Q1-Q6, Q13). It does not invalidate anything; it means a manager must
#   look at it (§4.1 asks for a risk ANALYSIS, which is a human act).
# - `required_value`: the declaration asserts this, so answering otherwise
#   contradicts the document being signed (Q7-Q12, Q14, Q15).
#
# A questionnaire where every question was treated alike would silently let
# somebody tick "I am NOT in a position of impartiality" (Q15) and still be
# recorded as compliant. See `plane.utils.inspection_questionnaire` for the
# evaluation rules, including why a failed attestation is RECORDED and routed
# to review rather than rejected outright.
#
# `answer_style` exists because the form itself alternates between Oui/Non
# and Vrai/Faux; both are booleans, but the record must show the wording the
# signer actually saw.
DEFAULT_IMPARTIALITY_QUESTIONNAIRE = [
    {
        "key": "financial_interest",
        "number": 1,
        "category": InspectionQuestionCategory.PERSONAL_CONFLICTS.value,
        "label": (
            "Avez-vous des investissements financiers (tokens, actions, NFTs) "
            "dans le protocole ou le projet à évaluer ?"
        ),
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "team_relationships",
        "number": 2,
        "category": InspectionQuestionCategory.PERSONAL_CONFLICTS.value,
        "label": (
            "Avez-vous des relations personnelles ou professionnelles avec des "
            "membres de l'équipe du projet ?"
        ),
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "worked_or_applied_12_months",
        "number": 3,
        "category": InspectionQuestionCategory.PERSONAL_CONFLICTS.value,
        "label": "Avez-vous déjà travaillé (ou postulé) pour ce projet dans les 12 derniers mois ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "received_remuneration",
        "number": 4,
        "category": InspectionQuestionCategory.PERSONAL_CONFLICTS.value,
        "label": "Avez-vous déjà perçu une rémunération du projet ou d'une entité affiliée ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "competing_project",
        "number": 5,
        "category": InspectionQuestionCategory.PROFESSIONAL_COMMITMENTS.value,
        "label": "Participez-vous à un projet concurrent ou affecté par cette évaluation ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "solicited_favourable_opinion",
        "number": 6,
        "category": InspectionQuestionCategory.PROFESSIONAL_COMMITMENTS.value,
        "label": "Avez-vous été explicitement sollicité pour rendre un avis favorable ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "free_from_pressure",
        "number": 7,
        "category": InspectionQuestionCategory.PROFESSIONAL_COMMITMENTS.value,
        "label": "Êtes-vous libre d'accepter ou refuser ce mandat sans pression externe ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "required_value": True,
    },
    {
        "key": "verifiable_technical_facts_only",
        "number": 8,
        "category": InspectionQuestionCategory.ANALYSIS_OBJECTIVITY.value,
        "label": "L'analyse repose-t-elle uniquement sur des faits techniques vérifiables ?",
        "type": "boolean",
        "answer_style": "TRUE_FALSE",
        "required": True,
        "required_value": True,
    },
    {
        "key": "will_report_competence_limits",
        "number": 9,
        "category": InspectionQuestionCategory.ANALYSIS_OBJECTIVITY.value,
        "label": "Vous engagez-vous à signaler toute limite de compétence ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "required_value": True,
    },
    {
        "key": "accepts_peer_review",
        "number": 10,
        "category": InspectionQuestionCategory.ANALYSIS_OBJECTIVITY.value,
        "label": "Êtes-vous prêt à faire relire vos conclusions par un pair indépendant ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "required_value": True,
    },
    {
        "key": "aware_of_financial_legal_impact",
        "number": 11,
        "category": InspectionQuestionCategory.ETHICAL_CONDUCT.value,
        "label": (
            "Êtes-vous conscient que votre évaluation peut influencer des "
            "décisions financières ou juridiques ?"
        ),
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "required_value": True,
    },
    # Kept exactly as issued even though the charter is now separately
    # signable (`InspectionDocumentKind.ETHICS_CHARTER`): the form is the
    # business's own document and dropping a question from it is not a
    # technical decision. The two are complementary, not redundant - this is
    # the signer's self-declaration, while the ETHICS_CHARTER signature is the
    # evidence that a specific charter version was presented and accepted.
    # Expect them to agree; a "Non" here alongside a signed charter is a
    # genuine signal for the reviewing manager, not a bug.
    {
        "key": "accepted_ethics_charter",
        "number": 12,
        "category": InspectionQuestionCategory.ETHICAL_CONDUCT.value,
        "label": "Avez-vous lu et accepté une charte d'éthique spécifique à cette mission ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "required_value": True,
    },
    {
        "key": "known_personal_bias",
        "number": 13,
        "category": InspectionQuestionCategory.ETHICAL_CONDUCT.value,
        "label": "Avez-vous connaissance d'un biais personnel pouvant altérer votre jugement ?",
        "type": "boolean",
        "answer_style": "YES_NO",
        "required": True,
        "conflict_if": True,
    },
    {
        "key": "answered_honestly",
        "number": 14,
        "category": InspectionQuestionCategory.FINAL_DECLARATION.value,
        "label": "Je certifie avoir répondu honnêtement et complètement à ce questionnaire.",
        "type": "boolean",
        "answer_style": "TRUE_FALSE",
        "required": True,
        "required_value": True,
    },
    {
        "key": "attests_impartiality",
        "number": 15,
        "category": InspectionQuestionCategory.FINAL_DECLARATION.value,
        "label": "J'atteste être en position d'impartialité pour cette mission d'évaluation.",
        "type": "boolean",
        "answer_style": "TRUE_FALSE",
        "required": True,
        "required_value": True,
    },
]


class InspectionReviewStatus(models.TextChoices):
    """Managerial review state of a signed declaration.

    Only ever leaves `NOT_REQUIRED` for `IMPARTIALITY` rows: §4.1 asks for a
    risk ANALYSIS, not merely a signature, so an impartiality declaration is
    not finished until a responsible manager has recorded a risk level and any
    mitigation measures. An NDA (§4.2) is a unilateral commitment with nothing
    to analyse, so the signing endpoint stamps those rows `NOT_REQUIRED` at
    creation. `NOT_REQUIRED` is therefore the model default: a row only
    becomes `PENDING` when the signing endpoint knows it is an impartiality
    declaration, which keeps the "needs a human" queue empty by construction
    rather than by remembering to clear it.
    """

    NOT_REQUIRED = "NOT_REQUIRED", "Review not required"
    PENDING = "PENDING", "Pending review"
    ACCEPTED = "ACCEPTED", "Accepted"
    ACCEPTED_WITH_MEASURES = "ACCEPTED_WITH_MEASURES", "Accepted with mitigation measures"
    REJECTED = "REJECTED", "Rejected - evaluator excluded"


class InspectionRiskLevel(models.TextChoices):
    """Impartiality risk recorded by the reviewing manager (§4.1)."""

    NONE = "NONE", "No identified risk"
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"


class InspectionDocumentTemplate(WorkspaceBaseModel):
    """A document a project's evaluators must sign, in one of two scopes.

    `WorkspaceBaseModel` already gives exactly the shape needed: a mandatory
    `workspace` FK plus a NULLABLE `project` FK (and a `save()` that derives
    the workspace from the project when one is set). That nullability IS the
    scope mechanism:

    - `project IS NULL` -> the workspace-wide default for this `kind`, authored
      once by a workspace admin and inherited by every inspection project.
    - `project` set -> a per-project override, for the common real case of a
      client that insists on signing its own NDA text rather than ours.

    One model with a nullable project rather than two near-duplicate models:
    resolution is then a single ordered query (project-specific first,
    workspace default second) instead of two queries plus a merge.

    The two partial unique constraints below are what make that resolution
    unambiguous - at most one live workspace default per kind, and at most one
    live override per (project, kind). They are partial (`deleted_at IS NULL`)
    rather than plain `unique_together` for the reason the whole codebase does
    this: a soft-deleted row must not block re-creating its replacement.
    """

    kind = models.CharField(max_length=32, choices=InspectionDocumentKind.choices)
    name = models.CharField(max_length=255)

    class Meta:
        verbose_name = "Inspection Document Template"
        verbose_name_plural = "Inspection Document Templates"
        db_table = "inspection_document_templates"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "kind"],
                condition=Q(project__isnull=True, deleted_at__isnull=True),
                name="inspection_template_unique_workspace_default_per_kind",
            ),
            models.UniqueConstraint(
                fields=["workspace", "project", "kind"],
                condition=Q(project__isnull=False, deleted_at__isnull=True),
                name="inspection_template_unique_project_override_per_kind",
            ),
        ]

    def __str__(self):
        scope = f"project:{self.project_id}" if self.project_id else f"workspace:{self.workspace_id}"
        return f"{self.kind} <{scope}>"


class InspectionDocumentTemplateVersion(ChangeTrackerMixin, BaseModel):
    """One immutable-once-published revision of a template's text.

    Immutability is the single most important property in this module: a
    signature is only worth anything if the text it points at cannot have been
    edited afterwards. It is enforced at three independent levels, because any
    one of them alone is bypassable:

    1. `save()` below refuses to mutate content once `published_at` is set.
    2. The API exposes no PATCH route for a published version - editing means
       POSTing a NEW version (see the publish endpoint).
    3. `InspectionSignature.template_version` is `PROTECT`, so the text that
       somebody signed can never be deleted out from under the signature.

    No database trigger: this repo has no trigger precedent anywhere, and
    introducing one here would put enforcement somewhere no reader of this
    model would think to look.

    `questionnaire_schema` is versioned WITH the body on purpose, and it is
    what makes §4.1 genuinely auditable rather than decorative: an assessor
    does not just ask "did they declare?", they ask "what were they asked?".
    Storing the question list alongside the text means that question set is
    pinned to the signature forever, even after the questionnaire is later
    revised. Shape: an ordered list of question dicts - see
    `DEFAULT_IMPARTIALITY_QUESTIONNAIRE` above for the canonical example and
    the meaning of `conflict_if`/`required_value`/`answer_style`. Validated at
    the serializer layer, not here - the model stays a dumb container so a
    future question type cannot require a migration.
    """

    # Content whose mutation after publication would invalidate every
    # signature pointing at this row.
    CONTENT_FIELDS = ("body", "asset_id", "questionnaire_schema")
    TRACKED_FIELDS = (*CONTENT_FIELDS, "published_at")

    template = models.ForeignKey(
        InspectionDocumentTemplate, on_delete=models.CASCADE, related_name="versions"
    )
    version = models.PositiveIntegerField()
    body = models.TextField(blank=True, default="")
    # Optional PDF/attachment, for a client-supplied NDA that is not plain
    # text. `SET_NULL` rather than `PROTECT`: losing the attachment must not
    # make the version row unreadable, and `document_checksum` on each
    # signature still pins what was actually signed.
    asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inspection_template_versions",
    )
    questionnaire_schema = models.JSONField(default=list, blank=True)
    # Null until published. A draft is freely editable; publishing freezes it.
    published_at = models.DateTimeField(null=True, blank=True)
    # Whether publishing this version obliges everyone who signed an earlier
    # version to sign again. False allows a genuine typo fix to ship without
    # invalidating existing evidence.
    requires_resignature = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Inspection Document Template Version"
        verbose_name_plural = "Inspection Document Template Versions"
        db_table = "inspection_document_template_versions"
        ordering = ("template", "-version")
        constraints = [
            models.UniqueConstraint(
                fields=["template", "version"],
                condition=Q(deleted_at__isnull=True),
                name="inspection_template_version_unique_number_per_template",
            )
        ]

    @property
    def is_published(self):
        return self.published_at is not None

    def save(self, *args, **kwargs):
        # Level 1 of the immutability guarantee (see class docstring).
        # Deliberately keyed on the STORED `published_at` (`_original_values`,
        # captured by `ChangeTrackerMixin.__init__`), not the in-memory one -
        # otherwise the very act of publishing, which sets `published_at` in
        # the same save as nothing else, would trip its own guard.
        if not self._state.adding and self._original_values.get("published_at") is not None:
            mutated = [field for field in self.CONTENT_FIELDS if self.has_changed(field)]
            if mutated:
                raise ValidationError(
                    {
                        "non_field_errors": [
                            "A published inspection document version is immutable; "
                            f"cannot modify {', '.join(sorted(mutated))}. "
                            "Create a new version instead."
                        ]
                    }
                )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.template_id} v{self.version}"


class InspectionSignature(ProjectBaseModel):
    """One member's signature of one specific template version, plus - for an
    impartiality declaration - the managerial review of it.

    `ProjectBaseModel` supplies `project`/`workspace`. Re-signing after a
    republication creates a NEW row rather than updating this one (the unique
    constraint is on the triple including `template_version`), so the full
    history of what each person accepted and when is preserved rather than
    overwritten - which is the entire point of an evidentiary record.

    ## Why the answers are a JSONField and not relational rows

    `questionnaire_answers` is only ever interpretable against the
    `questionnaire_schema` snapshot on the version this row points at. The
    answers are never aggregated field-by-field across people (the §4.1
    question that matters is "what did THIS evaluator declare on THIS
    engagement"), and the question set legitimately differs between versions.
    Relational rows would buy nothing and would force a migration every time
    the business revises a question. This also matches existing practice in
    the codebase (`WorkspaceAuditLog.old_value`/`metadata`).

    The one thing an admin dashboard genuinely needs to filter on cheaply -
    "who declared a conflict at all" - is denormalised into
    `declared_conflicts` rather than reached for inside the JSON.

    ## Why the review fields are flat here

    A review has no life of its own: it cannot exist without the declaration
    it reviews, is created at most once per declaration, and dies with it. A
    satellite would be a 1:1 table joined on every read for no gain - the same
    reasoning this fork applied to the AI-triage settings.

    ## Snapshots

    `signature_name_snapshot`/`signer_email_snapshot` are captured at write
    time and never refreshed, mirroring `WorkspaceAuditLog.actor_email_snapshot`:
    the evidence must still name the signer years later, after a rename, an
    email change, or account deletion.
    """

    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inspection_signatures",
    )
    # PROTECT, never CASCADE: deleting the text somebody signed would destroy
    # the evidence this whole module exists to produce.
    template_version = models.ForeignKey(
        InspectionDocumentTemplateVersion,
        on_delete=models.PROTECT,
        related_name="signatures",
    )
    # Denormalised from `template_version.template.kind` so the enforcement
    # gate and the compliance dashboard can filter without a two-table join on
    # a hot path.
    kind = models.CharField(max_length=32, choices=InspectionDocumentKind.choices)

    signed_at = models.DateTimeField()
    # What the signer typed as their name, plus who they were at that instant.
    signature_name_snapshot = models.CharField(max_length=255, blank=True, default="")
    signer_email_snapshot = models.CharField(max_length=255, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    # sha256 of the exact rendered body that was displayed and accepted -
    # independent corroboration that `template_version` has not been tampered
    # with, and the piece that makes this a defensible (eIDAS "simple")
    # electronic signature rather than a bare boolean.
    document_checksum = models.CharField(max_length=64, blank=True, default="")

    questionnaire_answers = models.JSONField(default=dict, blank=True)
    declared_conflicts = models.BooleanField(default=False)

    # --- Managerial review (§4.1). See `InspectionReviewStatus` for why the
    # default is NOT_REQUIRED rather than PENDING.
    review_status = models.CharField(
        max_length=32,
        choices=InspectionReviewStatus.choices,
        default=InspectionReviewStatus.NOT_REQUIRED,
    )
    risk_level = models.CharField(
        max_length=16, choices=InspectionRiskLevel.choices, null=True, blank=True
    )
    mitigation_measures = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inspection_reviews_performed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Inspection Signature"
        verbose_name_plural = "Inspection Signatures"
        db_table = "inspection_signatures"
        ordering = ("-signed_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member", "template_version"],
                condition=Q(deleted_at__isnull=True),
                name="inspection_signature_unique_member_version_per_project",
            )
        ]
        indexes = [
            # The enforcement gate's own question: "has this member satisfied
            # this kind on this project?"
            models.Index(fields=["project", "member", "kind"]),
            # The review queue: "which declarations still need a manager?"
            models.Index(fields=["project", "review_status"]),
        ]

    def __str__(self):
        return f"{self.kind} signed by {self.signer_email_snapshot} <{self.project_id}>"


class InspectionObligation(ProjectBaseModel):
    """Per-(project, member, kind) grace clock and reminder bookkeeping - the
    anti-lockout keystone of the enforcement gate.

    ## Why this row exists at all

    Enforcement is PROGRESSIVE: banner and reminders first, blocking only once
    a grace period has elapsed. "Elapsed since when" is the whole design, and
    every cheaper-looking anchor is wrong:

    - The project's own `inspection_enabled_at` would block every existing
      member the instant an admin flips the switch, with no warning period at
      all.
    - `ProjectMember.created_at` is the member's ORIGINAL join date (rows are
      reused on reactivation - see `ProjectMember`'s own partial unique
      constraint on `(project, member)`), so a member who leaves and rejoins
      would be born already past their deadline.
    - A template's `published_at` would make every republication an instant
      org-wide lockout.

    So the clock is per member, stamped once at first observation, and
    explicitly reset (one bulk `.update()`, at the publish endpoint) when a new
    version legitimately restarts the obligation. That reset is why publishing
    a revised NDA can never block a project instantly.

    ## Why rows are created lazily

    Via `get_or_create` in one helper on the request path, never eagerly at
    membership-mutation sites. Member reactivation goes through a
    `bulk_update()` (see `plane.app.views.project.member`) which bypasses both
    `save()` and signals - and this fork has deliberately added zero Django
    signals across every shipped feature. Eager creation would therefore mean
    editing every membership call site and still missing the bulk paths. Lazy
    creation needs no call-site edits, is self-healing for rows that somehow
    never got made, and needs no data backfill for existing projects.
    """

    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inspection_obligations",
    )
    kind = models.CharField(max_length=32, choices=InspectionDocumentKind.choices)
    # The grace clock. Stamped at first observation; reset by the publish
    # endpoint when a new version requires re-signature.
    obligation_started_at = models.DateTimeField()
    last_reminder_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_count = models.PositiveSmallIntegerField(default=0)
    # Set once, at the moment the grace period is first observed to have
    # elapsed. Drives the single "your access is now blocked" email (sent on
    # the null -> set transition) and tells the dashboard who is actually
    # blocked versus merely overdue.
    blocked_since = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Inspection Obligation"
        verbose_name_plural = "Inspection Obligations"
        db_table = "inspection_obligations"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member", "kind"],
                condition=Q(deleted_at__isnull=True),
                name="inspection_obligation_unique_member_kind_per_project",
            )
        ]
        indexes = [
            # The reminder task's own scan: outstanding obligations, oldest
            # reminder first.
            models.Index(fields=["last_reminder_sent_at"]),
        ]

    def __str__(self):
        return f"{self.kind} owed by {self.member_id} <{self.project_id}>"
