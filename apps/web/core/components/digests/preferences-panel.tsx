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
import type { TDigestPreference, TDigestPreferencePayload, TDigestRunDetail, TDigestScope } from "@plane/types";
import { Button, Checkbox, CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
// components
import { ProjectSelect } from "@/components/analytics/select/project";
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { DigestService } from "@/services/digest.service";
import { WorkspaceDigestSettingsService } from "@/services/workspace-digest-settings.service";

const digestService = new DigestService();
const workspaceDigestSettingsService = new WorkspaceDigestSettingsService();

const PREFERENCES_KEY = (workspaceSlug: string) => `DIGEST_PREFERENCES_${workspaceSlug}`;
const DIGESTS_LIST_KEY = (workspaceSlug: string) => `DIGEST_RUNS_${workspaceSlug}`;
const WORKSPACE_DIGEST_SETTINGS_KEY = (workspaceSlug: string) => `WORKSPACE_DIGEST_SETTINGS_${workspaceSlug}`;

const FREQUENCY_KEYS = ["DAILY", "WEEKLY"] as const;
const SCOPE_KEYS: TDigestScope[] = ["ALL_PROJECTS", "FAVORITES_ONLY", "CUSTOM"];
const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;

type Props = {
  workspaceSlug: string;
  /** Not gated on `is_enabled` - the preview endpoint ignores it (only the
   * workspace's own `digest_feature_enabled` kill-switch matters, see
   * `UserDigestPreviewEndpoint`), so a member can try the feature before
   * opting in. */
  onPreviewGenerated?: (digest: TDigestRunDetail) => void;
};

/**
 * Category 9 (AI features, docs/feature-specs/09-ai-features.md in
 * plane-selfhost), feature 5 - "Digest periodique automatise" - the
 * personal preferences form (frequency/day/time/scope/channels + "Send a
 * preview now"). Every field persists immediately on change (no batch Save
 * button) - same convention as `CycleAutoScheduleSettings`
 * (apps/web/core/components/cycles/auto-schedule/settings.tsx), matching
 * the backend's own `partial=True` PATCH semantics.
 *
 * There is deliberately no audio/TTS control here - `send_audio` is a
 * schema-level placeholder only on the backend (no TTS provider exists
 * anywhere in this fork, per exigence 11's "en son absence, le controle
 * 'audio' est masque, pas simplement desactive") and no UI path should ever
 * surface or set it.
 */
export const DigestPreferencesPanel = observer(function DigestPreferencesPanel(props: Props) {
  const { workspaceSlug, onPreviewGenerated } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { joinedProjectIds } = useProject();
  const { allowPermissions } = useUserPermissions();

  const [form, setForm] = useState<TDigestPreference | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const { data, isLoading } = useSWR(PREFERENCES_KEY(workspaceSlug), () => digestService.getPreferences(workspaceSlug));

  // `WorkspaceDigestSettingsEndpoint.get` is Admin/Member only (Guests get a
  // 403) - only fetched for roles that can actually read it, so a Guest
  // simply never sees the "disabled by workspace" banner rather than
  // triggering a doomed request.
  const canViewWorkspaceSettings = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );
  const { data: workspaceDigestSettings } = useSWR(
    canViewWorkspaceSettings ? WORKSPACE_DIGEST_SETTINGS_KEY(workspaceSlug) : null,
    canViewWorkspaceSettings ? () => workspaceDigestSettingsService.getSettings(workspaceSlug) : null
  );
  const disabledByWorkspace = !!workspaceDigestSettings && !workspaceDigestSettings.digest_feature_enabled;

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const persist = async (patch: TDigestPreferencePayload) => {
    if (!form) return;
    const optimistic = { ...form, ...patch } as TDigestPreference;
    setForm(optimistic);
    try {
      const updated = await digestService.updatePreferences(workspaceSlug, patch);
      setForm(updated);
      mutate(PREFERENCES_KEY(workspaceSlug), updated, false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("digest.preferences.error") });
      setForm(form);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const result = await digestService.sendPreview(workspaceSlug);
      if ("status" in result && result.status === "SKIPPED_EMPTY") {
        setToast({ type: TOAST_TYPE.INFO, title: t("digest.label"), message: t("digest.preferences.preview_empty") });
        return;
      }
      const digest = result as TDigestRunDetail;
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t("digest.preferences.preview_success") });
      mutate(DIGESTS_LIST_KEY(workspaceSlug));
      onPreviewGenerated?.(digest);
      router.push(`/${workspaceSlug}/digests/${digest.id}`);
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      if (err?.status === 429) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("digest.preferences.preview_rate_limited") });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: err?.error ?? t("digest.preferences.error") });
      }
    } finally {
      setIsPreviewing(false);
    }
  };

  if (isLoading || !form) {
    return (
      <Loader className="flex flex-col gap-3 p-4">
        <Loader.Item height="32px" />
        <Loader.Item height="32px" />
        <Loader.Item height="32px" />
      </Loader>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-4 pb-2">
        <div>
          <h5 className="text-14 font-medium text-primary">{t("digest.preferences.title")}</h5>
          <p className="text-13 text-tertiary">{t("digest.preferences.description")}</p>
        </div>
        <Button variant="neutral-primary" size="sm" onClick={handlePreview} loading={isPreviewing} className="shrink-0">
          {t("digest.preferences.preview_button")}
        </Button>
      </div>

      {disabledByWorkspace && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-13 text-warning-primary">
          {t("digest.preferences.disabled_by_workspace")}
        </p>
      )}

      <div className="divide-y divide-subtle">
        <SettingsControlItem
          title={t("digest.preferences.enabled_label")}
          description=""
          control={
            <ToggleSwitch value={form.is_enabled} onChange={(value) => persist({ is_enabled: value })} size="sm" />
          }
        />

        {form.is_enabled && (
          <>
            <SettingsControlItem
              title={t("digest.preferences.frequency_label")}
              description=""
              control={
                <CustomSelect
                  value={form.frequency}
                  label={t(`digest.frequency.${form.frequency}`)}
                  onChange={(value: TDigestPreference["frequency"]) => persist({ frequency: value })}
                  input
                >
                  {FREQUENCY_KEYS.map((key) => (
                    <CustomSelect.Option key={key} value={key}>
                      {t(`digest.frequency.${key}`)}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              }
            />

            {form.frequency === "WEEKLY" && (
              <SettingsControlItem
                title={t("digest.preferences.day_of_week_label")}
                description=""
                control={
                  <CustomSelect
                    value={form.day_of_week ?? 0}
                    label={t(`digest.preferences.weekday.${form.day_of_week ?? 0}`)}
                    onChange={(value: number) => persist({ day_of_week: value })}
                    input
                  >
                    {WEEKDAY_KEYS.map((key) => (
                      <CustomSelect.Option key={key} value={key}>
                        {t(`digest.preferences.weekday.${key}`)}
                      </CustomSelect.Option>
                    ))}
                  </CustomSelect>
                }
              />
            )}

            <SettingsControlItem
              title={t("digest.preferences.time_label")}
              description=""
              control={
                <Input
                  id="preferences-time-of-day"
                  name="preferences-time-of-day"
                  type="time"
                  inputSize="sm"
                  className="w-32"
                  value={form.time_of_day?.slice(0, 5) ?? "08:00"}
                  onChange={(e) => persist({ time_of_day: `${e.target.value}:00` })}
                />
              }
            />

            <SettingsControlItem
              title={t("digest.preferences.scope_label")}
              description=""
              control={
                <CustomSelect
                  value={form.scope}
                  label={t(`digest.preferences.scope.${form.scope}`)}
                  onChange={(value: TDigestScope) => persist({ scope: value })}
                  input
                >
                  {SCOPE_KEYS.map((key) => (
                    <CustomSelect.Option key={key} value={key}>
                      {t(`digest.preferences.scope.${key}`)}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              }
            />

            {form.scope === "CUSTOM" && (
              <SettingsControlItem
                title={t("digest.preferences.custom_projects_label")}
                description=""
                control={
                  <ProjectSelect
                    value={form.custom_projects}
                    onChange={(value) => persist({ custom_projects: value ?? [] })}
                    projectIds={joinedProjectIds}
                  />
                }
              />
            )}

            <SettingsControlItem
              title={t("digest.preferences.channels_label")}
              description=""
              control={
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-13 text-tertiary">
                    <Checkbox checked disabled />
                    {t("digest.preferences.channel_in_app")}
                  </label>
                  <label className="flex items-center gap-1.5 text-13 text-primary">
                    <Checkbox checked={form.send_email} onChange={(e) => persist({ send_email: e.target.checked })} />
                    {t("digest.preferences.channel_email")}
                  </label>
                </div>
              }
            />
          </>
        )}
      </div>
    </div>
  );
});
