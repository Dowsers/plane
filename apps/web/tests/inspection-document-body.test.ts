/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * `InspectionDocumentBody` - the dependency-free Markdown renderer for inspection
 * document bodies (ISO/IEC 17020 §4.1/§4.2).
 *
 * Rendered to static markup with `react-dom/server` rather than with a DOM
 * testing library, because the repo carries neither jsdom nor @testing-library
 * and the assertions here are about structure, not interaction.
 *
 * The load-bearing test is `TestNothingIsDropped`: these are legal texts, and a
 * renderer that silently hid a clause of a signed undertaking would be far worse
 * than one that shows an unstyled line.
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InspectionDocumentBody } from "@/components/inspection/document-body";

const render = (body: string): string => renderToStaticMarkup(React.createElement(InspectionDocumentBody, { body }));

/** Visible text only, with markup stripped - what a reader actually sees. */
const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();

describe("block structure", () => {
  it("renders headings by level", () => {
    const html = render("# Charte\n\n## Article 1\n\n### Détail");
    expect(textOf(html)).toContain("Charte");
    expect(textOf(html)).toContain("Article 1");
    expect(textOf(html)).toContain("Détail");
    // Headings must not survive as literal hashes.
    expect(textOf(html)).not.toContain("#");
  });

  it("renders a GFM table as a real table", () => {
    const html = render("| Principe | Engagement |\n| --- | --- |\n| Intégrité | Ne rien dissimuler |");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(textOf(html)).toContain("Principe");
    expect(textOf(html)).toContain("Ne rien dissimuler");
    // No pipe characters left visible.
    expect(textOf(html)).not.toContain("|");
  });

  it("renders bullet lists", () => {
    const html = render("- salariés ;\n- indépendants ;\n- stagiaires.");
    expect(html).toContain("<ul");
    expect((html.match(/<li/g) ?? []).length).toBe(3);
    expect(textOf(html)).not.toMatch(/^-/);
  });

  it("renders numbered lists as ordered", () => {
    const html = render("1. Premier signalement\n2. Puis la direction\n3. Enfin accusé de réception");
    expect(html).toContain("<ol");
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });

  it("renders a horizontal rule", () => {
    expect(render("avant\n\n---\n\naprès")).toContain("<hr");
  });

  it("joins wrapped lines into one paragraph", () => {
    const html = render("La présente charte fixe\nles règles de conduite.");
    expect((html.match(/<p/g) ?? []).length).toBe(1);
    expect(textOf(html)).toBe("La présente charte fixe les règles de conduite.");
  });

  it("separates paragraphs on a blank line", () => {
    const html = render("Premier paragraphe.\n\nSecond paragraphe.");
    expect((html.match(/<p/g) ?? []).length).toBe(2);
  });
});

describe("inline formatting", () => {
  it("renders bold, italic and code", () => {
    const html = render("Un **engagement** en *toutes* circonstances via `cyber@dowsers.finance`");
    expect(html).toContain("<strong");
    expect(html).toContain("<em");
    expect(html).toContain("<code");
    expect(textOf(html)).toContain("engagement");
    expect(textOf(html)).not.toContain("**");
    expect(textOf(html)).not.toContain("`");
  });

  it("leaves an unmatched marker as literal text rather than eating the rest", () => {
    const html = render("Un astérisque * isolé ne casse rien");
    expect(textOf(html)).toBe("Un astérisque * isolé ne casse rien");
  });
});

describe("safety", () => {
  it("never emits raw markup from the document body", () => {
    // A body is authored by a workspace admin, but it must still be impossible
    // for it to inject markup - this renderer builds elements and never touches
    // dangerouslySetInnerHTML.
    const html = render("<script>alert(1)</script>\n\n<b>gras</b>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>gras</b>");
    expect(textOf(html)).toContain("alert(1)");
  });
});

describe("nothing is dropped", () => {
  /** The real charter, abridged but keeping one of every construct it uses. */
  const CHARTER = `# Charte éthique des évaluateurs Dowsers

## Article 1 – Préambule et objet

La présente charte fixe les règles de conduite que chaque évaluateur s'engage à respecter.

## Article 3 – Principes fondamentaux

| Principe | Ce que l'évaluateur s'engage à faire |
| --- | --- |
| Intégrité | Agir avec honnêteté, ne jamais falsifier un constat. |
| Impartialité | Traiter chaque organisation selon les mêmes critères. |

## Article 2 – Champ d'application

- salariés, en CDI, CDD ou alternance ;
- évaluateurs indépendants, consultants et sous-traitants ;
- stagiaires et évaluateurs en période d'observation.

## Article 10 – Signalement des manquements

1. Le signalement est adressé au référent éthique.
2. Il peut aussi être adressé à la direction.

---

Je soussigné(e), déclare avoir reçu, lu et compris la présente charte éthique.`;

  it("keeps every sentence of the charter visible", () => {
    const text = textOf(render(CHARTER));

    for (const fragment of [
      "Charte éthique des évaluateurs Dowsers",
      "Article 1 – Préambule et objet",
      "La présente charte fixe les règles de conduite",
      "Principe",
      "Intégrité",
      "Agir avec honnêteté, ne jamais falsifier un constat.",
      "Impartialité",
      "salariés, en CDI, CDD ou alternance",
      "stagiaires et évaluateurs en période d'observation",
      "Le signalement est adressé au référent éthique.",
      "Il peut aussi être adressé à la direction.",
      "Je soussigné(e), déclare avoir reçu, lu et compris",
    ]) {
      expect(text, `missing from the rendered charter: ${fragment}`).toContain(fragment);
    }
  });

  it("leaves no Markdown syntax visible in the charter", () => {
    const text = textOf(render(CHARTER));
    expect(text).not.toContain("|");
    expect(text).not.toContain("##");
    expect(text).not.toMatch(/(^| )- /);
  });

  it("renders an empty body as nothing rather than throwing", () => {
    expect(() => render("")).not.toThrow();
    expect(textOf(render(""))).toBe("");
  });

  it("preserves an unrecognised construct as readable text", () => {
    // Blockquotes and images are not handled; they must still be legible.
    const text = textOf(render("> une citation importante\n\n![schéma](a.png)"));
    expect(text).toContain("une citation importante");
    expect(text).toContain("schéma");
  });
});
