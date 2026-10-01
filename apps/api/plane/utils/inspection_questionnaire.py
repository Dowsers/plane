# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Evaluation of impartiality questionnaire answers against the schema snapshot
they were given for (ISO/IEC 17020 §4.1).

See `DEFAULT_IMPARTIALITY_QUESTIONNAIRE` in `plane.db.models.inspection` for
the schema shape. This module is deliberately pure - it takes a schema and an
answers dict and returns a verdict, touching no models and no request state -
so the rules below are testable in isolation and reusable from the signing
endpoint, the compliance dashboard and the review UI alike.

## The one rule worth arguing about

A questionnaire answer can fail in two quite different ways, and the form the
business issued mixes both:

- A CONFLICT DISCLOSURE (`conflict_if`, Q1-Q6/Q13): "yes, I hold tokens in
  this protocol". Nothing is wrong with the submission; it discloses a risk,
  and §4.1 wants that risk ANALYSED by a responsible person.
- A FAILED ATTESTATION (`required_value`, Q7-Q12/Q14/Q15): the declaration
  text asserts something ("I attest that I am in a position of
  impartiality") and the signer ticked the opposite.

The tempting handling of a failed attestation is to reject the submission
(HTTP 400): the document contradicts itself, so refuse to record it. That is
wrong here, and the reason is worth stating because it is not obvious: a
rejected submission is a DISCLOSURE THROWN AWAY. Someone ticking "no, I am not
free from external pressure" (Q7) has just told the organisation the single
most important thing §4.1 exists to surface, and a 400 would discard it,
leave no trace, and invite them to tick the other box to get through.

So both outcomes are RECORDED, and both route to managerial review. What they
never do is silently satisfy the obligation: a signature carrying either flag
leaves `review_status=PENDING`, and the enforcement gate must treat the
obligation as unmet until a manager reaches a verdict. Recording the answer
and withholding access is strictly more informative than refusing the answer.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class QuestionnaireEvaluation:
    """Verdict on one set of answers. All tuples hold question `key`s."""

    # Required questions with no answer supplied.
    missing: tuple[str, ...] = ()
    # Answers of the wrong type, or keys absent from the schema.
    invalid: tuple[str, ...] = ()
    # `conflict_if` matched - a disclosed impartiality risk.
    conflicts: tuple[str, ...] = ()
    # `required_value` not met - the signer contradicted the declaration.
    failed_attestations: tuple[str, ...] = ()
    # Normalised answers, restricted to keys the schema knows about.
    cleaned: dict[str, Any] = field(default_factory=dict)

    @property
    def is_complete(self) -> bool:
        """Whether this submission can be recorded at all. Note that conflicts
        and failed attestations do NOT make a submission incomplete - see this
        module's docstring for why they are recorded rather than refused."""
        return not self.missing and not self.invalid

    @property
    def declared_conflicts(self) -> bool:
        """Feeds `InspectionSignature.declared_conflicts`, the one denormalised
        flag the dashboard filters on."""
        return bool(self.conflicts or self.failed_attestations)

    @property
    def requires_review(self) -> bool:
        """An impartiality declaration always needs a human verdict when
        anything was disclosed; a clean one does not."""
        return self.declared_conflicts


def evaluate_answers(schema: list[dict], answers: dict[str, Any]) -> QuestionnaireEvaluation:
    """Evaluate `answers` against `schema` (a `questionnaire_schema` snapshot).

    `schema` is trusted (it is our own stored data); `answers` is not (it comes
    straight off the request), so every lookup is defensive and unknown keys
    are reported rather than silently dropped.
    """
    answers = answers if isinstance(answers, dict) else {}

    missing: list[str] = []
    invalid: list[str] = []
    conflicts: list[str] = []
    failed_attestations: list[str] = []
    cleaned: dict[str, Any] = {}

    known_keys = set()

    for question in schema or []:
        key = question.get("key")
        if not key:
            # A malformed schema entry is our bug, not the signer's - skip it
            # rather than blaming the submission for it.
            continue
        known_keys.add(key)

        qtype = question.get("type", "boolean")
        required = bool(question.get("required", False))
        answered = key in answers
        value = answers.get(key)

        if not answered or value is None or (qtype == "text" and value == ""):
            if required:
                missing.append(key)
            continue

        if qtype == "boolean":
            # Strictly bool: accepting truthy strings here would make "False"
            # (a non-empty string) read as an affirmative answer on a legal
            # declaration.
            if not isinstance(value, bool):
                invalid.append(key)
                continue
        elif qtype == "text":
            if not isinstance(value, str):
                invalid.append(key)
                continue
        else:
            # Unknown question type in our own schema - treat the answer as
            # opaque and pass it through rather than rejecting the signature.
            pass

        cleaned[key] = value

        if qtype == "boolean":
            if "conflict_if" in question and value is question["conflict_if"]:
                conflicts.append(key)
            if "required_value" in question and value is not question["required_value"]:
                failed_attestations.append(key)

    invalid.extend(sorted(set(answers) - known_keys))

    return QuestionnaireEvaluation(
        missing=tuple(missing),
        invalid=tuple(invalid),
        conflicts=tuple(conflicts),
        failed_attestations=tuple(failed_attestations),
        cleaned=cleaned,
    )
