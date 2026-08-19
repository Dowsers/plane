/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectDuplicateDetectionConfig } from "@plane/types";
import { Button, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { DuplicateDetectionConfigService } from "@/services/duplicate-detection-config.service";

const duplicateDetectionConfigService = new DuplicateDetectionConfigService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/** The 3-state override control for `Project.is_duplicate_detection_enabled`
 * - same shape/reasoning as the sibling category 9 feature's own
 * `TOverrideOption` in `ai-triage-config/root.tsx` (never built as a
 * separate reusable component there - that root.tsx keeps its
 * `overrideValueToOption`/`overrideOptionToValue` helpers local/inline
 * rather than extracted - so this small local copy follows that same
 * precedent rather than inventing a shared abstraction the original
 * feature itself didn't build). */
type TOverrideOption = "inherit" | "on" | "off";

const overrideValueToOption = (value: boolean | null): TOverrideOption =>
  value === null ? "inherit" : value ? "on" : "off";
const overrideOptionToValue = (option: TOverrideOption): boolean | null =>
  option === "inherit" ? null : option === "on";

/**
 * Project Settings > "AI Duplicate Detection" tab - category 9, feature 2
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Backend:
 * `ProjectDuplicateDetectionConfigEndpoint`
 * (apps/api/plane/app/views/duplicate_detection_config.py) - Admin only
 * for every verb, matching this page's own route-level `NotAuthorizedView`
 * gate (app/.../projects/[projectId]/ai-duplicate-detection/page.tsx).
 *
 * Deliberately a SEPARATE tab from the sibling "AI Triage" settings page
 * rather than folded into it - both are project-level AI feature configs,
 * but they're unrelated features with independently-toggleable workspace
 * master switches and separate backend endpoints; conflating them under
 * one tab would misleadingly suggest one master switch governs both.
 *
 * Unlike `ai-triage-config/root.tsx`, there are no per-field thresholds or
 * auto-apply toggles here - `duplicate_detection_similarity_threshold`/
 * `duplicate_detection_scope` are WORKSPACE-only (no project override, see
 * `Workspace.duplicate_detection_similarity_threshold`'s own comment) so
 * this card only ever has the tri-state override control itself.
 */
export const ProjectDuplicateDetectionConfigRoot = observer(function ProjectDuplicateDetectionConfigRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  const [config, setConfig] = useState<TProjectDuplicateDetectionConfig | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [override, setOverride] = useState<TOverrideOption>("inherit");

  useEffect(() => {
    let cancelled = false;
    duplicateDetectionConfigService
      .getProjectConfig(workspaceSlug, projectId)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setOverride(overrideValueToOption(data.is_duplicate_detection_enabled));
        return;
      })
      .catch(() => {
        if (!cancelled) setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
      })
      .finally(() => {
        if (!cancelled) setHasLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId]);

  const isWorkspaceEnabled = !!config?.workspace_master_switch_enabled;
  const controlsDisabled = !hasLoaded || !isWorkspaceEnabled;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await duplicateDetectionConfigService.updateProjectConfig(workspaceSlug, projectId, {
        is_duplicate_detection_enabled: overrideOptionToValue(override),
      });
      setConfig(updated);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("project_settings.ai_duplicate_detection.save_success"),
      });
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("ai.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  const wrapWithWorkspaceTooltip = (node: ReactNode) =>
    !isWorkspaceEnabled && hasLoaded ? (
      <Tooltip tooltipContent={t("project_settings.ai_duplicate_detection.workspace_disabled_tooltip")} position="top">
        <div>{node}</div>
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h5 className="text-14 font-medium text-primary">{t("project_settings.ai_duplicate_detection.label")}</h5>
        <p className="text-13 text-tertiary">{t("project_settings.ai_duplicate_detection.description")}</p>
      </div>

      {wrapWithWorkspaceTooltip(
        <div
          className={cn("flex flex-col gap-4 rounded-md border border-subtle p-4", {
            "opacity-60": !isWorkspaceEnabled,
          })}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h5 className="text-14 font-medium text-primary">
                {t("project_settings.ai_duplicate_detection.master_switch")}
              </h5>
              <p className="text-13 text-tertiary">
                {t("project_settings.ai_duplicate_detection.master_switch_description")}
              </p>
            </div>
            <CustomSelect
              value={override}
              label={t(`project_settings.ai_duplicate_detection.override.${override}`)}
              onChange={(value: TOverrideOption) => setOverride(value)}
              input
              disabled={controlsDisabled}
            >
              <CustomSelect.Option value="inherit">
                {t("project_settings.ai_duplicate_detection.override.inherit")}
              </CustomSelect.Option>
              <CustomSelect.Option value="on">
                {t("project_settings.ai_duplicate_detection.override.on")}
              </CustomSelect.Option>
              <CustomSelect.Option value="off">
                {t("project_settings.ai_duplicate_detection.override.off")}
              </CustomSelect.Option>
            </CustomSelect>
          </div>

          <p className="text-12 text-tertiary">{t("project_settings.ai_duplicate_detection.threshold_scope_hint")}</p>

          <div>
            <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={controlsDisabled}>
              {t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
