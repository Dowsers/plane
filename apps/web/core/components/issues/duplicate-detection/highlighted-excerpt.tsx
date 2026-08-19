/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Small shared
 * presentational piece - renders a candidate excerpt with its
 * `highlighted_terms` (exigence 4's "termes/n-grammes recouvrants
 * surlignes") bolded inline. Used by both the creation-modal live banner
 * (`issue-modal/duplicate-check`) and the existing-issue "Doublons
 * suggeres" section (`issue-detail-widgets/relations/duplicate-suggestions`)
 * - the only genuinely shared piece between the two surfaces, since
 * everything else about them (data source, available actions) differs.
 *
 * Deliberately a plain case-insensitive whole-word split, not a real
 * tokenizer - `highlighted_terms` is already a short, stopword-filtered
 * list from the backend (`build_duplicate_explanation`), so a simple regex
 * is "good enough" here, matching this fork's own stated preference for
 * lightweight client-side text handling over pulling in a highlighting
 * library for one small feature.
 */
type Props = {
  text: string;
  terms: string[];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function HighlightedExcerpt(props: Props) {
  const { text, terms } = props;

  if (!text) return null;
  const meaningfulTerms = terms.filter((term) => term.trim().length > 0);
  if (meaningfulTerms.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${meaningfulTerms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  const lowerTermSet = new Set(meaningfulTerms.map((term) => term.toLowerCase()));

  return (
    <>
      {parts.map((part, index) =>
        lowerTermSet.has(part.toLowerCase()) ? (
          // eslint-disable-next-line react/no-array-index-key
          <mark key={index} className="rounded-sm bg-accent-primary/20 px-0.5 text-primary">
            {part}
          </mark>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}
