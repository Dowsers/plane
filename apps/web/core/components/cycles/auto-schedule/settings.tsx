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

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const CONFIG_KEY = (workspaceSlug: string, projectId: string) =>
  `CYCLE_AUTO_SCHEDULE_CONFIG_${workspaceSlug}_${projectId}`;

export const CycleAutoScheduleSettings = observer(function CycleAutoScheduleSettings(props: Props) {
  const { workspaceSlug, projectId } = props;
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
        title: "Error!",
        message: error?.error ?? "Unable to save auto-scheduling settings. Please try again.",
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
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to compute preview." });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <SettingsHeading
        title="Planification automatique"
        description="Créez automatiquement les prochains cycles selon une cadence récurrente."
      />
      <div className="mt-4 divide-y divide-subtle">
        <SettingsControlItem
          title="Activer la planification automatique"
          description="Un nouveau cycle sera créé dès que le nombre de cycles à venir passe sous le seuil configuré."
          control={
            <ToggleSwitch
              value={form.is_enabled}
              onChange={() => persist({ is_enabled: !form.is_enabled })}
              disabled={!isAdmin}
            />
          }
        />
        <SettingsControlItem
          title="Cadence"
          description="Durée de chaque cycle auto-planifié, en semaines (1-12)."
          control={
            <Input
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
          title="Jour de démarrage"
          description="Jour de la semaine auquel chaque nouveau cycle commence."
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
          title="Cooldown"
          description="Nombre de jours de battement entre la fin d'un cycle et le début du suivant (0-14)."
          control={
            <Input
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
          title="Lookahead"
          description="Nombre de cycles futurs à toujours garder déjà créés d'avance (1-3)."
          control={
            <Input
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
          title="Gabarit de nom"
          description="Le texte {number} est remplacé par le numéro de cycle auto-incrémenté."
          control={
            <Input
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
          title="Transfert automatique (rollover)"
          description="À la clôture d'un cycle auto-planifié, transfère ses work items non terminés vers le suivant."
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
          Prévisualiser les prochains cycles
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
