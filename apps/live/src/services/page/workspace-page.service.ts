/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AppError } from "@/lib/errors";
import { PageService } from "./extended.service";

interface WorkspacePageServiceParams {
  workspaceSlug: string | null;
  cookie: string | null;
  [key: string]: unknown;
}

/**
 * Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
 * in plane-selfhost), feature 4 - "Wiki workspace en GA". Sibling of
 * `ProjectPageService` for genuine workspace-level Pages (`Page.is_global
 * = True`, zero `ProjectPage` links) - only needs a `workspaceSlug` +
 * cookie, no `projectId`, since this document type has no project to
 * scope against by definition. `basePath` points at the new
 * `plane.app.views.page.workspace` endpoints on the Django side (e.g.
 * its description-fetch/update calls resolve to
 * `GET/PATCH /api/workspaces/<slug>/pages/<id>/description/`).
 */
export class WorkspacePageService extends PageService {
  protected basePath: string;

  constructor(params: WorkspacePageServiceParams) {
    super();
    const { workspaceSlug } = params;
    if (!workspaceSlug) throw new AppError("Missing required fields.");
    // validate cookie
    if (!params.cookie) throw new AppError("Cookie is required.");
    // set cookie
    this.setHeader("Cookie", params.cookie);
    // set base path
    this.basePath = `/api/workspaces/${workspaceSlug}`;
  }
}
