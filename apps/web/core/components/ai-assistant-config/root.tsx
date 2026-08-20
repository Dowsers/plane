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
import type { TProjectAIAssistantConfig } from "@plane/types";
import { Button, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { AIAssistantConfigService } from "@/services/ai-assistant-config.service";

const aiAssistantConfigService = new AIAssistantConfigService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/** The 3-state override control for `Project.is_ai_assistant_enabled` -
 * same shape/reasoning as the sibling category 9 features' own
 * `TOverrideOption` (`ai-triage-config/root.tsx`,
 * `duplicate-detection-config/root.tsx`) - never built as a shared
 * component by either of those, so this small local copy follows that
 * same precedent rather than inventing a shared abstraction. */
type TOverrideOption = "inherit" | "on" | "off";

const overrideValueToOption = (value: boolean | null): TOverrideOption =>
  value === null ? "inherit" : value ? "on" : "off";
const overrideOptionToValue = (option: TOverrideOption): boolean | null =>
  option === "inherit" ? null : option === "on";

/**
 * Project Settings > "Assistant IA" tab - category 9, feature 3
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Backend:
 * `ProjectAIAssistantConfigEndpoint`
 * (apps/api/plane/app/views/ai_assistant_config.py) - Admin only for
 * every verb, matching this page's own route-level `NotAuthorizedView`
 * gate (app/.../projects/[projectId]/ai-assistant/page.tsx).
 *
 * Deliberately a SEPARATE tab from the sibling "AI Triage"/"AI Duplicate
 * Detection" settings pages, same reasoning as those two are separate
 * from each other - unrelated features with independently-toggleable
 * workspace master switches and separate backend endpoints.
 *
 * Just the tri-state override, no extra per-project knobs (rate limiting
 * is workspace-only - see `ai_assistant_max_messages_per_user_per_hour`'s
 * own comment) - same minimal shape as
 * `duplicate-detection-config/root.tsx`'s project-level card.
 */
export const ProjectAIAssistantConfigRoot = observer(function ProjectAIAssistantConfigRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  const [config, setConfig] = useState<TProjectAIAssistantConfig | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [override, setOverride] = useState<TOverrideOption>("inherit");

  useEffect(() => {
    let cancelled = false;
    aiAssistantConfigService
      .getProjectConfig(workspaceSlug, projectId)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setOverride(overrideValueToOption(data.is_ai_assistant_enabled));
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
      const updated = await aiAssistantConfigService.updateProjectConfig(workspaceSlug, projectId, {
        is_ai_assistant_enabled: overrideOptionToValue(override),
      });
      setConfig(updated);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("project_settings.ai_assistant.save_success"),
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
      <Tooltip tooltipContent={t("project_settings.ai_assistant.workspace_disabled_tooltip")} position="top">
        <div>{node}</div>
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h5 className="text-14 font-medium text-primary">{t("project_settings.ai_assistant.label")}</h5>
        <p className="text-13 text-tertiary">{t("project_settings.ai_assistant.description")}</p>
      </div>

      {wrapWithWorkspaceTooltip(
        <div
          className={cn("flex flex-col gap-4 rounded-md border border-subtle p-4", {
            "opacity-60": !isWorkspaceEnabled,
          })}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h5 className="text-14 font-medium text-primary">{t("project_settings.ai_assistant.master_switch")}</h5>
              <p className="text-13 text-tertiary">{t("project_settings.ai_assistant.master_switch_description")}</p>
            </div>
            <CustomSelect
              value={override}
              label={t(`project_settings.ai_assistant.override.${override}`)}
              onChange={(value: TOverrideOption) => setOverride(value)}
              input
              disabled={controlsDisabled}
            >
              <CustomSelect.Option value="inherit">
                {t("project_settings.ai_assistant.override.inherit")}
              </CustomSelect.Option>
              <CustomSelect.Option value="on">{t("project_settings.ai_assistant.override.on")}</CustomSelect.Option>
              <CustomSelect.Option value="off">{t("project_settings.ai_assistant.override.off")}</CustomSelect.Option>
            </CustomSelect>
          </div>

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
