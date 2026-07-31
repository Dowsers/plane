/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
import { ArrowDown, ArrowUp, Pencil, Play, Trash2 } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTriageRule, TTriageRuleDryRunMatch } from "@plane/types";
import { Button, Loader, ToggleSwitch } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// services
import { TriageRuleService } from "@/services/inbox";
// local imports
import { TriageRuleFormModal } from "./rule-form-modal";

const triageRuleService = new TriageRuleService();

const RULES_KEY = (workspaceSlug: string, projectId: string) => `TRIAGE_RULES_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  SET_PRIORITY: "priorité",
  SET_LABELS: "labels",
  SET_ASSIGNEES: "assignés",
  SET_STATE: "état",
};

export const TriageRulesRoot = observer(function TriageRulesRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const [editingRule, setEditingRule] = useState<TTriageRule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dryRunResults, setDryRunResults] = useState<{ ruleId: string; matches: TTriageRuleDryRunMatch[] } | null>(
    null
  );
  const [isReapplying, setIsReapplying] = useState(false);

  const { data: rules } = useSWR(
    canView ? RULES_KEY(workspaceSlug, projectId) : null,
    canView ? () => triageRuleService.list(workspaceSlug, projectId) : null
  );

  if (!canView) return null;

  const refresh = () => mutate(RULES_KEY(workspaceSlug, projectId));

  const handleToggleActive = async (rule: TTriageRule) => {
    try {
      await triageRuleService.update(workspaceSlug, projectId, rule.id, { is_active: !rule.is_active });
      refresh();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: error?.error ?? "Unable to update the rule." });
    }
  };

  const handleDelete = async (rule: TTriageRule) => {
    try {
      await triageRuleService.remove(workspaceSlug, projectId, rule.id);
      refresh();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to delete the rule." });
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    if (!rules) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const reordered = [...rules];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    mutate(RULES_KEY(workspaceSlug, projectId), reordered, false);

    try {
      await triageRuleService.reorder(
        workspaceSlug,
        projectId,
        reordered.map((r) => r.id)
      );
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to reorder rules." });
    } finally {
      refresh();
    }
  };

  const handleDryRun = async (rule: TTriageRule) => {
    try {
      const response = await triageRuleService.dryRun(workspaceSlug, projectId, rule.id);
      setDryRunResults({ ruleId: rule.id, matches: response.matches });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to test the rule." });
    }
  };

  const handleReapply = async () => {
    setIsReapplying(true);
    try {
      const response = await triageRuleService.reapply(workspaceSlug, projectId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: `${response.applied_count} item(s) mis à jour.`,
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to reapply the rules." });
    } finally {
      setIsReapplying(false);
    }
  };

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <div className="flex items-center justify-between">
        <SettingsHeading
          title="Règles de triage"
          description="Applique automatiquement priorité/labels/assignés/état aux items d'intake entrants."
        />
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="neutral-primary" size="sm" onClick={handleReapply} loading={isReapplying}>
              Réappliquer sur la file
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingRule(null);
                setIsModalOpen(true);
              }}
            >
              Nouvelle règle
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {!rules && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="50px" />
            <Loader.Item height="50px" />
          </Loader>
        )}
        {rules?.length === 0 && <p className="text-13 text-tertiary">Aucune règle de triage configurée.</p>}
        {rules?.map((rule, index) => (
          <div key={rule.id} className="flex flex-col gap-2 rounded-md border border-subtle px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ToggleSwitch value={rule.is_active} onChange={() => handleToggleActive(rule)} disabled={!isAdmin} />
                <span className="text-13 font-medium text-primary">{rule.name}</span>
                {!rule.is_valid && (
                  <span className="bg-danger-component-surface-light text-danger-strong rounded-xs px-1.5 py-0.5 text-11">
                    Règle invalide - action à corriger
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleReorder(index, -1)}
                    className="rounded-sm p-1 hover:bg-layer-1 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === (rules ?? []).length - 1}
                    onClick={() => handleReorder(index, 1)}
                    className="rounded-sm p-1 hover:bg-layer-1 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDryRun(rule)}
                    className="rounded-sm p-1 hover:bg-layer-1"
                    title="Tester"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRule(rule);
                      setIsModalOpen(true);
                    }}
                    className="rounded-sm p-1 hover:bg-layer-1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDelete(rule)} className="rounded-sm p-1 hover:bg-layer-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-12 text-tertiary">
              {rule.conditions.length} condition(s) -{" "}
              {rule.actions.map((a) => ACTION_TYPE_LABELS[a.action_type] ?? a.action_type).join(", ") ||
                "aucune action"}
            </p>
            {dryRunResults?.ruleId === rule.id && (
              <div className="mt-1 flex flex-col gap-1 rounded-sm bg-surface-1 p-2">
                <p className="text-12 font-medium text-secondary">
                  {dryRunResults.matches.length} item(s) en attente correspondent actuellement :
                </p>
                {dryRunResults.matches.slice(0, 10).map((match) => (
                  <p key={match.intake_issue_id} className="text-12 text-tertiary">
                    {match.issue_name}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <TriageRuleFormModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        rule={editingRule}
        onSaved={refresh}
      />
    </section>
  );
});
