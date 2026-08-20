/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import type { IPragmaticPayloadLocation, InstructionType, TDropTarget } from "@plane/types";

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - drag & drop helpers
 * for the Collections/pages tree (exigence 5/9). Generalizes the same
 * `@atlaskit/pragmatic-drag-and-drop` instruction-resolution pattern
 * already used for the (single-level) Favorites folder tree
 * (`apps/web/core/components/workspace/sidebar/favorites/favorites.helpers.ts`)
 * to an arbitrary-depth tree with two distinct draggable kinds
 * (Collections and pages).
 */
export type TWikiDragKind = "collection" | "page";

export type TWikiDragData = {
  id: string;
  kind: TWikiDragKind;
};

export type TWikiDropTargetData = TWikiDragData & {
  isLastChild: boolean;
};

export const getWikiInstructionFromPayload = (
  dropTarget: TDropTarget,
  source: TDropTarget,
  location: IPragmaticPayloadLocation
): InstructionType | undefined => {
  const dropTargetData = dropTarget?.data as TWikiDropTargetData | undefined;
  const sourceData = source?.data as TWikiDragData | undefined;
  const allDropTargets = location?.current?.dropTargets;

  if (!dropTargetData || !sourceData) return undefined;

  // Dragging over a Collection's whole row (and, transitively, one of its
  // nested drop targets at the same time) means "file this into the
  // Collection" - mirrors the Favorites folder tree's own `isGroup` check.
  if (allDropTargets?.length > 1 && dropTargetData.kind === "collection") return "make-child";

  let instruction = extractInstruction(dropTargetData)?.type;

  if (instruction === "instruction-blocked") {
    instruction = dropTargetData.isLastChild ? "reorder-below" : "reorder-above";
  }

  // A page can never contain children - a drop target that IS a page
  // never resolves to "make-child", regardless of what's being dragged.
  if (instruction === "make-child" && dropTargetData.kind === "page") instruction = "reorder-above";

  return instruction;
};

export const getWikiCanDrop = (source: TDropTarget, targetId: string | undefined) => {
  const sourceData = source?.data as TWikiDragData | undefined;
  if (!sourceData || !targetId) return false;
  // an item cannot be dropped onto itself
  if (sourceData.id === targetId) return false;
  return true;
};
