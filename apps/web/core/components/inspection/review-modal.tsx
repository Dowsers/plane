/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TInspectionQuestion,
  TInspectionReviewPayload,
  TInspectionRiskLevel,
  TInspectionSignature,
} from "@plane/types";
import { Button, CustomSelect, EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
// services
import { InspectionService } from "@/services/inspection.service";
// local imports
import { INSPECTION_RISK_I18N } from "./constants";

const inspectionService = new InspectionService();

type TVerdict = TInspectionReviewPayload["review_status"];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  signatureId: string;
  /** The schema the declaration was signed against, so the answers can be shown
   * with their original question wording rather than as raw keys. */
  questionnaireSchema?: TInspectionQuestion[];
  onReviewed: () => void;
};

const RISK_LEVELS: TInspectionRiskLevel[] = ["NONE", "LOW", "MEDIUM", "HIGH"];

/**
 * The §4.1 risk analysis: a responsible person records a risk level and, where
 * applicable, the mitigation measures. This is what makes an impartiality
 * declaration more than a checkbox - the clause asks for an ANALYSIS, and until
 * this verdict exists the signature does not discharge the member's obligation
 * (see `plane.utils.inspection_compliance.SATISFYING_REVIEW_STATUSES`).
 */
export function InspectionReviewModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, signatureId, questionnaireSchema, onReviewed } = props;
  const { t } = useTranslation();

  const [declaration, setDeclaration] = useState<TInspectionSignature | null>(null);
  const [verdict, setVerdict] = useState<TVerdict>("ACCEPTED");
  const [riskLevel, setRiskLevel] = useState<TInspectionRiskLevel>("LOW");
  const [measures, setMeasures] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    inspectionService
      .getDeclaration(workspaceSlug, projectId, signatureId)
      .then((data) => {
        if (!cancelled) setDeclaration(data);
        return;
      })
      .catch(() => {
        if (!cancelled) setDeclaration(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceSlug, projectId, signatureId]);

  // Mirrors the serializer's own validation so the user is not told "required"
  // only after a round trip.
  const measuresRequired = verdict === "ACCEPTED_WITH_MEASURES";
  const riskRequired = verdict === "ACCEPTED" || verdict === "ACCEPTED_WITH_MEASURES";
  const canSubmit =
    !isSubmitting && (!measuresRequired || measures.trim().length > 0) && (!riskRequired || Boolean(riskLevel));

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await inspectionService.reviewDeclaration(workspaceSlug, projectId, signatureId, {
        review_status: verdict,
        ...(riskRequired ? { risk_level: riskLevel } : {}),
        ...(measures.trim() ? { mitigation_measures: measures.trim() } : {}),
        ...(notes.trim() ? { review_notes: notes.trim() } : {}),
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_settings.inspection.review.success_title"),
        message: t("project_settings.inspection.review.success_message"),
      });
      onReviewed();
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: (error as { error?: string })?.error ?? t("common.error.message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelForKey = (key: string) => questionnaireSchema?.find((question) => question.key === key)?.label ?? key;

  const answerLabel = (key: string, value: boolean | string) => {
    if (typeof value !== "boolean") return value;
    const question = questionnaireSchema?.find((item) => item.key === key);
    const isTrueFalse = question?.answer_style === "TRUE_FALSE";
    if (isTrueFalse) {
      return value ? t("project_settings.inspection.answer.true") : t("project_settings.inspection.answer.false");
    }
    return value ? t("project_settings.inspection.answer.yes") : t("project_settings.inspection.answer.no");
  };

  /** A disclosure or a contradicted attestation - the two things the reviewer is
   * actually here to weigh. */
  const isFlagged = (key: string, value: boolean | string) => {
    const question = questionnaireSchema?.find((item) => item.key === key);
    if (!question || typeof value !== "boolean") return false;
    if (question.conflict_if !== undefined) return value === question.conflict_if;
    if (question.required_value !== undefined) return value !== question.required_value;
    return false;
  };

  const answers = Object.entries(declaration?.questionnaire_answers ?? {});
  const flagged = answers.filter(([key, value]) => isFlagged(key, value));

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[80vh] flex-col">
        <div className="shrink-0 border-b border-subtle px-5 py-4">
          <h3 className="text-lg font-medium text-primary">{t("project_settings.inspection.review.title")}</h3>
          {declaration ? (
            <p className="text-sm mt-1 text-tertiary">
              {declaration.signer_email_snapshot} &middot; v{declaration.template_version_number}
            </p>
          ) : null}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {flagged.length > 0 ? (
            <div className="border-amber-500/40 bg-amber-500/10 space-y-2 rounded border p-3">
              <p className="text-xs text-amber-700 font-medium tracking-wide uppercase">
                {t("project_settings.inspection.review.flagged")}
              </p>
              <ul className="space-y-1.5">
                {flagged.map(([key, value]) => (
                  <li key={key} className="text-sm text-primary">
                    {/* Verbatim question wording from the signed schema. */}
                    {labelForKey(key)} — <strong>{answerLabel(key, value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {answers.length > 0 ? (
            <details className="rounded border border-subtle bg-surface-2 p-3">
              <summary className="text-sm cursor-pointer font-medium text-secondary">
                {t("project_settings.inspection.review.all_answers")}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {answers.map(([key, value]) => (
                  <li key={key} className="text-sm text-secondary">
                    {labelForKey(key)} — {answerLabel(key, value)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-primary">
                {t("project_settings.inspection.review.verdict")}
              </span>
              <CustomSelect
                value={verdict}
                onChange={(value: TVerdict) => setVerdict(value)}
                label={t(`project_settings.inspection.review.verdict_${verdict.toLowerCase()}`)}
                buttonClassName="w-full"
              >
                <CustomSelect.Option value="ACCEPTED">
                  {t("project_settings.inspection.review.verdict_accepted")}
                </CustomSelect.Option>
                <CustomSelect.Option value="ACCEPTED_WITH_MEASURES">
                  {t("project_settings.inspection.review.verdict_accepted_with_measures")}
                </CustomSelect.Option>
                <CustomSelect.Option value="REJECTED">
                  {t("project_settings.inspection.review.verdict_rejected")}
                </CustomSelect.Option>
              </CustomSelect>
            </div>

            {riskRequired ? (
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-primary">
                  {t("project_settings.inspection.review.risk_level")}
                </span>
                <CustomSelect
                  value={riskLevel}
                  onChange={(value: TInspectionRiskLevel) => setRiskLevel(value)}
                  label={t(INSPECTION_RISK_I18N[riskLevel])}
                  buttonClassName="w-full"
                >
                  {RISK_LEVELS.map((level) => (
                    <CustomSelect.Option key={level} value={level}>
                      {t(INSPECTION_RISK_I18N[level])}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-primary">
                {t("project_settings.inspection.review.measures")}
                {measuresRequired ? <span className="text-danger ml-1">*</span> : null}
              </span>
              <TextArea
                value={measures}
                onChange={(event) => setMeasures(event.target.value)}
                rows={3}
                className="text-sm w-full"
                placeholder={t("project_settings.inspection.review.measures_placeholder")}
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-primary">{t("project_settings.inspection.review.notes")}</span>
              <TextArea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                className="text-sm w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-5 py-4">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canSubmit} loading={isSubmitting}>
            {t("project_settings.inspection.review.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
