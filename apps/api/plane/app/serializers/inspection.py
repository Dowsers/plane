# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Serializers for inspection compliance (ISO/IEC 17020 §4.1/§4.2) - see
`plane.db.models.inspection` for the data model."""

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    InspectionDocumentTemplate,
    InspectionDocumentTemplateVersion,
    InspectionSignature,
)

from .base import BaseSerializer

# A questionnaire question, as stored in
# `InspectionDocumentTemplateVersion.questionnaire_schema`. Validated here
# rather than on the model so adding a question type never needs a migration -
# see that field's own comment.
_ALLOWED_QUESTION_TYPES = ("boolean", "text")
_ALLOWED_ANSWER_STYLES = ("YES_NO", "TRUE_FALSE")


def validate_questionnaire_schema(schema):
    """Shared by the create and update paths. Rejects a schema that the
    evaluator could not interpret unambiguously - in particular a question
    carrying both polarities or neither, which would leave
    `plane.utils.inspection_questionnaire` unable to say what an answer means.
    """
    if not isinstance(schema, list):
        raise serializers.ValidationError("questionnaire_schema must be a list of questions.")

    seen_keys = set()
    for index, question in enumerate(schema):
        where = f"question {index + 1}"
        if not isinstance(question, dict):
            raise serializers.ValidationError(f"{where}: must be an object.")

        key = question.get("key")
        if not key or not isinstance(key, str):
            raise serializers.ValidationError(f"{where}: 'key' is required and must be a string.")
        if key in seen_keys:
            raise serializers.ValidationError(f"{where}: duplicate key '{key}'.")
        seen_keys.add(key)

        if not question.get("label") or not isinstance(question["label"], str):
            raise serializers.ValidationError(f"{where}: 'label' is required and must be a string.")

        qtype = question.get("type", "boolean")
        if qtype not in _ALLOWED_QUESTION_TYPES:
            raise serializers.ValidationError(
                f"{where}: 'type' must be one of {', '.join(_ALLOWED_QUESTION_TYPES)}."
            )

        style = question.get("answer_style", "YES_NO")
        if style not in _ALLOWED_ANSWER_STYLES:
            raise serializers.ValidationError(
                f"{where}: 'answer_style' must be one of {', '.join(_ALLOWED_ANSWER_STYLES)}."
            )

        if qtype == "boolean":
            polarities = [k for k in ("conflict_if", "required_value") if k in question]
            if len(polarities) > 1:
                raise serializers.ValidationError(
                    f"{where}: set either 'conflict_if' or 'required_value', not both - "
                    "a question cannot be a conflict disclosure and an attestation at once."
                )
            for polarity in polarities:
                if not isinstance(question[polarity], bool):
                    raise serializers.ValidationError(f"{where}: '{polarity}' must be a boolean.")

    return schema


class InspectionDocumentTemplateVersionSerializer(BaseSerializer):
    is_published = serializers.BooleanField(read_only=True)

    class Meta:
        model = InspectionDocumentTemplateVersion
        fields = [
            "id",
            "template",
            "version",
            "body",
            "asset",
            "questionnaire_schema",
            "published_at",
            "requires_resignature",
            "is_published",
            "created_at",
            "updated_at",
        ]
        # `version` is assigned by the view (max + 1), never by the client;
        # `published_at` only ever moves through the dedicated publish action,
        # so that the model's immutability guard cannot be sidestepped by a
        # plain PATCH that sets content and publication in one go.
        read_only_fields = ["template", "version", "published_at"]

    def validate_questionnaire_schema(self, value):
        return validate_questionnaire_schema(value)

    def validate(self, data):
        # Level 2 of the immutability guarantee (see the model's docstring):
        # the API refuses to mutate a published version's content at all,
        # rather than relying solely on the model's own `save()` guard.
        if self.instance is not None and self.instance.is_published:
            mutating = [
                field
                for field in ("body", "asset", "questionnaire_schema")
                if field in data
            ]
            if mutating:
                raise serializers.ValidationError(
                    {
                        "non_field_errors": [
                            "A published version is immutable. Create a new version instead of "
                            f"modifying {', '.join(sorted(mutating))}."
                        ]
                    }
                )
        return data


class InspectionDocumentTemplateSerializer(BaseSerializer):
    versions = InspectionDocumentTemplateVersionSerializer(many=True, read_only=True)
    scope = serializers.SerializerMethodField()

    class Meta:
        model = InspectionDocumentTemplate
        fields = [
            "id",
            "workspace",
            "project",
            "kind",
            "name",
            "scope",
            "versions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]

    def get_scope(self, obj):
        """Spells out what the nullable `project` column means, so a client
        never has to infer it."""
        return "PROJECT" if obj.project_id else "WORKSPACE"


class InspectionSignatureSerializer(BaseSerializer):
    """Read serializer. Signatures are never created through a serializer - the
    signing endpoint builds the row itself so that the evidentiary fields
    (checksum, IP, user agent, email snapshot) come from the request and the
    stored document, never from client input."""

    member_email = serializers.CharField(source="member.email", read_only=True)
    reviewed_by_email = serializers.CharField(source="reviewed_by.email", read_only=True)
    template_version_number = serializers.IntegerField(source="template_version.version", read_only=True)

    class Meta:
        model = InspectionSignature
        fields = [
            "id",
            "project",
            "member",
            "member_email",
            "template_version",
            "template_version_number",
            "kind",
            "signed_at",
            "signature_name_snapshot",
            "signer_email_snapshot",
            "document_checksum",
            "questionnaire_answers",
            "declared_conflicts",
            "review_status",
            "risk_level",
            "mitigation_measures",
            "reviewed_by",
            "reviewed_by_email",
            "reviewed_at",
            "review_notes",
            "created_at",
        ]
        read_only_fields = fields


class InspectionReviewSerializer(serializers.Serializer):
    """The managerial verdict on an impartiality declaration (§4.1). A plain
    `Serializer`, not a ModelSerializer: the review writes a fixed handful of
    fields on an existing row and must never be able to touch the signature
    evidence itself."""

    review_status = serializers.ChoiceField(
        choices=["ACCEPTED", "ACCEPTED_WITH_MEASURES", "REJECTED"]
    )
    risk_level = serializers.ChoiceField(
        choices=["NONE", "LOW", "MEDIUM", "HIGH"], required=False, allow_null=True
    )
    mitigation_measures = serializers.CharField(required=False, allow_blank=True)
    review_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        # §4.1 asks for an analysis, so "accepted with measures" without the
        # measures written down would be an empty record.
        if data["review_status"] == "ACCEPTED_WITH_MEASURES" and not data.get(
            "mitigation_measures", ""
        ).strip():
            raise serializers.ValidationError(
                {"mitigation_measures": "Required when accepting with mitigation measures."}
            )
        if data["review_status"] in ("ACCEPTED", "ACCEPTED_WITH_MEASURES") and not data.get(
            "risk_level"
        ):
            raise serializers.ValidationError(
                {"risk_level": "Required when accepting a declaration."}
            )
        return data
