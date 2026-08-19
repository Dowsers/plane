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
import type { TProjectAITriageConfig } from "@plane/types";
import { Button, CustomSelect, Input, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { AITriageConfigService } from "@/services/ai-triage-config.service";

const aiTriageConfigService = new AITriageConfigService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/** The 3-state override control for `Project.is_ai_triage_enabled` - see
 * that field's own comment (apps/api/plane/db/models/project.py):
 * `null` = inherit the workspace master switch, `true`/`false` = an
 * explicit override. Collapsing this to a plain checkbox would make
 * "inherit" unrepresentable, so it's a 3-option select instead. */
type TOverrideOption = "inherit" | "on" | "off";

const overrideValueToOption = (value: boolean | null): TOverrideOption =>
  value === null ? "inherit" : value ? "on" : "off";
const overrideOptionToValue = (option: TOverrideOption): boolean | null =>
  option === "inherit" ? null : option === "on";

/**
 * Project Settings > "AI Triage" tab (spec's own wording, "Considerations
 * API/UX": "nouvel onglet ou carte 'Triage IA' (interrupteur maitre +
 * toggles par champ + sliders de seuil de confiance), desactive et grise
 * si le workspace n'a pas active la fonctionnalite globalement"). Backend:
 * `ProjectAITriageConfigEndpoint`
 * (apps/api/plane/app/views/ai_triage_config.py) - Admin only for every
 * verb, matching this page's own route-level `NotAuthorizedView` gate
 * (app/.../projects/[projectId]/ai-triage/page.tsx), so no further
 * internal role check is duplicated here.
 *
 * Every control (including the 3-state override itself) is disabled with
 * a tooltip pointing at Settings > AI when
 * `workspace_master_switch_enabled` is false - an explicit per-project
 * override has zero effect while the workspace master switch is off
 * (`is_ai_triage_enabled_for_project` always returns `False` in that case,
 * apps/api/plane/utils/issue_triage_suggestion.py), so surfacing editable
 * controls that silently do nothing would be misleading.
 */
export const ProjectAITriageConfigRoot = observer(function ProjectAITriageConfigRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  const [config, setConfig] = useState<TProjectAITriageConfig | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [override, setOverride] = useState<TOverrideOption>("inherit");
  const [autoApplyModule, setAutoApplyModule] = useState(false);
  const [autoApplyAssignee, setAutoApplyAssignee] = useState(false);
  const [autoApplyLabels, setAutoApplyLabels] = useState(false);
  const [thresholdModule, setThresholdModule] = useState(0.75);
  const [thresholdAssignee, setThresholdAssignee] = useState(0.75);
  const [thresholdLabels, setThresholdLabels] = useState(0.75);
  const [maxLabelsSuggested, setMaxLabelsSuggested] = useState(5);
  const [minHistoricalIssues, setMinHistoricalIssues] = useState(10);

  useEffect(() => {
    let cancelled = false;
    aiTriageConfigService
      .getProjectConfig(workspaceSlug, projectId)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setOverride(overrideValueToOption(data.is_ai_triage_enabled));
        setAutoApplyModule(data.ai_triage_auto_apply_module);
        setAutoApplyAssignee(data.ai_triage_auto_apply_assignee);
        setAutoApplyLabels(data.ai_triage_auto_apply_labels);
        setThresholdModule(data.ai_triage_confidence_threshold_module);
        setThresholdAssignee(data.ai_triage_confidence_threshold_assignee);
        setThresholdLabels(data.ai_triage_confidence_threshold_labels);
        setMaxLabelsSuggested(data.ai_triage_max_labels_suggested);
        setMinHistoricalIssues(data.ai_triage_min_historical_issues);
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
      const updated = await aiTriageConfigService.updateProjectConfig(workspaceSlug, projectId, {
        is_ai_triage_enabled: overrideOptionToValue(override),
        ai_triage_auto_apply_module: autoApplyModule,
        ai_triage_auto_apply_assignee: autoApplyAssignee,
        ai_triage_auto_apply_labels: autoApplyLabels,
        ai_triage_confidence_threshold_module: thresholdModule,
        ai_triage_confidence_threshold_assignee: thresholdAssignee,
        ai_triage_confidence_threshold_labels: thresholdLabels,
        ai_triage_max_labels_suggested: maxLabelsSuggested,
        ai_triage_min_historical_issues: minHistoricalIssues,
      });
      setConfig(updated);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: t("project_settings.ai_triage.save_success") });
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("ai.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  const wrapWithWorkspaceTooltip = (node: ReactNode) =>
    !isWorkspaceEnabled && hasLoaded ? (
      <Tooltip tooltipContent={t("project_settings.ai_triage.workspace_disabled_tooltip")} position="top">
        <div>{node}</div>
      </Tooltip>
    ) : (
      node
    );

  const thresholdRow = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    autoApply: boolean,
    onAutoApplyChange: (value: boolean) => void
  ) => (
    <div className="flex flex-col gap-2 rounded-md border-[0.5px] border-subtle p-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-13 font-medium text-primary">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-12 text-tertiary">{t("project_settings.ai_triage.auto_apply")}</span>
          <ToggleSwitch value={autoApply} onChange={onAutoApplyChange} size="sm" disabled={controlsDisabled} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={controlsDisabled}
          className="accent-accent-primary h-1.5 w-full flex-1 cursor-pointer disabled:cursor-not-allowed"
        />
        <span className="w-10 shrink-0 text-right text-12 text-secondary">{Math.round(value * 100)}%</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h5 className="text-14 font-medium text-primary">{t("project_settings.ai_triage.label")}</h5>
        <p className="text-13 text-tertiary">{t("project_settings.ai_triage.description")}</p>
      </div>

      {wrapWithWorkspaceTooltip(
        <div
          className={cn("flex flex-col gap-4 rounded-md border border-subtle p-4", {
            "opacity-60": !isWorkspaceEnabled,
          })}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h5 className="text-14 font-medium text-primary">{t("project_settings.ai_triage.master_switch")}</h5>
              <p className="text-13 text-tertiary">{t("project_settings.ai_triage.master_switch_description")}</p>
            </div>
            <CustomSelect
              value={override}
              label={t(`project_settings.ai_triage.override.${override}`)}
              onChange={(value: TOverrideOption) => setOverride(value)}
              input
              disabled={controlsDisabled}
            >
              <CustomSelect.Option value="inherit">
                {t("project_settings.ai_triage.override.inherit")}
              </CustomSelect.Option>
              <CustomSelect.Option value="on">{t("project_settings.ai_triage.override.on")}</CustomSelect.Option>
              <CustomSelect.Option value="off">{t("project_settings.ai_triage.override.off")}</CustomSelect.Option>
            </CustomSelect>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {thresholdRow(
              t("project_settings.ai_triage.field_module"),
              thresholdModule,
              setThresholdModule,
              autoApplyModule,
              setAutoApplyModule
            )}
            {thresholdRow(
              t("project_settings.ai_triage.field_assignees"),
              thresholdAssignee,
              setThresholdAssignee,
              autoApplyAssignee,
              setAutoApplyAssignee
            )}
            {thresholdRow(
              t("project_settings.ai_triage.field_labels"),
              thresholdLabels,
              setThresholdLabels,
              autoApplyLabels,
              setAutoApplyLabels
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-13 text-secondary">{t("project_settings.ai_triage.max_labels_suggested")}</span>
              <Input
                type="number"
                min={0}
                value={maxLabelsSuggested}
                onChange={(e) => setMaxLabelsSuggested(Number(e.target.value))}
                disabled={controlsDisabled}
                inputSize="sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 text-secondary">{t("project_settings.ai_triage.min_historical_issues")}</span>
              <Input
                type="number"
                min={0}
                value={minHistoricalIssues}
                onChange={(e) => setMinHistoricalIssues(Number(e.target.value))}
                disabled={controlsDisabled}
                inputSize="sm"
              />
            </div>
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
