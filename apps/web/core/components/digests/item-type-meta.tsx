/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { AtSign, CheckCircle2, FilePlus2, Flag, ListChecks, PlayCircle, Repeat } from "lucide-react";
// plane imports
import type { TDigestItem, TDigestItemType } from "@plane/types";

/**
 * Category 9 (AI features, docs/feature-specs/09-ai-features.md in
 * plane-selfhost), feature 5 - "Digest periodique automatise". One icon per
 * `TDigestItemType` (7 real choices - see `DigestItemType`,
 * apps/api/plane/db/models/digest.py) for rendering a digest's item list,
 * plus a plain-text description builder that mirrors the backend's own
 * `_describe_item` (apps/api/plane/utils/digest_content.py) so the frontend
 * never has to invent its own phrasing from raw `payload` JSON.
 */
export const DIGEST_ITEM_TYPE_ICON: Record<TDigestItemType, ComponentType<{ className?: string }>> = {
  ISSUE_CREATED: FilePlus2,
  ISSUE_COMPLETED: CheckCircle2,
  ISSUE_STATE_CHANGED: Repeat,
  COMMENT_MENTION: AtSign,
  CYCLE_STARTED: PlayCircle,
  CYCLE_COMPLETED: Flag,
  CYCLE_SCOPE_CHANGED: ListChecks,
};

/** Stable display order - matches `_TYPE_ORDER`
 * (apps/api/plane/utils/digest_content.py). */
export const DIGEST_ITEM_TYPE_ORDER: TDigestItemType[] = [
  "ISSUE_CREATED",
  "ISSUE_COMPLETED",
  "ISSUE_STATE_CHANGED",
  "COMMENT_MENTION",
  "CYCLE_STARTED",
  "CYCLE_COMPLETED",
  "CYCLE_SCOPE_CHANGED",
];

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Mirrors `_describe_item` verbatim (same field names, same fallbacks) -
 * kept independent of `useTranslation()` since it's built from arbitrary
 * user-authored content (issue/cycle names, comment excerpts) that can't be
 * a translation key itself; only the surrounding chrome (section headers,
 * empty states) goes through `t()`. */
export function describeDigestItem(item: TDigestItem): string {
  const payload = (item.payload ?? {}) as Record<string, unknown>;

  switch (item.item_type) {
    case "ISSUE_CREATED":
      return `${asString(payload.issue_sequence)} ${asString(payload.issue_name)}`.trim();
    case "ISSUE_COMPLETED":
      return `${asString(payload.issue_name)} -> ${asString(payload.new_state)}`;
    case "ISSUE_STATE_CHANGED":
      return `${asString(payload.issue_name)}: ${asString(payload.old_state)} -> ${asString(payload.new_state)}`;
    case "COMMENT_MENTION":
      return `${asString(payload.issue_name)}: "${asString(payload.comment_excerpt)}"`;
    case "CYCLE_STARTED":
      return `Cycle "${asString(payload.cycle_name)}" started`;
    case "CYCLE_COMPLETED":
      return `Cycle "${asString(payload.cycle_name)}" completed`;
    case "CYCLE_SCOPE_CHANGED": {
      const verb = payload.change === "added" ? "added to" : "removed from";
      return `${asString(payload.issue_name)} ${verb} cycle "${asString(payload.cycle_name)}"`;
    }
    default:
      return "";
  }
}

/** Deep link for a digest item's referenced issue/cycle, reusing the
 * existing resolver routes (`:workspaceSlug/projects/:projectId/issues/:issueId`
 * redirects to the pretty `/browse/IDENTIFIER-SEQ` URL;
 * `:workspaceSlug/projects/:projectId/cycles/:cycleId` is the real cycle
 * page directly) - no extra issue/cycle fetch needed just to build the
 * link, unlike `generateWorkItemLink` which needs a project identifier +
 * sequence id that digest payloads don't always carry. */
export function getDigestItemLink(workspaceSlug: string, item: TDigestItem): string | null {
  if (item.issue) return `/${workspaceSlug}/projects/${item.project}/issues/${item.issue}`;
  if (item.cycle) return `/${workspaceSlug}/projects/${item.project}/cycles/${item.cycle}`;
  return null;
}
