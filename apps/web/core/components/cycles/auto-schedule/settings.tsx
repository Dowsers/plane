/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCycleAutoScheduleConfig, TCycleAutoScheduleWindowPreview } from "@plane/types";
import { Button, CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// services
import { CycleService } from "@/services/cycle.service";

const cycleService = new CycleService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const CONFIG_KEY = (workspaceSlug: string, projectId: string) =>
  `CYCLE_AUTO_SCHEDULE_CONFIG_${workspaceSlug}_${projectId}`;

export const CycleAutoScheduleSettings = observer(function CycleAutoScheduleSettings(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const WEEKDAY_OPTIONS = [
    { value: 0, label: t("digest.preferences.weekday.0") },
    { value: 1, label: t("digest.preferences.weekday.1") },
    { value: 2, label: t("digest.preferences.weekday.2") },
    { value: 3, label: t("digest.preferences.weekday.3") },
    { value: 4, label: t("digest.preferences.weekday.4") },
    { value: 5, label: t("digest.preferences.weekday.5") },
    { value: 6, label: t("digest.preferences.weekday.6") },
  ];
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const [form, setForm] = useState<TCycleAutoScheduleConfig | null>(null);
  const [preview, setPreview] = useState<TCycleAutoScheduleWindowPreview[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data, isLoading } = useSWR(
    canView ? CONFIG_KEY(workspaceSlug, projectId) : null,
    canView ? () => cycleService.getCycleAutoScheduleConfig(workspaceSlug, projectId) : null
  );

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!canView) return null;

  if (isLoading || !form) {
    return (
      <Loader className="mt-7 flex flex-col gap-3">
        <Loader.Item height="40px" />
        <Loader.Item height="40px" />
      </Loader>
    );
  }

  const persist = async (patch: Partial<TCycleAutoScheduleConfig>) => {
    const nextForm = { ...form, ...patch };
    setForm(nextForm);
    try {
      const response = await cycleService.updateCycleAutoScheduleConfig(workspaceSlug, projectId, patch);
      setForm(response);
      mutate(CONFIG_KEY(workspaceSlug, projectId), response, false);
      setPreview(null);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("cycle.auto_schedule.save_error"),
      });
      setForm(form);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const windows = await cycleService.previewCycleAutoSchedule(workspaceSlug, projectId, form.lookahead_count);
      setPreview(windows);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("cycle.auto_schedule.preview_error") });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <SettingsHeading title={t("cycle.auto_schedule.title")} description={t("cycle.auto_schedule.description")} />
      <div className="mt-4 divide-y divide-subtle">
        <SettingsControlItem
          title={t("cycle.auto_schedule.enable_title")}
          description={t("cycle.auto_schedule.enable_description")}
          control={
            <ToggleSwitch
              value={form.is_enabled}
              onChange={() => persist({ is_enabled: !form.is_enabled })}
              disabled={!isAdmin}
            />
          }
        />
        <SettingsControlItem
          title={t("cycle.auto_schedule.cadence_title")}
          description={t("cycle.auto_schedule.cadence_description")}
          control={
            <Input
              id="settings-cadence-weeks"
              name="settings-cadence-weeks"
              type="number"
              min={1}
              max={12}
              inputSize="sm"
              className="w-20"
              value={form.cadence_weeks}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, cadence_weeks: Number(e.target.value) })}
              onBlur={() => persist({ cadence_weeks: form.cadence_weeks })}
            />
          }
        />
        <SettingsControlItem
          title={t("cycle.auto_schedule.start_day_title")}
          description={t("cycle.auto_schedule.start_day_description")}
          control={
            <CustomSelect
              value={form.start_day_of_week}
              label={WEEKDAY_OPTIONS.find((o) => o.value === form.start_day_of_week)?.label}
              onChange={(val: number) => persist({ start_day_of_week: val })}
              disabled={!isAdmin}
              input
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          }
        />
        <SettingsControlItem
          title={t("cycle.auto_schedule.cooldown_title")}
          description={t("cycle.auto_schedule.cooldown_description")}
          control={
            <Input
              id="settings-cooldown-days"
              name="settings-cooldown-days"
              type="number"
              min={0}
              max={14}
              inputSize="sm"
              className="w-20"
              value={form.cooldown_days}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, cooldown_days: Number(e.target.value) })}
              onBlur={() => persist({ cooldown_days: form.cooldown_days })}
            />
          }
        />
        <SettingsControlItem
          title={t("cycle.auto_schedule.lookahead_title")}
          description={t("cycle.auto_schedule.lookahead_description")}
          control={
            <Input
              id="settings-lookahead-count"
              name="settings-lookahead-count"
              type="number"
              min={1}
              max={3}
              inputSize="sm"
              className="w-20"
              value={form.lookahead_count}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, lookahead_count: Number(e.target.value) })}
              onBlur={() => persist({ lookahead_count: form.lookahead_count })}
            />
          }
        />
        <SettingsControlItem
          title={t("cycle.auto_schedule.naming_template_title")}
          description={t("cycle.auto_schedule.naming_template_description")}
          control={
            <Input
              id="settings-naming-template"
              name="settings-naming-template"
              type="text"
              inputSize="sm"
              className="w-40"
              value={form.naming_template}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, naming_template: e.target.value })}
              onBlur={() => persist({ naming_template: form.naming_template })}
            />
          }
        />
        <SettingsControlItem
          title={t("cycle.auto_schedule.rollover_title")}
          description={t("cycle.auto_schedule.rollover_description")}
          control={
            <ToggleSwitch
              value={form.rollover_enabled}
              onChange={() => persist({ rollover_enabled: !form.rollover_enabled })}
              disabled={!isAdmin}
            />
          }
        />
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <Button variant="neutral-primary" size="sm" onClick={handlePreview} loading={previewLoading} className="w-fit">
          {t("cycle.auto_schedule.preview_button")}
        </Button>
        {preview && (
          <div className="flex flex-col gap-1.5 rounded-md border border-subtle bg-surface-1 p-3">
            {preview.map((window) => (
              <div key={`${window.name}-${window.start_date}`} className="flex items-center justify-between text-13">
                <span className="font-medium text-primary">{window.name}</span>
                <span className="text-tertiary">
                  {renderFormattedDate(window.start_date)} - {renderFormattedDate(window.end_date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
