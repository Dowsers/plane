/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

// Category 14, feature 14c (docs/feature-specs/14-pricing-gap-remediation.md
// in plane-selfhost, "Page Templates") - direct equivalent of
// IProjectTemplateListItem/IProjectTemplate for Pages.

export interface IPageTemplateListItem {
  id: string;
  workspace_id: string;
  name: string;
  logo_props: TLogoProps;
  usage_count: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface IPageTemplate extends IPageTemplateListItem {
  description_html: string;
  description_json: object;
}

export type TCreatePageTemplatePayload = {
  name: string;
  description_html?: string;
  description_json?: object;
  logo_props?: TLogoProps;
};

export type TSaveAsPageTemplatePayload = {
  name?: string;
};

export type TCreatePageFromTemplatePayload = {
  name: string;
  project_id?: string;
  teamspace_id?: string;
  is_global?: boolean;
  collection_id?: string;
};
