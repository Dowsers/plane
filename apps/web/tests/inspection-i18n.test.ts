/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Every i18n key the inspection UI references must resolve in BOTH locales.
 *
 * A missing key does not throw - `t()` returns the key string, so the UI quietly
 * renders `project_settings.inspection.sign.submit` where a button label should
 * be. That is invisible to the type checker and to the linter, and it already
 * bit this feature twice (`common.refresh`, which does not exist at that path,
 * and an anchor mismatch that nearly dropped a whole block).
 *
 * Deliberately a source scan rather than a list maintained by hand: a list would
 * drift from the components the moment somebody adds a string.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
// The package's own public surface: `enTranslations` is re-exported directly,
// and every other language is reachable through the `locales` lazy-loader map.
// `vitest.config.ts` aliases `@plane/i18n` to its SOURCE, so this reads the
// working tree rather than the last build output.
import { enTranslations, locales } from "@plane/i18n";

const frTranslations = (await locales.fr.translations()).default;

/** Every locale the app ships, loaded once. */
const ALL_LOCALES: [string, unknown][] = await Promise.all(
  Object.keys(locales).map(async (code) => {
    const loader = (locales as Record<string, { translations: () => Promise<{ default: unknown }> }>)[code];
    return [code, (await loader.translations()).default] as [string, unknown];
  })
);

/** Key groups the EVALUATOR sees - banner, blocking screen, signing modal, their
 * own signed-documents page. These are translated into every locale, because the
 * evaluators are the broad population. The admin-only groups (config, workspace
 * document editor, compliance table, review) stay en/fr like the rest of the
 * admin surface, and fall back to English per key. */
const EVALUATOR_GROUPS = new Set(["kind", "answer", "category", "banner", "blocked", "sign", "risk"]);

const isEvaluatorKey = (key: string): boolean => {
  if (key.startsWith("inspection.my_signatures.")) return true;
  if (!key.startsWith("project_settings.inspection.")) return false;
  const group = key.slice("project_settings.inspection.".length).split(".")[0];
  return EVALUATOR_GROUPS.has(group);
};

const WEB_ROOT = path.resolve(__dirname, "..");

const SOURCES = [
  "core/components/inspection",
  "app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/inspection-documents",
  "app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/inspection",
];

const collectFiles = (relative: string): string[] => {
  const absolute = path.join(WEB_ROOT, relative);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? collectFiles(path.join(relative, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [path.join(absolute, entry.name)]
          : []
    );
};

const collectKeys = (): string[] => {
  const keys = new Set<string>();
  for (const source of SOURCES) {
    for (const file of collectFiles(source)) {
      const contents = fs.readFileSync(file, "utf8");
      // `t("some.key")` call sites.
      for (const match of contents.matchAll(/\bt\(\s*"([^"]+)"/g)) keys.add(match[1]);
      // Keys held in the constants maps rather than passed to t() inline.
      for (const match of contents.matchAll(/"((?:project_settings|workspace_settings|inspection)\.[\w.]+)"/g))
        keys.add(match[1]);
    }
  }
  // eslint-disable-next-line unicorn/no-array-sort
  return [...keys].sort();
};

const resolve = (tree: unknown, key: string): string | null => {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in (node as Record<string, unknown>))) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
};

/** Interpolation placeholders are ICU MessageFormat, i.e. SINGLE braces
 * (`{version}`) - see `packages/i18n/src/store` and pre-existing keys such as
 * `workspace_settings.page_label`. A placeholder dropped in one locale renders
 * literally to users of that language only. */
const placeholders = (value: string | null): string[] =>
  // eslint-disable-next-line unicorn/no-array-sort
  [...(value ?? "").matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const KEYS = collectKeys();

describe("inspection i18n keys", () => {
  it("finds keys to check at all (guards against a broken scan)", () => {
    // Without this, a regex that matches nothing would make every test below
    // pass vacuously.
    expect(KEYS.length).toBeGreaterThan(80);
  });

  it.each([
    ["en", enTranslations],
    ["fr", frTranslations],
  ])("every referenced key resolves in %s", (_locale, translations) => {
    const missing = KEYS.filter((key) => resolve(translations, key) === null);
    expect(missing, `missing translations: ${missing.join(", ")}`).toEqual([]);
  });

  it("no translation is left empty", () => {
    const empty = KEYS.filter(
      (key) => resolve(enTranslations, key)?.trim() === "" || resolve(frTranslations, key)?.trim() === ""
    );
    expect(empty).toEqual([]);
  });

  it("uses ICU single-brace placeholders, never double", () => {
    // The failure this catches, which shipped once: `{{version}}` makes the ICU
    // formatter throw, `t()` swallows it and returns the KEY, and the UI renders
    // `workspace_settings.settings.inspection_documents.publish` as a button
    // label. Invisible to tsc, to oxlint, and - until this test - to the
    // placeholder check above, which was written with the same wrong convention
    // in both locales and so validated the mistake instead of catching it.
    const offenders = KEYS.filter((key) =>
      [resolve(enTranslations, key), resolve(frTranslations, key)].some((value) => /\{\{/.test(value ?? ""))
    );
    expect(offenders, `double-brace placeholders: ${offenders.join(", ")}`).toEqual([]);
  });

  it("en and fr agree on interpolation placeholders", () => {
    const mismatched = KEYS.filter((key) => {
      const en = placeholders(resolve(enTranslations, key));
      const fr = placeholders(resolve(frTranslations, key));
      return JSON.stringify(en) !== JSON.stringify(fr);
    });
    expect(mismatched, `placeholder mismatch: ${mismatched.join(", ")}`).toEqual([]);
  });
});

describe("evaluator-facing keys in every locale", () => {
  /** The admin surface may fall back to English, but what an evaluator reads
   * while signing a legal undertaking should be in their own language. */
  const evaluatorKeys = KEYS.filter(isEvaluatorKey);

  it("finds the evaluator subset (guards against a broken filter)", () => {
    expect(evaluatorKeys.length).toBeGreaterThan(40);
  });

  it.each(ALL_LOCALES)("%s resolves every evaluator key", (_code, translations) => {
    const missing = evaluatorKeys.filter((key) => resolve(translations, key) === null);
    expect(missing, `missing: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(ALL_LOCALES)("%s uses single-brace placeholders", (_code, translations) => {
    const offenders = evaluatorKeys.filter((key) => /\{\{/.test(resolve(translations, key) ?? ""));
    expect(offenders, `double-brace: ${offenders.join(", ")}`).toEqual([]);
  });

  it.each(ALL_LOCALES)("%s keeps the same placeholders as English", (_code, translations) => {
    // A dropped `{days}` renders literally, and only for speakers of that one
    // language - exactly the kind of thing nobody notices in review.
    const mismatched = evaluatorKeys.filter(
      (key) =>
        JSON.stringify(placeholders(resolve(translations, key))) !==
        JSON.stringify(placeholders(resolve(enTranslations, key)))
    );
    expect(mismatched, `placeholder mismatch: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("English carries every key, evaluator or admin, since it is the fallback", () => {
    const missing = KEYS.filter((key) => resolve(enTranslations, key) === null);
    expect(missing, `missing from the fallback locale: ${missing.join(", ")}`).toEqual([]);
  });
});
