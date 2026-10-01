/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TInspectionDocumentKind, TInspectionMode, TInspectionRiskLevel } from "@plane/types";

/** i18n keys for the three documents. The DOCUMENT BODIES and the QUESTION
 * LABELS are never translated here - those come from the backend as stored data
 * and must be rendered verbatim, because an evidentiary record has to reproduce
 * exactly what the signer saw. Only the surrounding chrome is localised. */
export const INSPECTION_KIND_I18N: Record<TInspectionDocumentKind, string> = {
  IMPARTIALITY: "project_settings.inspection.kind.impartiality",
  CONFIDENTIALITY: "project_settings.inspection.kind.confidentiality",
  ETHICS_CHARTER: "project_settings.inspection.kind.ethics_charter",
};

export const INSPECTION_MODE_I18N: Record<TInspectionMode, string> = {
  MANUAL: "project_settings.inspection.mode.manual",
  SEMI_AUTOMATIC: "project_settings.inspection.mode.semi_automatic",
  FULLY_AUTOMATIC: "project_settings.inspection.mode.fully_automatic",
};

export const INSPECTION_RISK_I18N: Record<TInspectionRiskLevel, string> = {
  NONE: "project_settings.inspection.risk.none",
  LOW: "project_settings.inspection.risk.low",
  MEDIUM: "project_settings.inspection.risk.medium",
  HIGH: "project_settings.inspection.risk.high",
};

/** Display order of the questionnaire's five sections. Anything the backend
 * sends that is not listed here still renders, after these - the schema is
 * versioned data and may gain a section without a frontend release. */
export const INSPECTION_CATEGORY_ORDER = [
  "PERSONAL_CONFLICTS",
  "PROFESSIONAL_COMMITMENTS",
  "ANALYSIS_OBJECTIVITY",
  "ETHICAL_CONDUCT",
  "FINAL_DECLARATION",
] as const;

export const INSPECTION_CATEGORY_I18N: Record<string, string> = {
  PERSONAL_CONFLICTS: "project_settings.inspection.category.personal_conflicts",
  PROFESSIONAL_COMMITMENTS: "project_settings.inspection.category.professional_commitments",
  ANALYSIS_OBJECTIVITY: "project_settings.inspection.category.analysis_objectivity",
  ETHICAL_CONDUCT: "project_settings.inspection.category.ethical_conduct",
  FINAL_DECLARATION: "project_settings.inspection.category.final_declaration",
};
