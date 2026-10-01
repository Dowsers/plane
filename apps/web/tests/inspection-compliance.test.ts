/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Inspection compliance frontend logic (ISO/IEC 17020 §4.1/§4.2).
 *
 * Covers the three things whose breakage is silent rather than loud:
 *  1. the "is this obligation discharged" rule, which must stay in step with the
 *     backend's own `SATISFYING_REVIEW_STATUSES`;
 *  2. detection of the gate's 403 rejection;
 *  3. the shipped questionnaire's polarity, since a uniform reading of it would
 *     let somebody tick "I am not impartial" and be recorded as compliant.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_IMPARTIALITY_QUESTIONNAIRE_KEYS } from "./fixtures/inspection";
import {
  INSPECTION_SIGNATURE_REQUIRED_ERROR_CODE,
  getInspectionBlockedProjectId,
  getInspectionOutstandingKinds,
  isInspectionSignatureRequiredError,
} from "@/../helpers/inspection.helper";
import { SATISFYING_REVIEW_STATUSES, isInspectionDocumentSatisfied } from "@/hooks/use-inspection-obligations";
import {
  INSPECTION_CATEGORY_I18N,
  INSPECTION_CATEGORY_ORDER,
  INSPECTION_KIND_I18N,
  INSPECTION_MODE_I18N,
  INSPECTION_RISK_I18N,
} from "@/components/inspection/constants";
import type { TInspectionMyDocument, TInspectionReviewStatus, TInspectionSignature } from "@plane/types";

/** `.sort()` rather than `.toSorted()`: this app compiles against `lib: ES2022`
 * (packages/typescript-config/react-router.json), where `toSorted` does not
 * exist. The spread always copies first, so nothing shared is mutated. */
const sorted = (values: string[]): string[] =>
  // eslint-disable-next-line unicorn/no-array-sort
  [...values].sort();

const signature = (review_status: TInspectionReviewStatus): TInspectionSignature =>
  ({ review_status }) as TInspectionSignature;

const doc = (overrides: Partial<TInspectionMyDocument> = {}): TInspectionMyDocument =>
  ({
    kind: "CONFIDENTIALITY",
    template_id: "t",
    template_version_id: "v",
    version: 1,
    body: "",
    asset: null,
    questionnaire_schema: [],
    signature: null,
    obligation_started_at: null,
    blocked_since: null,
    ...overrides,
  }) as TInspectionMyDocument;

describe("isInspectionDocumentSatisfied", () => {
  it("is not satisfied with no signature", () => {
    expect(isInspectionDocumentSatisfied(doc())).toBe(false);
  });

  it.each(["NOT_REQUIRED", "ACCEPTED", "ACCEPTED_WITH_MEASURES"] as TInspectionReviewStatus[])(
    "is satisfied when the review verdict is %s",
    (status) => {
      expect(isInspectionDocumentSatisfied(doc({ signature: signature(status) }))).toBe(true);
    }
  );

  it("is NOT satisfied while a disclosed conflict is still PENDING review", () => {
    // §4.1 asks for a risk analysis; signing alone does not discharge it.
    expect(isInspectionDocumentSatisfied(doc({ signature: signature("PENDING") }))).toBe(false);
  });

  it("is NOT satisfied when the declaration was REJECTED", () => {
    expect(isInspectionDocumentSatisfied(doc({ signature: signature("REJECTED") }))).toBe(false);
  });

  it("lists exactly the three verdicts the backend accepts", () => {
    // Mirrors `SATISFYING_REVIEW_STATUSES` in
    // plane/utils/inspection_compliance.py. If that list changes, this fails -
    // which is the point.
    expect([...SATISFYING_REVIEW_STATUSES]).toEqual(["NOT_REQUIRED", "ACCEPTED", "ACCEPTED_WITH_MEASURES"]);
  });
});

describe("inspection gate rejection", () => {
  const body = {
    error_code: INSPECTION_SIGNATURE_REQUIRED_ERROR_CODE,
    project_id: "p-1",
    outstanding: ["IMPARTIALITY", "ETHICS_CHARTER"],
  };

  it("recognises the service-thrown body", () => {
    // Every service in this app throws `error.response.data`, so that body IS
    // what a catch sees.
    expect(isInspectionSignatureRequiredError(body)).toBe(true);
    expect(getInspectionOutstandingKinds(body)).toEqual(["IMPARTIALITY", "ETHICS_CHARTER"]);
    expect(getInspectionBlockedProjectId(body)).toBe("p-1");
  });

  it("also tolerates a raw axios error", () => {
    expect(isInspectionSignatureRequiredError({ response: { data: body } })).toBe(true);
    expect(getInspectionOutstandingKinds({ response: { data: body } })).toEqual(["IMPARTIALITY", "ETHICS_CHARTER"]);
  });

  it("does not confuse itself with the reauth rejection", () => {
    expect(isInspectionSignatureRequiredError({ error_code: "REAUTH_REQUIRED" })).toBe(false);
  });

  it.each([null, undefined, "", 0, {}, { error_code: "OTHER" }])("rejects %p", (value) => {
    expect(isInspectionSignatureRequiredError(value)).toBe(false);
    expect(getInspectionOutstandingKinds(value)).toEqual([]);
    expect(getInspectionBlockedProjectId(value)).toBeNull();
  });

  it("survives a malformed outstanding list", () => {
    expect(
      getInspectionOutstandingKinds({ error_code: INSPECTION_SIGNATURE_REQUIRED_ERROR_CODE, outstanding: "nope" })
    ).toEqual([]);
  });
});

describe("inspection label registries", () => {
  it("labels all three document kinds", () => {
    expect(sorted(Object.keys(INSPECTION_KIND_I18N))).toEqual(["CONFIDENTIALITY", "ETHICS_CHARTER", "IMPARTIALITY"]);
  });

  it("labels all three inspection modes", () => {
    expect(sorted(Object.keys(INSPECTION_MODE_I18N))).toEqual(["FULLY_AUTOMATIC", "MANUAL", "SEMI_AUTOMATIC"]);
  });

  it("labels all four risk levels", () => {
    expect(sorted(Object.keys(INSPECTION_RISK_I18N))).toEqual(["HIGH", "LOW", "MEDIUM", "NONE"]);
  });

  it("orders and labels the questionnaire's five sections", () => {
    expect(INSPECTION_CATEGORY_ORDER).toHaveLength(5);
    for (const category of INSPECTION_CATEGORY_ORDER) {
      expect(INSPECTION_CATEGORY_I18N[category], `missing label for ${category}`).toBeTruthy();
    }
  });
});

describe("shipped questionnaire fixture", () => {
  it("mirrors the backend's 15 question keys", () => {
    // Kept as a fixture rather than imported from Python: the point is to fail
    // loudly if the issued form changes without the frontend being revisited.
    expect(DEFAULT_IMPARTIALITY_QUESTIONNAIRE_KEYS).toHaveLength(15);
    expect(new Set(DEFAULT_IMPARTIALITY_QUESTIONNAIRE_KEYS).size).toBe(15);
  });
});
