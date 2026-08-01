/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectUpdateCadence } from "@plane/types";
import { CustomSelect, ToggleSwitch } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web types
import type { TProject } from "@/plane-web/types/projects";

const CADENCE_OPTIONS: { key: TProjectUpdateCadence; i18n_label: string }[] = [
  { key: "DISABLED", i18n_label: "project_updates.settings.cadence_disabled" },
  { key: "WEEKLY", i18n_label: "project_updates.settings.cadence_weekly" },
  { key: "BIWEEKLY", i18n_label: "project_updates.settings.cadence_biweekly" },
  { key: "MONTHLY", i18n_label: "project_updates.settings.cadence_monthly" },
];

export const ProjectUpdateSettingsSection = observer(function ProjectUpdateSettingsSection() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { currentProjectDetails, updateProject } = useProject();

  if (!currentProjectDetails || !workspaceSlug || !projectId) return null;

  const handleChange = async (data: Partial<TProject>) => {
    try {
      await updateProject(workspaceSlug.toString(), projectId.toString(), data);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("project_updates.toast.error") });
    }
  };

  const selectedCadence = CADENCE_OPTIONS.find((option) => option.key === currentProjectDetails.update_cadence);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-subtle bg-layer-2 p-4">
      <h4 className="text-14 font-medium">{t("project_updates.settings.title")}</h4>

      <div className="flex flex-col gap-1">
        <span className="text-13 text-secondary">{t("project_updates.settings.cadence")}</span>
        <CustomSelect
          value={currentProjectDetails.update_cadence ?? "DISABLED"}
          onChange={(value: TProjectUpdateCadence) => handleChange({ update_cadence: value })}
          label={selectedCadence ? t(selectedCadence.i18n_label) : t("project_updates.settings.cadence_disabled")}
          buttonClassName="!border-subtle !shadow-none rounded-md font-medium"
          input
        >
          {CADENCE_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.key} value={option.key}>
              {t(option.i18n_label)}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-13 text-secondary">{t("project_updates.settings.owner")}</span>
        <MemberDropdown
          multiple={false}
          projectId={projectId.toString()}
          value={currentProjectDetails.update_owner ?? null}
          onChange={(value) => handleChange({ update_owner: value })}
          buttonVariant="border-with-text"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-13 text-secondary">{t("project_updates.settings.reminders_enabled")}</span>
        <ToggleSwitch
          value={!!currentProjectDetails.update_reminder_enabled}
          onChange={(value) => handleChange({ update_reminder_enabled: value })}
        />
      </div>
    </div>
  );
});
