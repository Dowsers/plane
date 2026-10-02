# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The downloadable evidentiary PDF (`plane.utils.inspection_pdf`).

`TestNothingIsDropped` is the load-bearing class, for the same reason as its
frontend counterpart: this file exists to reproduce a signed undertaking, and a
PDF that silently omitted a clause would be worse than an ugly one. Text is
extracted with pypdf rather than trusting that the builder ran without raising.

No database: the builder only reads attributes, so plain namespaces are enough
and the tests stay fast.
"""

from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace

import pytest
from pypdf import PdfReader

from plane.db.models import DEFAULT_IMPARTIALITY_QUESTIONNAIRE
from plane.utils.inspection_pdf import build_signature_pdf, signature_pdf_filename

CHARTER = """# Charte éthique des évaluateurs Dowsers

## Article 1 – Préambule et objet

La présente charte fixe les règles **de conduite** que chaque évaluateur s'engage
à respecter lorsqu'il réalise une évaluation.

## Article 3 – Principes fondamentaux

| Principe | Ce que l'évaluateur s'engage à faire |
| --- | --- |
| Intégrité | Agir avec honnêteté, ne jamais falsifier un constat. |
| Impartialité | Traiter chaque organisation selon les mêmes critères. |

## Article 2 – Champ d'application

- salariés, en CDI, CDD ou alternance ;
- évaluateurs indépendants, consultants et sous-traitants.

## Article 10 – Signalement

1. Le signalement est adressé au référent éthique.
2. Il peut aussi être adressé à la direction.

---

Je soussigné(e), déclare avoir reçu, lu et compris la présente charte éthique.
"""


def _clean_answers():
    return {
        question["key"]: (question["required_value"] if "required_value" in question else not question["conflict_if"])
        for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE
    }


def _signature(**overrides):
    version = SimpleNamespace(
        version=overrides.pop("version", 3),
        body=overrides.pop("body", CHARTER),
        questionnaire_schema=overrides.pop("schema", [dict(q) for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE]),
    )
    defaults = {
        "kind": "IMPARTIALITY",
        "template_version": version,
        "project": SimpleNamespace(name="Dev interne", identifier="INSP"),
        "signature_name_snapshot": "ANES Quentin",
        "signer_email_snapshot": "quentin.anes@dowsers.finance",
        "signed_at": datetime(2026, 10, 1, 15, 33, tzinfo=dt_timezone.utc),
        "ip_address": "198.51.100.10",
        "document_checksum": "a" * 64,
        "questionnaire_answers": _clean_answers(),
        "review_status": "NOT_REQUIRED",
        "risk_level": None,
        "mitigation_measures": "",
        "reviewed_by_id": None,
        "reviewed_by": None,
        "reviewed_at": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _text(pdf_bytes: bytes) -> str:
    reader = PdfReader_from_bytes(pdf_bytes)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def PdfReader_from_bytes(pdf_bytes: bytes) -> PdfReader:
    from io import BytesIO

    return PdfReader(BytesIO(pdf_bytes))


@pytest.mark.unit
class TestItIsAPdf:
    def test_produces_a_valid_pdf(self):
        pdf = build_signature_pdf(_signature(), language="fr")

        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 1000

    def test_filename_carries_project_kind_version_and_date(self):
        assert signature_pdf_filename(_signature()) == "INSP-impartiality-v3-20261001.pdf"

    def test_filename_survives_a_missing_project_identifier(self):
        signature = _signature()
        signature.project = SimpleNamespace(name="x", identifier="")
        assert signature_pdf_filename(signature).endswith(".pdf")


@pytest.mark.unit
class TestNothingIsDropped:
    def test_every_part_of_the_charter_survives(self):
        text = _text(build_signature_pdf(_signature(), language="fr"))

        for fragment in [
            "Charte éthique des évaluateurs Dowsers",
            "Article 1",
            "La présente charte fixe les règles",
            "Principe",
            "Intégrité",
            "Agir avec honnêteté",
            "salariés, en CDI, CDD ou alternance",
            "Le signalement est adressé au référent éthique",
            "Je soussigné(e)",
        ]:
            assert fragment in text, f"missing from the PDF: {fragment}"

    def test_markdown_syntax_does_not_leak_into_the_pdf(self):
        text = _text(build_signature_pdf(_signature(), language="fr"))

        assert "##" not in text
        assert "**" not in text
        # Table pipes become cell borders, not characters.
        assert "| Principe |" not in text

    def test_an_unrecognised_construct_is_still_rendered(self):
        text = _text(build_signature_pdf(_signature(body="> une citation importante"), language="fr"))

        assert "une citation importante" in text

    def test_an_empty_body_still_produces_the_evidence(self):
        pdf = build_signature_pdf(_signature(body="", schema=[]), language="fr")

        assert "Preuve de signature" in _text(pdf)

    def test_a_body_containing_markup_is_escaped_not_interpreted(self):
        text = _text(build_signature_pdf(_signature(body="<b>gras</b> et <script>x</script>"), language="fr"))

        assert "<b>gras</b>" in text or "gras" in text
        assert "script" in text


@pytest.mark.unit
class TestEvidenceBlock:
    def test_carries_who_when_where_and_the_checksum(self):
        text = _text(build_signature_pdf(_signature(), language="fr"))

        assert "Preuve de signature" in text
        assert "ANES Quentin" in text
        assert "quentin.anes@dowsers.finance" in text
        assert "2026-10-01" in text
        assert "198.51.100.10" in text
        assert "a" * 32 in text  # the checksum, wrapped across lines by the layout

    def test_questionnaire_answers_are_included_with_their_wording(self):
        text = _text(build_signature_pdf(_signature(), language="fr"))

        assert "Réponses au questionnaire" in text
        # Verbatim question wording, not a key.
        assert "investissements financiers" in text
        assert "financial_interest" not in text

    def test_the_review_verdict_is_included_when_there_is_one(self):
        signature = _signature(
            review_status="ACCEPTED_WITH_MEASURES",
            risk_level="MEDIUM",
            mitigation_measures="Second évaluateur indépendant.",
            reviewed_by_id=1,
            reviewed_by=SimpleNamespace(email="resp@dowsers.finance"),
            reviewed_at=datetime(2026, 10, 2, 9, 0, tzinfo=dt_timezone.utc),
        )

        text = _text(build_signature_pdf(signature, language="fr"))

        assert "Revue managériale" in text
        assert "Accepté avec mesures" in text
        assert "Moyen" in text
        assert "Second évaluateur indépendant." in text
        assert "resp@dowsers.finance" in text

    def test_no_review_section_when_none_is_required(self):
        text = _text(build_signature_pdf(_signature(review_status="NOT_REQUIRED"), language="fr"))

        assert "Revue managériale" not in text


@pytest.mark.unit
class TestLanguage:
    def test_labels_follow_the_reader_language(self):
        french = _text(build_signature_pdf(_signature(), language="fr"))
        english = _text(build_signature_pdf(_signature(), language="en"))

        assert "Preuve de signature" in french
        assert "Signature evidence" in english

    def test_an_unknown_language_falls_back_to_english(self):
        text = _text(build_signature_pdf(_signature(), language="xx-YY"))

        assert "Signature evidence" in text

    def test_the_document_text_is_never_translated(self):
        """The whole point of the artefact: labels localise, the undertaking does
        not. A translated clause is a different clause."""
        english = _text(build_signature_pdf(_signature(), language="en"))

        assert "Signature evidence" in english
        # The French charter body is reproduced as-is even for an English reader.
        assert "Charte éthique des évaluateurs Dowsers" in english
        assert "Agir avec honnêteté" in english

    def test_it_says_in_the_pdf_that_the_text_is_not_translated(self):
        # So nobody mistakes the localised chrome for a translation of the
        # undertaking itself.
        text = _text(build_signature_pdf(_signature(), language="en"))

        assert "never translated" in text
