/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Inspection compliance (ISO/IEC 17020 §4.1 impartiality / §4.2
 * confidentiality). Backend: `plane.db.models.inspection` and
 * `plane.app.views.inspection`.
 */

export type TInspectionDocumentKind = "IMPARTIALITY" | "CONFIDENTIALITY" | "ETHICS_CHARTER";

export type TInspectionMode = "MANUAL" | "SEMI_AUTOMATIC" | "FULLY_AUTOMATIC";

export type TInspectionReviewStatus = "NOT_REQUIRED" | "PENDING" | "ACCEPTED" | "ACCEPTED_WITH_MEASURES" | "REJECTED";

export type TInspectionRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

/**
 * One question of a versioned questionnaire. `conflict_if` and
 * `required_value` are mutually exclusive and carry the POLARITY, which the
 * form must respect: the issued questionnaire is not uniformly "true is good".
 * Answering a `conflict_if` question that way discloses an impartiality risk;
 * answering a `required_value` question any other way contradicts the
 * declaration being signed. `answer_style` decides whether the control reads
 * Oui/Non or Vrai/Faux - an evidentiary record must show the wording the signer
 * actually saw.
 */
export type TInspectionQuestion = {
  key: string;
  number?: number;
  category?: string;
  label: string;
  type: "boolean" | "text";
  answer_style?: "YES_NO" | "TRUE_FALSE";
  required?: boolean;
  conflict_if?: boolean;
  required_value?: boolean;
};

export type TInspectionTemplateVersion = {
  id: string;
  template: string;
  version: number;
  body: string;
  asset: string | null;
  questionnaire_schema: TInspectionQuestion[];
  published_at: string | null;
  requires_resignature: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type TInspectionTemplate = {
  id: string;
  workspace: string;
  project: string | null;
  kind: TInspectionDocumentKind;
  name: string;
  scope: "WORKSPACE" | "PROJECT";
  versions: TInspectionTemplateVersion[];
  created_at: string;
  updated_at: string;
};

export type TInspectionSignature = {
  id: string;
  project: string;
  member: string;
  member_email: string | null;
  template_version: string;
  template_version_number: number;
  kind: TInspectionDocumentKind;
  signed_at: string;
  signature_name_snapshot: string;
  signer_email_snapshot: string;
  document_checksum: string;
  questionnaire_answers: Record<string, boolean | string>;
  declared_conflicts: boolean;
  review_status: TInspectionReviewStatus;
  risk_level: TInspectionRiskLevel | null;
  mitigation_measures: string;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_notes: string;
  created_at: string;
};

export type TProjectInspectionConfig = {
  is_inspection_enabled: boolean;
  inspection_mode: TInspectionMode;
  inspection_grace_period_days: number;
  inspection_enforcement_paused: boolean;
  inspection_review_manager: string | null;
  inspection_enabled_at: string | null;
};

export type TProjectInspectionConfigPayload = Partial<Omit<TProjectInspectionConfig, "inspection_enabled_at">>;

/** One document the current user owes (or has signed) on a project. */
export type TInspectionMyDocument = {
  kind: TInspectionDocumentKind;
  template_id: string;
  template_version_id: string;
  version: number;
  body: string;
  asset: string | null;
  questionnaire_schema: TInspectionQuestion[];
  signature: TInspectionSignature | null;
  obligation_started_at: string | null;
  blocked_since: string | null;
};

export type TProjectInspectionMe = {
  is_inspection_enabled: boolean;
  inspection_mode: TInspectionMode;
  inspection_grace_period_days: number;
  inspection_enforcement_paused: boolean;
  documents: TInspectionMyDocument[];
};

export type TInspectionSignPayload = {
  template_version_id: string;
  signature_name: string;
  questionnaire_answers?: Record<string, boolean | string>;
};

/**
 * The signing response. `conflicts` / `failed_attestations` / `requires_review`
 * are returned ALONGSIDE the created signature: a declaration that discloses a
 * conflict is recorded (never refused) and routed to a manager, so the UI has to
 * tell the signer that their obligation is not yet discharged.
 */
export type TInspectionSignResponse = TInspectionSignature & {
  conflicts: string[];
  failed_attestations: string[];
  requires_review: boolean;
};

export type TInspectionComplianceDocument = {
  kind: TInspectionDocumentKind;
  version: number;
  signed_at: string | null;
  review_status: TInspectionReviewStatus | null;
  risk_level: TInspectionRiskLevel | null;
  declared_conflicts: boolean;
  signature_id: string | null;
  blocked_since: string | null;
};

export type TInspectionComplianceRow = {
  member_id: string;
  member_email: string | null;
  role: number;
  documents: TInspectionComplianceDocument[];
};

export type TInspectionCompliance = {
  inspection_mode: TInspectionMode;
  is_inspection_enabled: boolean;
  inspection_enforcement_paused: boolean;
  required_kinds: TInspectionDocumentKind[];
  members: TInspectionComplianceRow[];
};

export type TInspectionReviewPayload = {
  review_status: "ACCEPTED" | "ACCEPTED_WITH_MEASURES" | "REJECTED";
  risk_level?: TInspectionRiskLevel;
  mitigation_measures?: string;
  review_notes?: string;
};
