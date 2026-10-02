# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Builds the downloadable PDF copy of a signed inspection document
(ISO/IEC 17020 §4.1/§4.2).

This is the artefact an accreditation assessor asks to see, so it carries two
parts: the document text EXACTLY as signed, and an evidence block naming who
signed it, when, from where, and against which checksum. For an impartiality
declaration it also carries the questionnaire answers and the managerial verdict,
because §4.1 asks for a risk analysis and the analysis is part of the record.

## The text is never translated

Only the surrounding labels follow the reader's language
(`plane.utils.inspection_i18n`). The document body and the question wording are
reproduced verbatim: a translated clause is a different clause, and this file's
whole purpose is to reproduce what was accepted. The PDF says so in as many
words, so nobody mistakes the English or French chrome for a translation of the
undertaking itself.

## Markdown

Bodies are authored in Markdown (the ethics charter has headings, lists and
tables). This renders the same subset the web signing screen does - see
`apps/web/core/components/inspection/document-body.tsx` - and, like it, never
drops an unrecognised line: it falls through to a plain paragraph. A PDF that
silently omitted a clause of a signed undertaking would be worse than an ugly
one.
"""

import html
import re
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from plane.utils.inspection_i18n import translate

_INLINE = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)")


def _inline(text: str) -> str:
    """Markdown emphasis to reportlab's mini-HTML. Escapes first, so a body
    containing `<b>` or `&` renders as those characters rather than as markup."""
    escaped = html.escape(text or "", quote=False)

    def repl(match):
        token = match.group(0)
        if token.startswith("**"):
            return f"<b>{token[2:-2]}</b>"
        if token.startswith("`"):
            return f"<font face='Courier'>{token[1:-1]}</font>"
        return f"<i>{token[1:-1]}</i>"

    return _INLINE.sub(repl, escaped)


def _is_table_separator(line: str) -> bool:
    return bool(re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", line)) and "-" in line


def _split_row(line: str) -> list:
    return [cell.strip() for cell in re.sub(r"^\s*\|", "", re.sub(r"\|\s*$", "", line)).split("|")]


def _styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("insp_h1", parent=base["Heading1"], fontSize=15, spaceAfter=6),
        "h2": ParagraphStyle("insp_h2", parent=base["Heading2"], fontSize=12, spaceBefore=10, spaceAfter=4),
        "h3": ParagraphStyle("insp_h3", parent=base["Heading3"], fontSize=10.5, spaceBefore=8, spaceAfter=3),
        "body": ParagraphStyle(
            "insp_body", parent=base["BodyText"], fontSize=9.5, leading=13, alignment=TA_LEFT, spaceAfter=5
        ),
        "small": ParagraphStyle("insp_small", parent=base["BodyText"], fontSize=8, leading=11, textColor=colors.grey),
        "cell": ParagraphStyle("insp_cell", parent=base["BodyText"], fontSize=8, leading=10.5),
        "cellhead": ParagraphStyle(
            "insp_cellhead", parent=base["BodyText"], fontSize=8, leading=10.5, fontName="Helvetica-Bold"
        ),
    }


def _markdown_flowables(body: str, styles) -> list:
    """The same Markdown subset the web signing screen renders, as flowables."""
    lines = (body or "").split("\n")
    flowables = []
    index = 0

    while index < len(lines):
        stripped = lines[index].strip()

        if stripped == "":
            index += 1
            continue

        if re.match(r"^(-{3,}|_{3,}|\*{3,})$", stripped):
            flowables.append(HRFlowable(width="100%", color=colors.lightgrey, spaceBefore=6, spaceAfter=6))
            index += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            level = len(heading.group(1))
            style = styles["h1"] if level == 1 else styles["h2"] if level == 2 else styles["h3"]
            flowables.append(Paragraph(_inline(heading.group(2)), style))
            index += 1
            continue

        if "|" in stripped and index + 1 < len(lines) and _is_table_separator(lines[index + 1]):
            header = _split_row(stripped)
            rows = []
            cursor = index + 2
            while cursor < len(lines) and "|" in lines[cursor] and lines[cursor].strip() != "":
                rows.append(_split_row(lines[cursor]))
                cursor += 1
            width = max(len(header), *(len(row) for row in rows)) if rows else len(header)
            data = [
                [Paragraph(_inline(cell), styles["cellhead"]) for cell in (header + [""] * (width - len(header)))]
            ]
            for row in rows:
                data.append([Paragraph(_inline(cell), styles["cell"]) for cell in (row + [""] * (width - len(row)))])
            table = Table(data, colWidths=[(170 * mm) / width] * width, hAlign="LEFT")
            table.setStyle(
                TableStyle(
                    [
                        ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 4),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            flowables.extend([Spacer(1, 4), table, Spacer(1, 6)])
            index = cursor
            continue

        bullet = re.match(r"^[-*+]\s+(.*)$", stripped)
        numbered = re.match(r"^\d+[.)]\s+(.*)$", stripped)
        if bullet or numbered:
            ordered = bool(numbered)
            items = []
            cursor = index
            while cursor < len(lines):
                item = lines[cursor].strip()
                match = re.match(r"^\d+[.)]\s+(.*)$", item) if ordered else re.match(r"^[-*+]\s+(.*)$", item)
                if not match:
                    break
                items.append(ListItem(Paragraph(_inline(match.group(1)), styles["body"]), leftIndent=12))
                cursor += 1
            flowables.append(
                ListFlowable(items, bulletType="1" if ordered else "bullet", leftIndent=14, spaceAfter=5)
            )
            index = cursor
            continue

        # Plain paragraph: consecutive lines starting no other block. Anything
        # unrecognised lands here rather than being discarded.
        paragraph = []
        while index < len(lines):
            current = lines[index].strip()
            if (
                current == ""
                or re.match(r"^#{1,6}\s", current)
                or re.match(r"^(-{3,}|_{3,}|\*{3,})$", current)
                or re.match(r"^[-*+]\s", current)
                or re.match(r"^\d+[.)]\s", current)
                or ("|" in current and index + 1 < len(lines) and _is_table_separator(lines[index + 1]))
            ):
                break
            paragraph.append(current)
            index += 1
        flowables.append(Paragraph(_inline(" ".join(paragraph)), styles["body"]))

    return flowables


def _field_rows(pairs, styles) -> Table:
    data = [
        [
            Paragraph(f"<b>{html.escape(label)}</b>", styles["cell"]),
            Paragraph(html.escape(str(value)), styles["cell"]),
        ]
        for label, value in pairs
    ]
    table = Table(data, colWidths=[55 * mm, 115 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _answer_label(question, value, language) -> str:
    if isinstance(value, bool):
        if (question or {}).get("answer_style") == "TRUE_FALSE":
            return translate("answer.true" if value else "answer.false", language)
        return translate("answer.yes" if value else "answer.no", language)
    return str(value)


def build_signature_pdf(signature, language=None) -> bytes:
    """Render one `InspectionSignature` as a PDF.

    `signature` must have `template_version`, `project` and `member` available;
    the caller is expected to have `select_related` them.
    """
    version = signature.template_version
    schema = version.questionnaire_schema or []
    by_key = {question.get("key"): question for question in schema if isinstance(question, dict)}

    styles = _styles()
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=translate(f"kind.{signature.kind}", language),
        author="Plane",
    )

    story = [
        Paragraph(html.escape(translate(f"kind.{signature.kind}", language)), styles["h1"]),
        Paragraph(html.escape(translate("pdf.not_translated", language)), styles["small"]),
        Spacer(1, 8),
        HRFlowable(width="100%", color=colors.lightgrey, spaceAfter=10),
    ]

    story.extend(_markdown_flowables(version.body, styles))

    # Evidence on its own page: it is the part an assessor reads, and keeping it
    # off the end of a long body makes it findable.
    story.append(PageBreak())
    story.append(Paragraph(html.escape(translate("pdf.evidence", language)), styles["h2"]))
    story.append(Spacer(1, 4))
    story.append(
        _field_rows(
            [
                (translate("pdf.project", language), getattr(signature.project, "name", "")),
                (translate("pdf.document", language), translate(f"kind.{signature.kind}", language)),
                (translate("pdf.version", language), version.version),
                (translate("pdf.typed_name", language), signature.signature_name_snapshot or ""),
                (translate("pdf.email", language), signature.signer_email_snapshot or ""),
                (
                    translate("pdf.signed_at", language),
                    signature.signed_at.strftime("%Y-%m-%d %H:%M:%S %Z") if signature.signed_at else "",
                ),
                (translate("pdf.ip", language), signature.ip_address or ""),
                (translate("pdf.checksum", language), signature.document_checksum or ""),
            ],
            styles,
        )
    )

    if schema and signature.questionnaire_answers:
        story.append(Spacer(1, 10))
        story.append(Paragraph(html.escape(translate("pdf.answers", language)), styles["h2"]))
        story.append(Spacer(1, 4))
        data = [
            [
                Paragraph(f"<b>{html.escape(translate('pdf.question', language))}</b>", styles["cell"]),
                Paragraph(f"<b>{html.escape(translate('pdf.answer', language))}</b>", styles["cell"]),
            ]
        ]
        # Ordered by the schema, not by the answers dict, so the record reads in
        # the same order the signer saw - and the question wording is verbatim.
        for question in schema:
            key = question.get("key")
            if key not in signature.questionnaire_answers:
                continue
            number = question.get("number")
            label = f"{number}. {question.get('label', key)}" if number else question.get("label", key)
            data.append(
                [
                    Paragraph(_inline(label), styles["cell"]),
                    Paragraph(
                        html.escape(_answer_label(by_key.get(key), signature.questionnaire_answers[key], language)),
                        styles["cell"],
                    ),
                ]
            )
        table = Table(data, colWidths=[135 * mm, 35 * mm], hAlign="LEFT", repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(table)

    if signature.review_status and signature.review_status != "NOT_REQUIRED":
        rows = [
            (
                translate("pdf.review_status", language),
                translate(f"review.{signature.review_status}", language),
            )
        ]
        if signature.risk_level:
            rows.append((translate("pdf.risk_level", language), translate(f"risk.{signature.risk_level}", language)))
        if signature.mitigation_measures:
            rows.append((translate("pdf.measures", language), signature.mitigation_measures))
        if signature.reviewed_by_id:
            rows.append((translate("pdf.reviewed_by", language), getattr(signature.reviewed_by, "email", "") or ""))
        if signature.reviewed_at:
            rows.append(
                (translate("pdf.reviewed_at", language), signature.reviewed_at.strftime("%Y-%m-%d %H:%M:%S %Z"))
            )
        story.append(
            KeepTogether(
                [
                    Spacer(1, 10),
                    Paragraph(html.escape(translate("pdf.review", language)), styles["h2"]),
                    Spacer(1, 4),
                    _field_rows(rows, styles),
                ]
            )
        )

    story.append(Spacer(1, 12))
    story.append(Paragraph(html.escape(translate("pdf.footer", language)), styles["small"]))

    document.build(story)
    return buffer.getvalue()


def signature_pdf_filename(signature) -> str:
    """A stable, filesystem-safe name. Carries the kind, version and date so a
    folder of downloads stays sortable without opening them."""
    kind = (signature.kind or "document").lower()
    date = signature.signed_at.strftime("%Y%m%d") if signature.signed_at else "undated"
    project = re.sub(r"[^a-zA-Z0-9]+", "-", getattr(signature.project, "identifier", "") or "project").strip("-")
    return f"{project or 'project'}-{kind}-v{signature.template_version.version}-{date}.pdf"
