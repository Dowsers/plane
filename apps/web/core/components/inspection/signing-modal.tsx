/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TInspectionMyDocument, TInspectionQuestion } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { InspectionService } from "@/services/inspection.service";
// local imports
import { INSPECTION_CATEGORY_I18N, INSPECTION_CATEGORY_ORDER, INSPECTION_KIND_I18N } from "./constants";
import { InspectionDocumentBody } from "./document-body";

const inspectionService = new InspectionService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  document: TInspectionMyDocument;
  /** Called after a successful signature so the caller can refetch. */
  onSigned: () => void;
};

type TAnswers = Record<string, boolean | string>;

const categoryRank = (category?: string) => {
  const index = INSPECTION_CATEGORY_ORDER.indexOf(category as (typeof INSPECTION_CATEGORY_ORDER)[number]);
  return index === -1 ? INSPECTION_CATEGORY_ORDER.length : index;
};

/**
 * Signs one inspection document (ISO/IEC 17020 §4.1/§4.2).
 *
 * The questionnaire is rendered from the version's own `questionnaire_schema`
 * rather than hardcoded, because that schema is frozen alongside the document
 * text: an older signature must stay reproducible against the questions that
 * were actually asked at the time. For the same reason question labels and the
 * document body are printed verbatim from the backend and never passed through
 * `t()`.
 *
 * Note what this form deliberately does NOT do: it does not block submission
 * when an answer discloses a conflict or contradicts an attestation. Those are
 * recorded and routed to a manager - refusing them would discard the single most
 * important thing §4.1 exists to surface, and would invite the signer to just
 * tick the other box. See `plane.utils.inspection_questionnaire`.
 */
export function InspectionSigningModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, document, onSigned } = props;
  const { t } = useTranslation();

  const [answers, setAnswers] = useState<TAnswers>({});
  const [signatureName, setSignatureName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const questionsByCategory = useMemo(() => {
    const groups = new Map<string, TInspectionQuestion[]>();
    for (const question of document.questionnaire_schema ?? []) {
      const key = question.category ?? "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(question);
    }
    // `.sort()` rather than `.toSorted()`: this app compiles against
    // `lib: ES2022` (packages/typescript-config/react-router.json), where
    // `toSorted` does not exist. Mutating is safe regardless - the spread above
    // already produced a fresh array.
    // eslint-disable-next-line unicorn/no-array-sort
    return [...groups.entries()].sort(([a], [b]) => categoryRank(a) - categoryRank(b));
  }, [document.questionnaire_schema]);

  const requiredKeys = useMemo(
    () => (document.questionnaire_schema ?? []).filter((q) => q.required).map((q) => q.key),
    [document.questionnaire_schema]
  );

  const unanswered = requiredKeys.filter((key) => {
    const value = answers[key];
    return value === undefined || value === null || value === "";
  });

  const canSubmit = signatureName.trim().length > 0 && unanswered.length === 0 && !isSubmitting;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await inspectionService.sign(workspaceSlug, projectId, {
        template_version_id: document.template_version_id,
        signature_name: signatureName.trim(),
        questionnaire_answers: answers,
      });
      // A declaration that needs review is recorded but does NOT discharge the
      // obligation yet, so say so instead of a flat "done".
      setToast({
        type: response.requires_review ? TOAST_TYPE.INFO : TOAST_TYPE.SUCCESS,
        title: response.requires_review
          ? t("project_settings.inspection.sign.pending_review_title")
          : t("project_settings.inspection.sign.success_title"),
        message: response.requires_review
          ? t("project_settings.inspection.sign.pending_review_message")
          : t("project_settings.inspection.sign.success_message"),
      });
      // "Download at the moment of signing": offered immediately, as a toast
      // action rather than a blocking step, so a signer who wants their copy
      // gets it without the flow stopping for one who does not.
      try {
        await inspectionService.downloadSignaturePdf(workspaceSlug, projectId, response.id);
      } catch {
        // The signature IS recorded; a failed download must not read as a failed
        // signature. The copy stays available from the personal record.
        setToast({
          type: TOAST_TYPE.WARNING,
          title: t("project_settings.inspection.sign.pdf_failed_title"),
          message: t("project_settings.inspection.sign.pdf_failed_message"),
        });
      }
      onSigned();
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: (error as { error?: string })?.error ?? t("project_settings.inspection.sign.error_message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBooleanQuestion = (question: TInspectionQuestion) => {
    const isTrueFalse = question.answer_style === "TRUE_FALSE";
    const current = answers[question.key];
    const options: { value: boolean; label: string }[] = [
      {
        value: true,
        label: isTrueFalse ? t("project_settings.inspection.answer.true") : t("project_settings.inspection.answer.yes"),
      },
      {
        value: false,
        label: isTrueFalse ? t("project_settings.inspection.answer.false") : t("project_settings.inspection.answer.no"),
      },
    ];

    return (
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => setAnswers((previous) => ({ ...previous, [question.key]: option.value }))}
            className={cn(
              "text-sm rounded border px-3 py-1 transition-colors",
              current === option.value
                ? "border-accent-primary bg-accent-primary/10 font-medium text-accent-primary"
                : "border-subtle text-secondary hover:border-strong"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[80vh] flex-col">
        <div className="shrink-0 border-b border-subtle px-5 py-4">
          <h3 className="text-lg font-medium text-primary">{t(INSPECTION_KIND_I18N[document.kind])}</h3>
          <p className="text-sm mt-1 text-tertiary">
            {t("project_settings.inspection.sign.version", { version: document.version })}
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Rendered, not printed raw: these bodies are Markdown legal texts. The
              wording itself is still verbatim from the backend and never
              translated - see InspectionDocumentBody. */}
          {document.body ? <InspectionDocumentBody body={document.body} /> : null}

          {questionsByCategory.map(([category, questions]) => (
            <div key={category || "uncategorised"} className="space-y-3">
              {category ? (
                <h4 className="text-sm font-semibold text-primary">
                  {INSPECTION_CATEGORY_I18N[category] ? t(INSPECTION_CATEGORY_I18N[category]) : category}
                </h4>
              ) : null}

              {questions.map((question) => (
                <div key={question.key} className="space-y-2 border-l-2 border-subtle pl-3">
                  <p className="text-sm text-secondary">
                    {question.number ? <span className="mr-1 text-tertiary">{question.number}.</span> : null}
                    {/* Verbatim question text. */}
                    {question.label}
                    {question.required ? <span className="text-danger ml-1">*</span> : null}
                  </p>
                  {question.type === "text" ? (
                    <TextArea
                      value={(answers[question.key] as string) ?? ""}
                      onChange={(event) =>
                        setAnswers((previous) => ({ ...previous, [question.key]: event.target.value }))
                      }
                      rows={3}
                      className="text-sm w-full"
                    />
                  ) : (
                    renderBooleanQuestion(question)
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="space-y-2 border-t border-subtle pt-4">
            <label htmlFor="inspection-signature-name" className="text-sm font-medium text-primary">
              {t("project_settings.inspection.sign.name_label")}
              <span className="text-danger ml-1">*</span>
            </label>
            <Input
              id="inspection-signature-name"
              type="text"
              value={signatureName}
              onChange={(event) => setSignatureName(event.target.value)}
              placeholder={t("project_settings.inspection.sign.name_placeholder")}
              className="w-full"
            />
            <p className="text-xs text-tertiary">{t("project_settings.inspection.sign.evidence_notice")}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle px-5 py-4">
          <p className="text-xs text-tertiary">
            {unanswered.length > 0
              ? t("project_settings.inspection.sign.remaining", { count: unanswered.length })
              : null}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canSubmit} loading={isSubmitting}>
              {t("project_settings.inspection.sign.submit")}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
