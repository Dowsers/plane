/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TInspectionCompliance, TInspectionMode, TProjectInspectionConfig } from "@plane/types";
import { Button, CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
// services
import { InspectionService } from "@/services/inspection.service";
// local imports
import { InspectionComplianceTable } from "./compliance-table";
import { INSPECTION_MODE_I18N } from "./constants";

const inspectionService = new InspectionService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const MODES: TInspectionMode[] = ["MANUAL", "SEMI_AUTOMATIC", "FULLY_AUTOMATIC"];

/**
 * Project Settings > "Inspection" tab. Backend:
 * `ProjectInspectionConfigEndpoint` and `ProjectInspectionComplianceEndpoint`
 * (apps/api/plane/app/views/inspection.py) - both Admin only for every verb,
 * matching this page's own route-level `NotAuthorizedView` gate, so no further
 * role check is duplicated here.
 *
 * The mode select is recorded but drives no behaviour in this iteration
 * (deliberate - see `Project.inspection_mode`); it is shown because the
 * compliance record is what an accreditation assessor reads, and the engagement
 * type belongs in it.
 */
export const ProjectInspectionConfigRoot = observer(function ProjectInspectionConfigRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  const [config, setConfig] = useState<TProjectInspectionConfig | null>(null);
  const [compliance, setCompliance] = useState<TInspectionCompliance | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isEnabled, setIsEnabled] = useState(false);
  const [mode, setMode] = useState<TInspectionMode>("MANUAL");
  const [graceDays, setGraceDays] = useState(7);
  const [isPaused, setIsPaused] = useState(false);

  const loadCompliance = () => {
    inspectionService
      .getCompliance(workspaceSlug, projectId)
      .then(setCompliance)
      .catch(() => setCompliance(null));
  };

  useEffect(() => {
    let cancelled = false;
    inspectionService
      .getProjectConfig(workspaceSlug, projectId)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setIsEnabled(data.is_inspection_enabled);
        setMode(data.inspection_mode);
        setGraceDays(data.inspection_grace_period_days);
        setIsPaused(data.inspection_enforcement_paused);
        return;
      })
      .finally(() => {
        if (!cancelled) setHasLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    if (config?.is_inspection_enabled) loadCompliance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.is_inspection_enabled, workspaceSlug, projectId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await inspectionService.updateProjectConfig(workspaceSlug, projectId, {
        is_inspection_enabled: isEnabled,
        inspection_mode: mode,
        inspection_grace_period_days: graceDays,
        inspection_enforcement_paused: isPaused,
      });
      setConfig(updated);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("project_settings.inspection.save_success"),
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: (error as { error?: string })?.error ?? t("common.error.message"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasLoaded) {
    return (
      <Loader className="space-y-4">
        <Loader.Item height="40px" />
        <Loader.Item height="40px" />
        <Loader.Item height="120px" />
      </Loader>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-medium text-primary">{t("project_settings.inspection.label")}</h3>
        <p className="text-sm text-tertiary">{t("project_settings.inspection.description")}</p>
      </div>

      <div className="space-y-4 rounded border border-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">{t("project_settings.inspection.enable")}</p>
            <p className="text-xs text-tertiary">{t("project_settings.inspection.enable_description")}</p>
          </div>
          <ToggleSwitch value={isEnabled} onChange={() => setIsEnabled((previous) => !previous)} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">{t("project_settings.inspection.mode_label")}</p>
            <p className="text-xs text-tertiary">{t("project_settings.inspection.mode_description")}</p>
          </div>
          <CustomSelect
            value={mode}
            onChange={(value: TInspectionMode) => setMode(value)}
            label={t(INSPECTION_MODE_I18N[mode])}
            disabled={!isEnabled}
          >
            {MODES.map((option) => (
              <CustomSelect.Option key={option} value={option}>
                {t(INSPECTION_MODE_I18N[option])}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">{t("project_settings.inspection.grace_label")}</p>
            <p className="text-xs text-tertiary">{t("project_settings.inspection.grace_description")}</p>
          </div>
          <Input
            type="number"
            min={0}
            max={365}
            value={graceDays}
            onChange={(event) => setGraceDays(Math.max(0, Number(event.target.value) || 0))}
            disabled={!isEnabled}
            className="w-24"
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-subtle pt-4">
          <div>
            <p className="text-sm font-medium text-primary">{t("project_settings.inspection.pause_label")}</p>
            {/* This is one of the three documented ways out of a lockout, so it
                says so rather than being an unexplained switch. */}
            <p className="text-xs text-tertiary">{t("project_settings.inspection.pause_description")}</p>
          </div>
          <ToggleSwitch value={isPaused} onChange={() => setIsPaused((previous) => !previous)} disabled={!isEnabled} />
        </div>

        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={isSaving}>
            {t("common.update")}
          </Button>
        </div>
      </div>

      {config?.is_inspection_enabled ? (
        <InspectionComplianceTable
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          compliance={compliance}
          onRefresh={loadCompliance}
        />
      ) : null}
    </div>
  );
});
