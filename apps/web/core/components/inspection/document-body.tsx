/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

/**
 * Renders an inspection document's stored body (ISO/IEC 17020 §4.1/§4.2).
 *
 * These documents are real legal texts - the Dowsers ethics charter runs to
 * twelve articles with tables - and they are authored in Markdown into a plain
 * `TextField`. Printing that with `whitespace-pre-wrap` showed the raw syntax,
 * so this renders the subset a policy document actually uses.
 *
 * ## Why no Markdown library
 *
 * `react-markdown@8` is present but BROKEN in this tree: it expects
 * `mdast-util-to-hast@12`'s `all` export and the workspace resolves v13, which
 * removed it, so importing it throws. (The pre-existing, unused
 * `components/ui/markdown-to-component.tsx` has the same latent problem.)
 * Pinning a compatible pair meant either downgrading a hoisted transitive or
 * upgrading react-markdown across the monorepo - a disproportionate change for
 * one screen, and one that cannot be validated here.
 *
 * So this is a deliberate, small, dependency-free renderer. For a legal text
 * that is arguably the better trade anyway: the output is deterministic, fully
 * unit-tested, and builds React elements rather than ever touching
 * `dangerouslySetInnerHTML`, so a document body can never inject markup.
 *
 * ## The rule that matters: nothing is ever dropped
 *
 * This understands headings, paragraphs, bullet and numbered lists, GFM tables,
 * horizontal rules, and inline bold/italic/code. Anything it does not recognise
 * is emitted as literal text, never swallowed. A renderer that silently hid a
 * clause of a signed undertaking would be far worse than one that shows an
 * unstyled line, and `document_checksum` is computed over the stored source
 * regardless - presentation here never changes what was signed.
 */

type Props = {
  body: string;
  className?: string;
};

/** Inline bold / italic / code, applied in that order. Returns React nodes so
 * the output is structural, never interpolated HTML. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // `**bold**`, `*italic*` / `_italic_`, `` `code` `` - deliberately a single
  // pass so nesting degrades to literal text rather than mis-parsing.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match = pattern.exec(text);
  let index = 0;

  while (match !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-primary">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="bg-surface-3 font-mono text-xs rounded px-1 py-0.5">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
    index += 1;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : [text];
}

const splitRow = (line: string): string[] =>
  line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableSeparator = (line: string): boolean => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function InspectionDocumentBody(props: Props) {
  const { body, className } = props;
  const lines = (body ?? "").split("\n");
  const blocks: ReactNode[] = [];

  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    // Blank line: paragraph separator, nothing to emit.
    if (trimmed === "") {
      index += 1;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`b${key++}`} className="my-4 border-subtle" />);
      index += 1;
      continue;
    }

    // ATX heading, levels 1-4. Deeper levels render at the level-4 size rather
    // than being rejected.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `b${key}`);
      const sizes: Record<number, string> = {
        1: "text-lg font-semibold",
        2: "text-base font-semibold",
        3: "text-sm font-semibold",
      };
      blocks.push(
        <p key={`b${key++}`} className={cn("mt-4 mb-1 text-primary", sizes[level] ?? "text-sm font-medium")}>
          {content}
        </p>
      );
      index += 1;
      continue;
    }

    // GFM table: a header row, a separator row, then body rows.
    if (trimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].includes("|") && lines[cursor].trim() !== "") {
        rows.push(splitRow(lines[cursor]));
        cursor += 1;
      }
      blocks.push(
        // Index keys are correct here, unusually: this renders an IMMUTABLE
        // published document, so no row or cell is ever inserted, removed or
        // reordered - there is nothing for a stable identity to protect against,
        // and cell text is not unique enough to key on.
        <div key={`b${key++}`} className="my-3 overflow-x-auto rounded border border-subtle">
          <table className="text-xs w-full text-left">
            <thead>
              <tr className="bg-surface-3 border-b border-subtle">
                {header.map((cell, cellIndex) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <th key={cellIndex} className="px-2 py-1.5 font-medium text-secondary">
                    {renderInline(cell, `h${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={rowIndex} className="border-b border-subtle last:border-0">
                  {row.map((cell, cellIndex) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={cellIndex} className="px-2 py-1.5 align-top">
                      {renderInline(cell, `r${rowIndex}c${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      index = cursor;
      continue;
    }

    // Bullet or numbered list - consecutive items of the same family.
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: ReactNode[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const itemLine = lines[cursor].trim();
        const asBullet = /^[-*+]\s+(.*)$/.exec(itemLine);
        const asNumbered = /^\d+[.)]\s+(.*)$/.exec(itemLine);
        const match = ordered ? asNumbered : asBullet;
        if (!match) break;
        items.push(
          <li key={cursor} className="ml-1">
            {renderInline(match[1], `b${key}l${cursor}`)}
          </li>
        );
        cursor += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={`b${key++}`} className={cn("my-2 space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items}
        </ListTag>
      );
      index = cursor;
      continue;
    }

    // Plain paragraph: consecutive non-blank lines that start no other block.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (
        currentTrimmed === "" ||
        /^#{1,6}\s/.test(currentTrimmed) ||
        /^(-{3,}|_{3,}|\*{3,})$/.test(currentTrimmed) ||
        /^[-*+]\s/.test(currentTrimmed) ||
        /^\d+[.)]\s/.test(currentTrimmed) ||
        (currentTrimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
      ) {
        break;
      }
      paragraph.push(currentTrimmed);
      index += 1;
    }
    blocks.push(
      <p key={`b${key++}`} className="my-2 leading-relaxed">
        {renderInline(paragraph.join(" "), `b${key}`)}
      </p>
    );
  }

  return (
    <div className={cn("text-sm rounded border border-subtle bg-surface-2 p-4 text-secondary", className)}>
      {blocks}
    </div>
  );
}
