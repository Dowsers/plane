/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TDuplicateDetectionScope,
  TWorkspaceAIAssistantConfig,
  TWorkspaceAIConfig,
  TWorkspaceAIProvider,
  TWorkspaceAIUpdateDataScope,
  TWorkspaceDigestSettings,
  TWorkspaceDuplicateDetectionConfig,
} from "@plane/types";
import { Button, CustomSelect, Input, ToggleSwitch } from "@plane/ui";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { AIAssistantConfigService } from "@/services/ai-assistant-config.service";
import { AIConfigService } from "@/services/ai-config.service";
import { DuplicateDetectionConfigService } from "@/services/duplicate-detection-config.service";
import { WorkspaceDigestSettingsService } from "@/services/workspace-digest-settings.service";
// local imports
import { AIFeatureToggleRow } from "./feature-toggle-row";

const aiConfigService = new AIConfigService();
const duplicateDetectionConfigService = new DuplicateDetectionConfigService();
const workspaceDigestSettingsService = new WorkspaceDigestSettingsService();
const aiAssistantConfigService = new AIAssistantConfigService();

const DUPLICATE_DETECTION_SCOPE_KEYS: TDuplicateDetectionScope[] = ["project", "workspace"];
const DUPLICATE_DETECTION_SCOPE_I18N_KEYS: Record<TDuplicateDetectionScope, string> = {
  project: "ai.duplicate_detection_settings.scope.project",
  workspace: "ai.duplicate_detection_settings.scope.workspace",
};

type Props = {
  workspaceSlug: string;
};

const PROVIDER_KEYS: TWorkspaceAIProvider[] = ["openai", "anthropic", "gemini", "custom_openai_compatible"];
const DATA_SCOPE_KEYS: TWorkspaceAIUpdateDataScope[] = ["TITLES_STATES_ONLY", "FULL_DESCRIPTIONS"];
const DATA_SCOPE_I18N_KEYS: Record<TWorkspaceAIUpdateDataScope, string> = {
  TITLES_STATES_ONLY: "ai.update_draft_settings.data_scope.titles_states_only",
  FULL_DESCRIPTIONS: "ai.update_draft_settings.data_scope.full_descriptions",
};

/**
 * Settings > AI - category 9 (AI features, docs/feature-specs/09-ai-features.md
 * in plane-selfhost) infrastructure prerequisite's first-ever frontend
 * surface, built as part of feature 4 (thread summary) since it's the
 * first feature that actually needs a configured provider. Admin-only for
 * every action, matching the backend's own gating
 * (`WorkspaceAIConfigEndpoint`/`WorkspaceAIConfigTestEndpoint`,
 * apps/api/plane/app/views/workspace_ai_config.py) - this page's own route
 * already renders `NotAuthorizedView` for non-admins, so no further
 * internal role gating is needed here.
 *
 * Two independent sections:
 * 1. The shared LLM connection form (provider/key/base-url/model/enabled +
 *    "Test connection") - feature-agnostic, reused by every future
 *    category 9 feature.
 * 2. A "Features" sub-section listing each individual AI feature's own
 *    flat `Workspace.is_*_enabled` toggle ("AI thread summary" and,
 *    category 9 feature 6, "AI-assisted status update drafting") - see
 *    `AIFeatureToggleRow`'s own docstring for why this is structured as a
 *    small extensible list rather than a single hardcoded row. The update
 *    drafting row is followed by its own compact settings block (data
 *    scope + regeneration/daily-limit knobs) rather than a whole new page,
 *    per that feature's own UI scope decision.
 */
export const AIConfigSettingsRoot = observer(function AIConfigSettingsRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { currentWorkspace, updateWorkspace } = useWorkspace();

  const [config, setConfig] = useState<TWorkspaceAIConfig | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [provider, setProvider] = useState<TWorkspaceAIProvider>("openai");
  const [modelName, setModelName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTogglingSummary, setIsTogglingSummary] = useState(false);
  const [isTogglingUpdateDraft, setIsTogglingUpdateDraft] = useState(false);
  const [isTogglingTriage, setIsTogglingTriage] = useState(false);

  // Category 9, feature 2 - "Detection de doublons/similarite". Unlike
  // `is_ai_triage_enabled` above (a plain field on the generic workspace
  // serializer, read/written through `useWorkspace()`), this feature's
  // workspace config has its OWN dedicated endpoint (threshold/scope need
  // range/choice validation) - see `DuplicateDetectionConfigService`'s own
  // docstring - so it's tracked as separate local state, fetched/saved
  // independently of `currentWorkspace`.
  const [duplicateDetectionConfig, setDuplicateDetectionConfig] = useState<TWorkspaceDuplicateDetectionConfig | null>(
    null
  );
  const [hasDuplicateDetectionLoaded, setHasDuplicateDetectionLoaded] = useState(false);
  const [isTogglingDuplicateDetection, setIsTogglingDuplicateDetection] = useState(false);
  const [duplicateDetectionThreshold, setDuplicateDetectionThreshold] = useState(0.82);
  const [duplicateDetectionScope, setDuplicateDetectionScope] = useState<TDuplicateDetectionScope>("project");
  const [isSavingDuplicateDetectionSettings, setIsSavingDuplicateDetectionSettings] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Category 9 feature 6's own extra knobs - kept as local state (synced
  // from `currentWorkspace` below) so number inputs aren't fired off to the
  // backend on every keystroke; saved together via a single small Save
  // button, same UX shape as the LLM connection form above.
  const [dataScope, setDataScope] = useState<TWorkspaceAIUpdateDataScope>("TITLES_STATES_ONLY");
  const [maxRegenerations, setMaxRegenerations] = useState(5);
  const [dailyGenerationLimit, setDailyGenerationLimit] = useState(50);
  const [isSavingUpdateDraftSettings, setIsSavingUpdateDraftSettings] = useState(false);

  // Category 9, feature 5 - "Digest periodique automatise" admin controls.
  // `digest_feature_enabled` is a plain workspace-wide kill-switch,
  // independent of whether AI is configured at all (the digest still works
  // in TEMPLATE mode with no LLM), so it lives in its own dedicated
  // endpoint/service (`WorkspaceDigestSettingsService`) rather than through
  // `useWorkspace()`/`updateWorkspace()` - same reasoning as duplicate
  // detection's own config above. `is_digest_llm_enrichment_enabled` IS an
  // AI-gated feature and is rendered as an ordinary `AIFeatureToggleRow`
  // below, disabled the same way as the other four rows.
  const [digestSettings, setDigestSettings] = useState<TWorkspaceDigestSettings | null>(null);
  const [hasDigestSettingsLoaded, setHasDigestSettingsLoaded] = useState(false);
  const [isTogglingDigestFeature, setIsTogglingDigestFeature] = useState(false);
  const [isTogglingDigestLlmEnrichment, setIsTogglingDigestLlmEnrichment] = useState(false);

  // Category 9, feature 3 - "Assistant de chat IA in-app". Unlike
  // `is_ai_triage_enabled` above, this feature's workspace master switch
  // has its OWN dedicated Admin-only endpoint (paired with the
  // per-user-per-hour rate limit field on that same resource) - see
  // `AIAssistantConfigService`'s own docstring - so, like duplicate
  // detection/digest above, it's tracked as separate local state rather
  // than read/written through `useWorkspace()`.
  const [assistantConfig, setAssistantConfig] = useState<TWorkspaceAIAssistantConfig | null>(null);
  const [hasAssistantConfigLoaded, setHasAssistantConfigLoaded] = useState(false);
  const [isTogglingAssistant, setIsTogglingAssistant] = useState(false);
  const [assistantMaxMessagesPerHour, setAssistantMaxMessagesPerHour] = useState(20);
  const [isSavingAssistantSettings, setIsSavingAssistantSettings] = useState(false);

  useEffect(() => {
    setDataScope(currentWorkspace?.ai_update_data_scope ?? "TITLES_STATES_ONLY");
    setMaxRegenerations(currentWorkspace?.max_ai_update_regenerations ?? 5);
    setDailyGenerationLimit(currentWorkspace?.ai_update_daily_generation_limit ?? 50);
  }, [
    currentWorkspace?.ai_update_data_scope,
    currentWorkspace?.max_ai_update_regenerations,
    currentWorkspace?.ai_update_daily_generation_limit,
  ]);

  useEffect(() => {
    let cancelled = false;
    aiConfigService
      .getConfig(workspaceSlug)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        if (data.provider) setProvider(data.provider);
        setModelName(data.model_name ?? "");
        setApiBaseUrl(data.api_base_url ?? "");
        setIsEnabled(!!data.is_enabled);
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
  }, [workspaceSlug]);

  useEffect(() => {
    let cancelled = false;
    duplicateDetectionConfigService
      .getWorkspaceConfig(workspaceSlug)
      .then((data) => {
        if (cancelled) return;
        setDuplicateDetectionConfig(data);
        setDuplicateDetectionThreshold(data.duplicate_detection_similarity_threshold);
        setDuplicateDetectionScope(data.duplicate_detection_scope);
        return;
      })
      .catch(() => {
        if (!cancelled) setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
      })
      .finally(() => {
        if (!cancelled) setHasDuplicateDetectionLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  useEffect(() => {
    let cancelled = false;
    workspaceDigestSettingsService
      .getSettings(workspaceSlug)
      .then((data) => {
        if (cancelled) return;
        setDigestSettings(data);
        return;
      })
      .catch(() => {
        if (!cancelled) setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("digest.admin.error") });
      })
      .finally(() => {
        if (!cancelled) setHasDigestSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  useEffect(() => {
    let cancelled = false;
    aiAssistantConfigService
      .getWorkspaceConfig(workspaceSlug)
      .then((data) => {
        if (cancelled) return;
        setAssistantConfig(data);
        setAssistantMaxMessagesPerHour(data.ai_assistant_max_messages_per_user_per_hour);
        return;
      })
      .catch(() => {
        if (!cancelled) setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
      })
      .finally(() => {
        if (!cancelled) setHasAssistantConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  const handleSave = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const updated = await aiConfigService.updateConfig(workspaceSlug, {
        provider,
        model_name: modelName,
        api_base_url: apiBaseUrl || null,
        is_enabled: isEnabled,
        // Write-only, and only sent if the admin actually typed something -
        // an empty field leaves whatever key is already stored untouched
        // (see `AIConfigService.updateConfig`'s own docstring).
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setConfig(updated);
      setApiKey("");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: t("ai.toast.save_success") });
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("ai.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await aiConfigService.testConfig(workspaceSlug, {
        provider,
        model_name: modelName,
        api_base_url: apiBaseUrl || null,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setTestResult({
        success: result.success,
        message: result.success ? t("ai.test_connection.success") : result.error || t("ai.test_connection.error"),
      });
    } catch {
      setTestResult({ success: false, message: t("ai.test_connection.error") });
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleSummary = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingSummary(true);
    try {
      await updateWorkspace(workspaceSlug, { is_ai_summary_enabled: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsTogglingSummary(false);
    }
  };

  const handleToggleUpdateDraft = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingUpdateDraft(true);
    try {
      await updateWorkspace(workspaceSlug, { is_ai_update_draft_enabled: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsTogglingUpdateDraft(false);
    }
  };

  const handleToggleTriage = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingTriage(true);
    try {
      await updateWorkspace(workspaceSlug, { is_ai_triage_enabled: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsTogglingTriage(false);
    }
  };

  const handleSaveUpdateDraftSettings = async () => {
    if (!workspaceSlug) return;
    setIsSavingUpdateDraftSettings(true);
    try {
      await updateWorkspace(workspaceSlug, {
        ai_update_data_scope: dataScope,
        max_ai_update_regenerations: maxRegenerations,
        ai_update_daily_generation_limit: dailyGenerationLimit,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: t("ai.update_draft_settings.save_success") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsSavingUpdateDraftSettings(false);
    }
  };

  const handleToggleDuplicateDetection = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingDuplicateDetection(true);
    try {
      const updated = await duplicateDetectionConfigService.updateWorkspaceConfig(workspaceSlug, {
        is_duplicate_detection_enabled: value,
      });
      setDuplicateDetectionConfig(updated);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsTogglingDuplicateDetection(false);
    }
  };

  const handleSaveDuplicateDetectionSettings = async () => {
    if (!workspaceSlug) return;
    setIsSavingDuplicateDetectionSettings(true);
    try {
      const updated = await duplicateDetectionConfigService.updateWorkspaceConfig(workspaceSlug, {
        duplicate_detection_similarity_threshold: duplicateDetectionThreshold,
        duplicate_detection_scope: duplicateDetectionScope,
      });
      setDuplicateDetectionConfig(updated);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("ai.duplicate_detection_settings.save_success"),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsSavingDuplicateDetectionSettings(false);
    }
  };

  const handleToggleDigestFeature = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingDigestFeature(true);
    try {
      const updated = await workspaceDigestSettingsService.updateSettings(workspaceSlug, {
        digest_feature_enabled: value,
      });
      setDigestSettings(updated);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("digest.admin.error") });
    } finally {
      setIsTogglingDigestFeature(false);
    }
  };

  const handleToggleDigestLlmEnrichment = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingDigestLlmEnrichment(true);
    try {
      const updated = await workspaceDigestSettingsService.updateSettings(workspaceSlug, {
        is_digest_llm_enrichment_enabled: value,
      });
      setDigestSettings(updated);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("digest.admin.error") });
    } finally {
      setIsTogglingDigestLlmEnrichment(false);
    }
  };

  const handleToggleAssistant = async (value: boolean) => {
    if (!workspaceSlug) return;
    setIsTogglingAssistant(true);
    try {
      const updated = await aiAssistantConfigService.updateWorkspaceConfig(workspaceSlug, {
        is_ai_assistant_enabled: value,
      });
      setAssistantConfig(updated);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsTogglingAssistant(false);
    }
  };

  const handleSaveAssistantSettings = async () => {
    if (!workspaceSlug) return;
    setIsSavingAssistantSettings(true);
    try {
      const updated = await aiAssistantConfigService.updateWorkspaceConfig(workspaceSlug, {
        ai_assistant_max_messages_per_user_per_hour: assistantMaxMessagesPerHour,
      });
      setAssistantConfig(updated);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("ai.assistant_settings.save_success"),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
    } finally {
      setIsSavingAssistantSettings(false);
    }
  };

  // Admin-only trigger for the existing `backfill_issue_embeddings_batch`
  // task (see `DuplicateDetectionConfigService.triggerBackfill`'s own
  // docstring) - the endpoint only ever enqueues the task and returns a
  // plain confirmation string, there is no job id or progress to poll, so
  // this deliberately shows nothing more than a toast (no fake progress
  // bar the backend can't actually feed).
  const handleBackfill = async () => {
    if (!workspaceSlug) return;
    setIsBackfilling(true);
    try {
      await duplicateDetectionConfigService.triggerBackfill(workspaceSlug);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("ai.duplicate_detection_settings.backfill_started"),
      });
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: err?.error ?? t("ai.toast.error") });
    } finally {
      setIsBackfilling(false);
    }
  };

  const isConfiguredAndEnabled = !!(config?.is_configured && config?.is_enabled);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-md border border-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="text-14 font-medium text-primary">{t("ai.fields.enabled")}</h5>
            {config?.is_configured && <p className="text-13 text-tertiary">{t("ai.fields.api_key_configured")}</p>}
          </div>
          <ToggleSwitch value={isEnabled} onChange={setIsEnabled} disabled={!hasLoaded} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">{t("ai.provider.label")}</span>
            <CustomSelect
              value={provider}
              label={t(`ai.provider.${provider}`)}
              onChange={(value: TWorkspaceAIProvider) => setProvider(value)}
              input
              disabled={!hasLoaded}
            >
              {PROVIDER_KEYS.map((key) => (
                <CustomSelect.Option key={key} value={key}>
                  {t(`ai.provider.${key}`)}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">{t("ai.fields.model_name")}</span>
            <Input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gpt-4o-mini"
              disabled={!hasLoaded}
              inputSize="sm"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-secondary">{t("ai.fields.api_base_url")}</span>
            <Input
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://my-self-hosted-endpoint.internal/v1"
              disabled={!hasLoaded}
              inputSize="sm"
            />
            <span className="text-12 text-tertiary">{t("ai.fields.api_base_url_hint")}</span>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-secondary">{t("ai.fields.api_key")}</span>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("ai.fields.api_key_placeholder")}
              disabled={!hasLoaded}
              inputSize="sm"
            />
          </div>
        </div>

        {testResult && (
          <p className={`text-13 ${testResult.success ? "text-success" : "text-danger"}`}>{testResult.message}</p>
        )}

        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={!hasLoaded}>
            {t("save")}
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            onClick={handleTest}
            loading={isTesting}
            disabled={!hasLoaded || !modelName}
          >
            {t("ai.test_connection.label")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h5 className="text-14 font-medium text-primary">{t("ai.features.title")}</h5>
          <p className="text-13 text-tertiary">{t("ai.features.description")}</p>
        </div>
        <AIFeatureToggleRow
          key="thread_summary"
          label={t("ai.features.thread_summary.label")}
          description={t("ai.features.thread_summary.description")}
          value={!!currentWorkspace?.is_ai_summary_enabled}
          onChange={handleToggleSummary}
          disabled={!isConfiguredAndEnabled}
          disabledTooltip={t("ai.features.thread_summary.disabled_tooltip")}
          isSaving={isTogglingSummary}
        />
        <AIFeatureToggleRow
          key="update_draft"
          label={t("ai.features.update_draft.label")}
          description={t("ai.features.update_draft.description")}
          value={!!currentWorkspace?.is_ai_update_draft_enabled}
          onChange={handleToggleUpdateDraft}
          disabled={!isConfiguredAndEnabled}
          disabledTooltip={t("ai.features.update_draft.disabled_tooltip")}
          isSaving={isTogglingUpdateDraft}
        />
        <AIFeatureToggleRow
          key="ai_triage"
          label={t("ai.features.triage.label")}
          description={t("ai.features.triage.description")}
          value={!!currentWorkspace?.is_ai_triage_enabled}
          onChange={handleToggleTriage}
          disabled={!isConfiguredAndEnabled}
          disabledTooltip={t("ai.features.triage.disabled_tooltip")}
          isSaving={isTogglingTriage}
        />
        <AIFeatureToggleRow
          key="duplicate_detection"
          label={t("ai.features.duplicate_detection.label")}
          description={t("ai.features.duplicate_detection.description")}
          value={!!duplicateDetectionConfig?.is_duplicate_detection_enabled}
          onChange={handleToggleDuplicateDetection}
          disabled={!isConfiguredAndEnabled || !hasDuplicateDetectionLoaded}
          disabledTooltip={t("ai.features.duplicate_detection.disabled_tooltip")}
          isSaving={isTogglingDuplicateDetection}
        />
        <AIFeatureToggleRow
          key="digest_llm_enrichment"
          label={t("ai.features.digest_llm_enrichment.label")}
          description={t("ai.features.digest_llm_enrichment.description")}
          value={!!digestSettings?.is_digest_llm_enrichment_enabled}
          onChange={handleToggleDigestLlmEnrichment}
          disabled={!isConfiguredAndEnabled || !hasDigestSettingsLoaded}
          disabledTooltip={t("ai.features.digest_llm_enrichment.disabled_tooltip")}
          isSaving={isTogglingDigestLlmEnrichment}
        />
        <AIFeatureToggleRow
          key="ai_assistant"
          label={t("ai.features.assistant.label")}
          description={t("ai.features.assistant.description")}
          value={!!assistantConfig?.is_ai_assistant_enabled}
          onChange={handleToggleAssistant}
          disabled={!isConfiguredAndEnabled || !hasAssistantConfigLoaded}
          disabledTooltip={t("ai.features.assistant.disabled_tooltip")}
          isSaving={isTogglingAssistant}
        />

        <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
          <div>
            <h5 className="text-13 font-medium text-primary">{t("ai.assistant_settings.title")}</h5>
            <p className="text-12 text-tertiary">{t("ai.assistant_settings.description")}</p>
          </div>
          <div className="flex flex-col gap-1 sm:w-1/2">
            <span className="text-13 text-secondary">{t("ai.assistant_settings.max_messages_per_hour")}</span>
            <Input
              type="number"
              min={0}
              value={assistantMaxMessagesPerHour}
              onChange={(e) => setAssistantMaxMessagesPerHour(Number(e.target.value))}
              disabled={!hasAssistantConfigLoaded}
              inputSize="sm"
            />
          </div>
          <div>
            <Button
              variant="neutral-primary"
              size="sm"
              onClick={handleSaveAssistantSettings}
              loading={isSavingAssistantSettings}
              disabled={!hasAssistantConfigLoaded}
            >
              {t("save")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
          <div>
            <h5 className="text-13 font-medium text-primary">{t("digest.admin.title")}</h5>
            <p className="text-12 text-tertiary">{t("digest.admin.description")}</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-13 text-secondary">{t("digest.admin.feature_enabled_label")}</span>
              <span className="text-12 text-tertiary">{t("digest.admin.feature_enabled_hint")}</span>
            </div>
            <ToggleSwitch
              value={!!digestSettings?.digest_feature_enabled}
              onChange={handleToggleDigestFeature}
              disabled={!hasDigestSettingsLoaded || isTogglingDigestFeature}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
          <div>
            <h5 className="text-13 font-medium text-primary">{t("ai.duplicate_detection_settings.title")}</h5>
            <p className="text-12 text-tertiary">{t("ai.duplicate_detection_settings.description")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-13 text-secondary">{t("ai.duplicate_detection_settings.threshold_label")}</span>
              <span className="text-12 text-tertiary">{Math.round(duplicateDetectionThreshold * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={duplicateDetectionThreshold}
              onChange={(e) => setDuplicateDetectionThreshold(Number(e.target.value))}
              disabled={!hasDuplicateDetectionLoaded}
              className="accent-accent-primary h-1.5 w-full cursor-pointer disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">{t("ai.duplicate_detection_settings.scope_label")}</span>
            <CustomSelect
              value={duplicateDetectionScope}
              label={t(DUPLICATE_DETECTION_SCOPE_I18N_KEYS[duplicateDetectionScope])}
              onChange={(value: TDuplicateDetectionScope) => setDuplicateDetectionScope(value)}
              input
              disabled={!hasDuplicateDetectionLoaded}
            >
              {DUPLICATE_DETECTION_SCOPE_KEYS.map((key) => (
                <CustomSelect.Option key={key} value={key}>
                  {t(DUPLICATE_DETECTION_SCOPE_I18N_KEYS[key])}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="neutral-primary"
              size="sm"
              onClick={handleSaveDuplicateDetectionSettings}
              loading={isSavingDuplicateDetectionSettings}
              disabled={!hasDuplicateDetectionLoaded}
            >
              {t("save")}
            </Button>
          </div>

          <div className="flex flex-col gap-1 border-t border-subtle pt-3">
            <span className="text-13 text-secondary">{t("ai.duplicate_detection_settings.backfill_label")}</span>
            <p className="text-12 text-tertiary">{t("ai.duplicate_detection_settings.backfill_description")}</p>
            <div>
              <Button
                variant="neutral-primary"
                size="sm"
                onClick={handleBackfill}
                loading={isBackfilling}
                disabled={!hasDuplicateDetectionLoaded}
              >
                {t("ai.duplicate_detection_settings.backfill_button")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
          <div>
            <h5 className="text-13 font-medium text-primary">{t("ai.update_draft_settings.title")}</h5>
            <p className="text-12 text-tertiary">{t("ai.update_draft_settings.description")}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-13 text-secondary">{t("ai.update_draft_settings.data_scope.label")}</span>
              <CustomSelect
                value={dataScope}
                label={t(DATA_SCOPE_I18N_KEYS[dataScope])}
                onChange={(value: TWorkspaceAIUpdateDataScope) => setDataScope(value)}
                input
              >
                {DATA_SCOPE_KEYS.map((key) => (
                  <CustomSelect.Option key={key} value={key}>
                    {t(DATA_SCOPE_I18N_KEYS[key])}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 text-secondary">{t("ai.update_draft_settings.max_regenerations")}</span>
              <Input
                type="number"
                min={1}
                value={maxRegenerations}
                onChange={(e) => setMaxRegenerations(Number(e.target.value))}
                inputSize="sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 text-secondary">{t("ai.update_draft_settings.daily_generation_limit")}</span>
              <Input
                type="number"
                min={1}
                value={dailyGenerationLimit}
                onChange={(e) => setDailyGenerationLimit(Number(e.target.value))}
                inputSize="sm"
              />
            </div>
          </div>

          <div>
            <Button
              variant="neutral-primary"
              size="sm"
              onClick={handleSaveUpdateDraftSettings}
              loading={isSavingUpdateDraftSettings}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
