/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectUpdateGeneratedSummary, TProjectUpdateStatus } from "@plane/types";
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
};

export const CreateProjectUpdateModal = observer(function CreateProjectUpdateModal(props: Props) {
  const { isOpen, handleClose } = props;
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { createUpdate } = useProjectUpdate();

  const [status, setStatus] = useState<TProjectUpdateStatus>("ON_TRACK");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [summary, setSummary] = useState<TProjectUpdateGeneratedSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId) return;
    setStatus("ON_TRACK");
    setDescriptionHtml("");
    setSummary(null);
    projectUpdateService.generateSummary(workspaceSlug.toString(), projectId.toString()).then(setSummary);
  }, [isOpen, workspaceSlug, projectId]);

  const handleSubmit = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsSubmitting(true);
    try {
      await createUpdate(workspaceSlug.toString(), projectId.toString(), {
        status,
        description_html: descriptionHtml || "<p></p>",
        generated_summary_json: summary ?? {},
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

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("project_updates.post_update")}</h3>

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
