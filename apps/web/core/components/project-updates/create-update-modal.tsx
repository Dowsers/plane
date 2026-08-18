/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectUpdateAIDraftResponse, TProjectUpdateGeneratedSummary, TProjectUpdateStatus } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Loader, ModalCore, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useProjectUpdate } from "@/hooks/store/use-project-update";
// services
import { ProjectUpdateService } from "@/services/project-update.service";

const projectUpdateService = new ProjectUpdateService();

const STATUS_OPTIONS: { key: TProjectUpdateStatus; className: string }[] = [
  { key: "ON_TRACK", className: "bg-success-subtle text-success-primary" },
  { key: "AT_RISK", className: "bg-warning-subtle text-warning-primary" },
  { key: "OFF_TRACK", className: "bg-danger-subtle text-danger-primary" },
];

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  // Category 9, feature 6 ("Redaction assistee des mises a jour de statut",
  // docs/feature-specs/09-ai-features.md in plane-selfhost) - present only
  // when this modal was opened via the "Generate a draft with AI" button
  // (see `ProjectUpdatesListRoot`), which has already called
  // `POST .../updates/draft/` before opening this form. `null`/omitted means
  // a plain manual "Add update" - none of the `ai_*` fields are ever sent
  // in that case.
  initialDraft?: TProjectUpdateAIDraftResponse | null;
};

export const CreateProjectUpdateModal = observer(function CreateProjectUpdateModal(props: Props) {
  const { isOpen, handleClose, initialDraft = null } = props;
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { createUpdate } = useProjectUpdate();

  const [status, setStatus] = useState<TProjectUpdateStatus>("ON_TRACK");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [summary, setSummary] = useState<TProjectUpdateGeneratedSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The most recent AI draft response for this editing session - kept
  // verbatim (never mutated by further edits to `descriptionHtml` below) so
  // the published update's `ai_draft_content` stays the true original text
  // for audit/diff purposes (exigence 8), even though the human is free to
  // edit `descriptionHtml` before submitting.
  const [aiDraft, setAiDraft] = useState<TProjectUpdateAIDraftResponse | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationLimitMessage, setRegenerationLimitMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId) return;
    setStatus(initialDraft?.suggested_status ?? "ON_TRACK");
    setDescriptionHtml(initialDraft?.draft_content ?? "");
    setAiDraft(initialDraft ?? null);
    setRegenerationLimitMessage(null);
    setSummary(null);
    projectUpdateService.generateSummary(workspaceSlug.toString(), projectId.toString()).then(setSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug, projectId]);

  const handleRegenerate = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsRegenerating(true);
    setRegenerationLimitMessage(null);
    try {
      const result = await projectUpdateService.generateDraft(workspaceSlug.toString(), projectId.toString());
      setAiDraft(result);
      setDescriptionHtml(result.draft_content);
      setStatus(result.suggested_status);
    } catch (error: unknown) {
      const err = error as { error?: string; status?: number };
      if (err?.status === 429) {
        setRegenerationLimitMessage(err.error ?? t("project_updates.ai_draft.limit_reached"));
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: err?.error ?? t("project_updates.ai_draft.error"),
        });
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsSubmitting(true);
    try {
      await createUpdate(workspaceSlug.toString(), projectId.toString(), {
        status,
        description_html: descriptionHtml || "<p></p>",
        generated_summary_json: summary ?? {},
        // Only ever included when this draft originated from the AI
        // generator - a plain manual update never sends these (exigence 8
        // provenance is opt-in by construction, not forced).
        ...(aiDraft
          ? {
              is_ai_assisted: true,
              ai_draft_content: aiDraft.draft_content,
              ai_generation_status: aiDraft.ai_generation_status,
              ai_generation_metadata: aiDraft.ai_generation_metadata,
              ai_source_snapshot: aiDraft.ai_source_snapshot,
              ai_regeneration_count: aiDraft.regeneration_count,
            }
          : {}),
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("project_updates.toast.publish_success"),
      });
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("project_updates.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasReachedRegenerationCap = !!aiDraft && aiDraft.regeneration_count >= aiDraft.max_regenerations;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("project_updates.post_update")}</h3>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatus(option.key)}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-13 font-medium ring-1 ring-transparent ring-inset",
                  option.className,
                  status === option.key ? "opacity-100 ring-current" : "opacity-40"
                )}
              >
                {t(`project_updates.status.${option.key.toLowerCase()}`)}
              </button>
            ))}
          </div>
          {aiDraft && <p className="text-11 text-tertiary">{t("project_updates.ai_draft.suggested_status_hint")}</p>}
        </div>

        <div className="rounded-md border-[0.5px] border-subtle bg-layer-1 p-3">
          <p className="mb-2 text-11 font-medium text-secondary">{t("project_updates.since_last_update")}</p>
          {summary === null ? (
            <Loader className="flex flex-col gap-1">
              <Loader.Item height="16px" />
              <Loader.Item height="16px" />
            </Loader>
          ) : (
            <ul className="flex flex-col gap-1 text-13 text-secondary">
              <li>{t("project_updates.summary.issues_created", { count: summary.issues_created })}</li>
              <li>{t("project_updates.summary.issues_completed", { count: summary.issues_completed })}</li>
              <li>{t("project_updates.summary.issues_cancelled", { count: summary.issues_cancelled })}</li>
              <li>{t("project_updates.summary.net_backlog_change", { count: summary.net_backlog_change })}</li>
              <li>{t("project_updates.summary.cycles_started", { count: summary.cycles_started })}</li>
              <li>{t("project_updates.summary.cycles_closed", { count: summary.cycles_closed })}</li>
            </ul>
          )}
        </div>

        <TextArea
          value={descriptionHtml}
          onChange={(e) => setDescriptionHtml(e.target.value)}
          placeholder={t("project_updates.post_update")}
          className="w-full"
          rows={6}
        />

        {aiDraft && (
          <div className="flex flex-col gap-1.5 rounded-md border-[0.5px] border-subtle bg-layer-1 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-12 text-secondary">
                <Sparkles className="size-3.5 text-tertiary" aria-hidden="true" />
                {t("project_updates.ai_draft.regenerations_used", {
                  count: aiDraft.regeneration_count,
                  max: aiDraft.max_regenerations,
                })}
              </span>
              <Button
                variant="neutral-primary"
                size="sm"
                onClick={handleRegenerate}
                loading={isRegenerating}
                disabled={hasReachedRegenerationCap}
              >
                {t("project_updates.ai_draft.regenerate")}
              </Button>
            </div>
            {(hasReachedRegenerationCap || regenerationLimitMessage) && (
              <p className="text-11 text-warning-primary">
                {regenerationLimitMessage ?? t("project_updates.ai_draft.limit_reached")}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {t("project_updates.post_update")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
