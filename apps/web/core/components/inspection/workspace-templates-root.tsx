/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Check, ChevronDown, FileText, Lock, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TInspectionDocumentKind, TInspectionTemplate, TInspectionTemplateVersion } from "@plane/types";
import { Button, Loader, TextArea, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { InspectionService } from "@/services/inspection.service";
// local imports
import { INSPECTION_KIND_I18N } from "./constants";

const inspectionService = new InspectionService();

type Props = {
  workspaceSlug: string;
};

const ALL_KINDS: TInspectionDocumentKind[] = ["IMPARTIALITY", "CONFIDENTIALITY", "ETHICS_CHARTER"];

const latestVersion = (template: TInspectionTemplate): TInspectionTemplateVersion | undefined =>
  template.versions?.reduce<TInspectionTemplateVersion | undefined>(
    (best, version) => (!best || version.version > best.version ? version : best),
    undefined
  );

/** Newest version first, for the history list. `.sort()` rather than
 * `.toSorted()`: this app compiles against `lib: ES2022`
 * (packages/typescript-config/react-router.json), where `toSorted` does not
 * exist. Mutating is safe - the spread already produced a fresh array. */
const versionsNewestFirst = (template: TInspectionTemplate): TInspectionTemplateVersion[] =>
  // eslint-disable-next-line unicorn/no-array-sort
  [...(template.versions ?? [])].sort((a, b) => b.version - a.version);

const latestPublished = (template: TInspectionTemplate): TInspectionTemplateVersion | undefined =>
  template.versions
    ?.filter((version) => version.is_published)
    .reduce<TInspectionTemplateVersion | undefined>(
      (best, version) => (!best || version.version > best.version ? version : best),
      undefined
    );

/**
 * Workspace Settings > "Inspection documents". Authors the three DEFAULT
 * documents every inspection project inherits (ISO/IEC 17020 §4.1/§4.2):
 * impartiality declaration, confidentiality agreement, mission ethics charter.
 *
 * Backend: `WorkspaceInspectionTemplateEndpoint` /
 * `InspectionTemplateVersionEndpoint` / `InspectionTemplateVersionPublishEndpoint`
 * - Admin only for every verb, matching this page's own route-level gate.
 *
 * The whole editing model here follows one backend invariant that is worth
 * restating, because the UI would otherwise look needlessly awkward: **a
 * published version is immutable**. So the editor only ever writes to a DRAFT,
 * and "revising" a published document means creating a new draft version and
 * publishing that. A signature is only evidence if the text it points at
 * provably cannot have changed afterwards.
 *
 * Creating a template for IMPARTIALITY pre-fills version 1 with the issued
 * 15-question form (server side), so nobody retypes it.
 */
export const WorkspaceInspectionTemplatesRoot = observer(function WorkspaceInspectionTemplatesRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();

  const [templates, setTemplates] = useState<TInspectionTemplate[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [requiresResignature, setRequiresResignature] = useState(true);
  const [busyKind, setBusyKind] = useState<string | null>(null);

  const load = useCallback(() => {
    inspectionService
      .listWorkspaceTemplates(workspaceSlug)
      .then((data) => {
        setTemplates(data);
        return;
      })
      .catch(() => setTemplates([]));
  }, [workspaceSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const byKind = useMemo(() => {
    const map = new Map<TInspectionDocumentKind, TInspectionTemplate>();
    for (const template of templates ?? []) map.set(template.kind, template);
    return map;
  }, [templates]);

  const toast = (error: unknown) =>
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("common.error.label"),
      message: (error as { error?: string })?.error ?? t("common.error.message"),
    });

  const handleCreate = async (kind: TInspectionDocumentKind) => {
    setBusyKind(kind);
    try {
      await inspectionService.createWorkspaceTemplate(workspaceSlug, { kind });
      load();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("workspace_settings.settings.inspection_documents.created"),
      });
    } catch (error) {
      toast(error);
    } finally {
      setBusyKind(null);
    }
  };

  /** Writes the draft body. Creates a new draft version when the latest one is
   * already published - the only way to revise a frozen document. */
  const handleSaveDraft = async (template: TInspectionTemplate) => {
    setBusyKind(template.kind);
    try {
      const latest = latestVersion(template);
      if (latest && !latest.is_published) {
        await inspectionService.updateDraftVersion(workspaceSlug, template.id, latest.id, {
          body: draftBody,
          requires_resignature: requiresResignature,
        });
      } else {
        await inspectionService.createVersion(workspaceSlug, template.id, {
          body: draftBody,
          requires_resignature: requiresResignature,
        });
      }
      load();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("workspace_settings.settings.inspection_documents.draft_saved"),
      });
    } catch (error) {
      toast(error);
    } finally {
      setBusyKind(null);
    }
  };

  const handlePublish = async (template: TInspectionTemplate, version: TInspectionTemplateVersion) => {
    setBusyKind(template.kind);
    try {
      await inspectionService.publishVersion(workspaceSlug, template.id, version.id);
      load();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("workspace_settings.settings.inspection_documents.published_title"),
        // Publishing restarts everyone's grace clock when re-signature is
        // required - a real side effect, so say so rather than a bare "done".
        message: version.requires_resignature
          ? t("workspace_settings.settings.inspection_documents.published_with_resignature")
          : t("workspace_settings.settings.inspection_documents.published_message"),
      });
    } catch (error) {
      toast(error);
    } finally {
      setBusyKind(null);
    }
  };

  const openEditor = (template: TInspectionTemplate) => {
    if (expanded === template.id) {
      setExpanded(null);
      return;
    }
    const latest = latestVersion(template);
    // Seed the editor from the latest version whether it is a draft or
    // published: revising a published text starts from that text.
    setDraftBody(latest?.body ?? "");
    setRequiresResignature(latest?.requires_resignature ?? true);
    setExpanded(template.id);
  };

  if (templates === null) {
    return (
      <Loader className="space-y-4">
        <Loader.Item height="72px" />
        <Loader.Item height="72px" />
        <Loader.Item height="72px" />
      </Loader>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-medium text-primary">
          {t("workspace_settings.settings.inspection_documents.title")}
        </h3>
        <p className="text-sm text-tertiary">{t("workspace_settings.settings.inspection_documents.description")}</p>
      </div>

      <div className="space-y-3">
        {ALL_KINDS.map((kind) => {
          const template = byKind.get(kind);
          const published = template ? latestPublished(template) : undefined;
          const latest = template ? latestVersion(template) : undefined;
          const hasUnpublishedDraft = Boolean(latest && !latest.is_published);
          const isBusy = busyKind === kind;

          return (
            <div key={kind} className="rounded border border-subtle">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-tertiary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">{t(INSPECTION_KIND_I18N[kind])}</p>
                  <p className="text-xs text-tertiary">
                    {published ? (
                      <>
                        {t("workspace_settings.settings.inspection_documents.published_version", {
                          version: published.version,
                        })}
                        {hasUnpublishedDraft
                          ? ` · ${t("workspace_settings.settings.inspection_documents.draft_pending", {
                              version: latest?.version,
                            })}`
                          : null}
                      </>
                    ) : hasUnpublishedDraft ? (
                      t("workspace_settings.settings.inspection_documents.draft_only", {
                        version: latest?.version,
                      })
                    ) : (
                      // Nothing published means no project requires this
                      // document yet - the single most useful thing to say here.
                      t("workspace_settings.settings.inspection_documents.not_created")
                    )}
                  </p>
                </div>

                {template ? (
                  <Button
                    variant="neutral-primary"
                    size="sm"
                    onClick={() => openEditor(template)}
                    appendIcon={
                      <ChevronDown
                        className={cn("size-4 transition-transform", expanded === template.id && "rotate-180")}
                      />
                    }
                  >
                    {t("workspace_settings.settings.inspection_documents.edit")}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    prependIcon={<Plus className="size-4" />}
                    onClick={() => handleCreate(kind)}
                    loading={isBusy}
                    disabled={isBusy}
                  >
                    {t("workspace_settings.settings.inspection_documents.create")}
                  </Button>
                )}
              </div>

              {template && expanded === template.id ? (
                <div className="space-y-4 border-t border-subtle px-4 py-4">
                  {/* States plainly why editing writes to a draft rather than to
                      the live text - otherwise this flow looks like an extra step
                      for no reason. */}
                  <p className="text-xs flex items-start gap-2 rounded bg-surface-2 p-3 text-tertiary">
                    <Lock className="mt-0.5 size-3.5 shrink-0" />
                    {t("workspace_settings.settings.inspection_documents.immutability_notice")}
                  </p>

                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-primary">
                      {t("workspace_settings.settings.inspection_documents.body_label")}
                    </span>
                    <TextArea
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                      rows={10}
                      className="font-mono text-sm w-full"
                      placeholder={t("workspace_settings.settings.inspection_documents.body_placeholder")}
                    />
                  </div>

                  {kind === "IMPARTIALITY" && latest?.questionnaire_schema?.length ? (
                    <p className="text-xs text-tertiary">
                      {t("workspace_settings.settings.inspection_documents.questionnaire_notice", {
                        count: latest.questionnaire_schema.length,
                      })}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {t("workspace_settings.settings.inspection_documents.requires_resignature")}
                      </p>
                      <p className="text-xs text-tertiary">
                        {t("workspace_settings.settings.inspection_documents.requires_resignature_description")}
                      </p>
                    </div>
                    <ToggleSwitch
                      value={requiresResignature}
                      onChange={() => setRequiresResignature((previous) => !previous)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="neutral-primary"
                      size="sm"
                      onClick={() => handleSaveDraft(template)}
                      loading={isBusy}
                      disabled={isBusy}
                    >
                      {hasUnpublishedDraft
                        ? t("workspace_settings.settings.inspection_documents.save_draft")
                        : t("workspace_settings.settings.inspection_documents.save_as_new_version")}
                    </Button>
                    {latest && !latest.is_published ? (
                      <Button
                        variant="primary"
                        size="sm"
                        prependIcon={<Check className="size-4" />}
                        onClick={() => handlePublish(template, latest)}
                        loading={isBusy}
                        disabled={isBusy}
                      >
                        {t("workspace_settings.settings.inspection_documents.publish", {
                          version: latest.version,
                        })}
                      </Button>
                    ) : null}
                  </div>

                  {template.versions?.length ? (
                    <details className="rounded border border-subtle p-3">
                      <summary className="text-sm cursor-pointer font-medium text-secondary">
                        {t("workspace_settings.settings.inspection_documents.history")}
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {versionsNewestFirst(template).map((version) => (
                          <li key={version.id} className="text-xs flex items-center gap-2 text-tertiary">
                            <span className="font-medium text-secondary">v{version.version}</span>
                            {version.is_published
                              ? t("workspace_settings.settings.inspection_documents.published_at", {
                                  date: new Date(version.published_at as string).toLocaleDateString(),
                                })
                              : t("workspace_settings.settings.inspection_documents.draft")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});
