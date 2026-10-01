/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Static guards over the settings-tab registries.
 *
 * Registering a settings tab in this codebase takes FOUR coordinated edits (the
 * `TProjectSettingsTabs`/`TWorkspaceSettingsTabs` union, the `*_SETTINGS` entry,
 * the `GROUPED_*_SETTINGS` map, and the `*_SETTINGS_ICONS` record). Only the
 * union and the icon record are enforced by the type checker; the other two fail
 * silently - a tab missing from the grouped map simply never renders, and a
 * wrong `highlight` path just never lights up.
 *
 * Both of those actually happened while building the inspection tabs: the
 * workspace entry shipped with a `highlight` pointing at `/settings/security/`,
 * copied from the neighbouring entry. These tests exist so the next person does
 * not have to notice that by eye.
 */
import { describe, expect, it } from "vitest";
import {
  GROUPED_PROJECT_SETTINGS,
  GROUPED_WORKSPACE_SETTINGS,
  PROJECT_SETTINGS,
  WORKSPACE_SETTINGS,
} from "@plane/constants";
import fs from "fs";
import path from "path";

/** The icon records are read as SOURCE rather than imported: importing them pulls
 * in `@/components/icons/attachment`, which imports PNGs via Vite's `?url`
 * suffix and cannot resolve outside a Vite browser pipeline. Parsing the record's
 * keys is enough for what this guards - that no tab is missing an icon. */
const iconKeys = (relative: string): Set<string> => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
  const body = source.slice(source.indexOf("_SETTINGS_ICONS"), source.lastIndexOf("};"));
  return new Set([...body.matchAll(/^\s{2}"?([\w-]+)"?:/gm)].map((match) => match[1]));
};

const PROJECT_SETTINGS_ICONS = iconKeys("core/components/settings/project/sidebar/item-icon.tsx");
const WORKSPACE_SETTINGS_ICONS = iconKeys("core/components/settings/workspace/sidebar/item-icon.tsx");

const flatten = (grouped: object): { key: string }[] => Object.values(grouped).flat() as { key: string }[];

describe.each([
  ["project", PROJECT_SETTINGS, GROUPED_PROJECT_SETTINGS, PROJECT_SETTINGS_ICONS] as const,
  ["workspace", WORKSPACE_SETTINGS, GROUPED_WORKSPACE_SETTINGS, WORKSPACE_SETTINGS_ICONS] as const,
])("%s settings registry", (_scope, settings, grouped, icons) => {
  const entries = Object.values(settings) as { key: string; href: string; highlight: Function }[];

  it("every entry appears in the grouped map", () => {
    // A tab absent from the grouped map renders nowhere, with no error.
    const groupedKeys = new Set(flatten(grouped).map((item) => item.key));
    const missing = entries.map((entry) => entry.key).filter((key) => !groupedKeys.has(key));
    expect(missing, `not reachable in the sidebar: ${missing.join(", ")}`).toEqual([]);
  });

  it("every entry has an icon", () => {
    const missing = entries.map((entry) => entry.key).filter((key) => !(icons as Set<string>).has(key));
    expect(missing).toEqual([]);
  });

  it("every entry's highlight path matches its own href", () => {
    // The failure this catches: a highlight copied from a sibling entry, which
    // leaves the tab permanently un-highlighted.
    const mismatched = entries
      .filter((entry) => {
        const base = "/BASE";
        const highlighted = entry.highlight(`${base}${entry.href}/`, base);
        return highlighted !== true;
      })
      .map((entry) => entry.key);
    expect(mismatched, `highlight does not match href: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("keys are unique and match their map key", () => {
    for (const [mapKey, entry] of Object.entries(settings)) {
      expect((entry as { key: string }).key).toBe(mapKey);
    }
  });
});

describe("inspection tabs are registered", () => {
  it("registers the project Inspection tab", () => {
    expect(PROJECT_SETTINGS.inspection?.href).toBe("/inspection");
    expect(flatten(GROUPED_PROJECT_SETTINGS).some((item) => item.key === "inspection")).toBe(true);
  });

  it("registers the workspace Inspection documents tab", () => {
    expect(WORKSPACE_SETTINGS["inspection-documents"]?.href).toBe("/settings/inspection-documents");
    expect(
      flatten(GROUPED_WORKSPACE_SETTINGS).some((item) => (item as { key: string }).key === "inspection-documents")
    ).toBe(true);
  });
});
