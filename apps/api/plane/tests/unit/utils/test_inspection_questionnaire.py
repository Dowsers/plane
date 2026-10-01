# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Evaluation rules for the impartiality questionnaire
(`plane.utils.inspection_questionnaire`).

No database: the evaluator is pure, which is the point of having it separate
from the signing endpoint.

The polarity tests are the ones that matter. The questionnaire the business
issued is NOT uniformly "true is good" - Q1-Q6/Q13 flag a risk when answered
affirmatively, while Q7-Q12/Q14/Q15 are attestations that MUST be affirmative.
A regression that collapsed the two would let somebody tick "I am not in a
position of impartiality" and be recorded as compliant.
"""

import pytest

from plane.db.models import DEFAULT_IMPARTIALITY_QUESTIONNAIRE, InspectionQuestionCategory
from plane.utils.inspection_questionnaire import evaluate_answers


def _clean_answers(**overrides):
    """A fully compliant submission: every conflict question answered False,
    every attestation answered True. Overrides are applied on top."""
    answers = {}
    for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE:
        if "required_value" in question:
            answers[question["key"]] = question["required_value"]
        elif "conflict_if" in question:
            answers[question["key"]] = not question["conflict_if"]
        else:
            answers[question["key"]] = False
    answers.update(overrides)
    return answers


@pytest.mark.unit
class TestShippedQuestionnaireShape:
    """Guards on the shipped constant itself - it is the legal form."""

    def test_has_fifteen_questions_numbered_one_to_fifteen(self):
        assert len(DEFAULT_IMPARTIALITY_QUESTIONNAIRE) == 15
        assert [q["number"] for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE] == list(range(1, 16))

    def test_keys_are_unique(self):
        keys = [q["key"] for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE]
        assert len(set(keys)) == len(keys)

    def test_every_question_carries_exactly_one_polarity(self):
        """A question is either a conflict disclosure or an attestation. Both at
        once, or neither, means the evaluator cannot say what the answer implies."""
        for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE:
            polarities = [k for k in ("conflict_if", "required_value") if k in question]
            assert len(polarities) == 1, f"{question['key']} has polarities {polarities}"

    def test_all_five_categories_are_represented(self):
        categories = {q["category"] for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE}
        assert categories == {c.value for c in InspectionQuestionCategory}

    def test_answer_styles_match_the_issued_form(self):
        """The form alternates Oui/Non and Vrai/Faux; the record must show the
        wording the signer saw. Q8, Q14 and Q15 are the Vrai/Faux ones."""
        by_number = {q["number"]: q for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE}
        assert {n for n, q in by_number.items() if q["answer_style"] == "TRUE_FALSE"} == {8, 14, 15}

    def test_every_question_is_required(self):
        assert all(q["required"] for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE)

    def test_q12_stays_in_the_form_despite_the_charter_being_separately_signable(self):
        """The ethics charter is now its own signable document
        (`InspectionDocumentKind.ETHICS_CHARTER`), but the issued form is the
        business's document - a question is not dropped from it for technical
        convenience. The two are complementary: this is a self-declaration, the
        charter signature is the evidence."""
        by_number = {q["number"]: q for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE}

        assert by_number[12]["key"] == "accepted_ethics_charter"
        assert by_number[12]["required_value"] is True


@pytest.mark.unit
class TestCleanSubmission:
    def test_fully_compliant_answers_need_no_review(self):
        result = evaluate_answers(DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers())

        assert result.is_complete is True
        assert result.conflicts == ()
        assert result.failed_attestations == ()
        assert result.declared_conflicts is False
        assert result.requires_review is False
        assert len(result.cleaned) == 15


@pytest.mark.unit
class TestConflictDisclosures:
    def test_holding_tokens_is_a_disclosed_conflict(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(financial_interest=True)
        )

        assert result.is_complete is True, "a disclosure is recordable, not a validation error"
        assert result.conflicts == ("financial_interest",)
        assert result.declared_conflicts is True
        assert result.requires_review is True

    def test_known_personal_bias_is_a_disclosed_conflict(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(known_personal_bias=True)
        )

        assert result.conflicts == ("known_personal_bias",)

    def test_several_disclosures_are_all_reported(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE,
            _clean_answers(
                financial_interest=True, team_relationships=True, competing_project=True
            ),
        )

        assert set(result.conflicts) == {
            "financial_interest",
            "team_relationships",
            "competing_project",
        }

    def test_answering_no_to_a_conflict_question_is_not_a_conflict(self):
        """The inverse of the polarity bug: "no, I hold no tokens" must not flag."""
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(financial_interest=False)
        )

        assert result.conflicts == ()


@pytest.mark.unit
class TestFailedAttestations:
    def test_denying_impartiality_is_recorded_not_rejected(self):
        """Q15 answered False contradicts the declaration - but discarding the
        submission would discard the disclosure. See the module docstring."""
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(attests_impartiality=False)
        )

        assert result.is_complete is True
        assert result.failed_attestations == ("attests_impartiality",)
        assert result.declared_conflicts is True
        assert result.requires_review is True

    def test_declaring_external_pressure_is_a_failed_attestation(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(free_from_pressure=False)
        )

        assert result.failed_attestations == ("free_from_pressure",)

    def test_refusing_peer_review_is_a_failed_attestation(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(accepts_peer_review=False)
        )

        assert result.failed_attestations == ("accepts_peer_review",)

    def test_attestation_answered_correctly_does_not_flag(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(attests_impartiality=True)
        )

        assert result.failed_attestations == ()

    def test_conflicts_and_failed_attestations_are_reported_separately(self):
        """They mean different things to the reviewing manager and must not be
        merged into one bucket."""
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE,
            _clean_answers(financial_interest=True, answered_honestly=False),
        )

        assert result.conflicts == ("financial_interest",)
        assert result.failed_attestations == ("answered_honestly",)


@pytest.mark.unit
class TestIncompleteAndMalformedSubmissions:
    def test_unanswered_required_question_is_missing(self):
        answers = _clean_answers()
        del answers["attests_impartiality"]

        result = evaluate_answers(DEFAULT_IMPARTIALITY_QUESTIONNAIRE, answers)

        assert result.missing == ("attests_impartiality",)
        assert result.is_complete is False

    def test_null_answer_counts_as_missing(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(financial_interest=None)
        )

        assert result.missing == ("financial_interest",)

    def test_empty_submission_reports_every_question_missing(self):
        result = evaluate_answers(DEFAULT_IMPARTIALITY_QUESTIONNAIRE, {})

        assert len(result.missing) == 15
        assert result.is_complete is False

    def test_string_is_not_accepted_for_a_boolean_question(self):
        """Truthy-string coercion on a legal declaration would make the string
        "False" read as an affirmative answer."""
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(financial_interest="False")
        )

        assert result.invalid == ("financial_interest",)
        assert result.is_complete is False
        assert "financial_interest" not in result.cleaned

    def test_unknown_answer_key_is_reported_not_silently_dropped(self):
        result = evaluate_answers(
            DEFAULT_IMPARTIALITY_QUESTIONNAIRE, _clean_answers(not_a_question=True)
        )

        assert result.invalid == ("not_a_question",)
        assert "not_a_question" not in result.cleaned

    def test_non_dict_answers_are_tolerated(self):
        result = evaluate_answers(DEFAULT_IMPARTIALITY_QUESTIONNAIRE, None)

        assert result.is_complete is False
        assert len(result.missing) == 15

    def test_empty_schema_yields_an_empty_clean_verdict(self):
        result = evaluate_answers([], {})

        assert result.is_complete is True
        assert result.requires_review is False

    def test_malformed_schema_entry_is_skipped_without_blaming_the_signer(self):
        result = evaluate_answers([{"label": "no key here", "required": True}], {})

        assert result.missing == ()
        assert result.invalid == ()
        assert result.is_complete is True


@pytest.mark.unit
class TestFreeTextQuestions:
    """`type: "text"` is not in the shipped form but the schema supports it, and
    the per-question free-text fields §4.1 asks for will use it."""

    SCHEMA = [
        {"key": "flag", "type": "boolean", "required": True, "conflict_if": True},
        {"key": "details", "type": "text", "required": False},
    ]

    def test_text_answer_is_kept(self):
        result = evaluate_answers(self.SCHEMA, {"flag": True, "details": "Audited them in 2024"})

        assert result.cleaned["details"] == "Audited them in 2024"
        assert result.conflicts == ("flag",)

    def test_optional_text_may_be_omitted(self):
        result = evaluate_answers(self.SCHEMA, {"flag": False})

        assert result.is_complete is True

    def test_required_text_left_empty_is_missing(self):
        schema = [{"key": "details", "type": "text", "required": True}]

        result = evaluate_answers(schema, {"details": ""})

        assert result.missing == ("details",)

    def test_non_string_text_answer_is_invalid(self):
        result = evaluate_answers(self.SCHEMA, {"flag": False, "details": 42})

        assert result.invalid == ("details",)
