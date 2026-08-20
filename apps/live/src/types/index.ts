/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { fetchPayload, onLoadDocumentPayload, storePayload } from "@hocuspocus/server";

export type TConvertDocumentRequestBody = {
  description_html: string;
  variant: "rich" | "document";
};

export interface OnLoadDocumentPayloadWithContext extends onLoadDocumentPayload {
  context: HocusPocusServerContext;
}

export interface FetchPayloadWithContext extends fetchPayload {
  context: HocusPocusServerContext;
}

export interface StorePayloadWithContext extends storePayload {
  context: HocusPocusServerContext;
}

// Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
// in plane-selfhost), feature 4 - "Wiki workspace en GA". "workspace_page"
// is the real-time collaborative editing counterpart to the new
// workspace-scoped Page endpoints (`plane.app.views.page.workspace` on the
// Django side) - see `WorkspacePageService` (./services/page/workspace-page.service.ts)
// for the basePath it maps to.
export type TDocumentTypes = "project_page" | "workspace_page";

// Additional Hocuspocus types that are not exported from the main package
export type HocusPocusServerContext = {
  projectId: string | null;
  cookie: string;
  documentType: TDocumentTypes;
  workspaceSlug: string | null;
  userId: string;
};
