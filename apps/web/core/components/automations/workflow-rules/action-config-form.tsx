/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TIssuePriorities, TWorkflowAction, TWorkflowActionConfig } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";
// local imports
import { TemplateTokenTextarea } from "./template-token-textarea";

type Props = {
  projectId: string;
  action: TWorkflowAction;
  onChange: (patch: Partial<TWorkflowAction>) => void;
};

/** Per `action_type` config sub-form, matching the exact `action_config`
 * shapes documented for the backend (apps/api/plane/app/serializers/workflow_rule.py
 * stores this as a plain JSON field, so shape validation is a UI-only
 * concern here). */
export function ActionConfigForm(props: Props) {
  const { projectId, action, onChange } = props;
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action_config is a per-action_type union; each branch below only ever accesses the keys valid for its own type.
  const config = (action.action_config ?? {}) as any;
  const setConfig = (patch: Record<string, unknown>) =>
    onChange({ action_config: { ...config, ...patch } as TWorkflowActionConfig });

  switch (action.action_type) {
    case "SET_STATE":
      return (
        <StateDropdown
          projectId={projectId}
          value={config.state_id ?? null}
          onChange={(value) => setConfig({ state_id: value })}
          buttonVariant="border-with-text"
        />
      );

    case "SET_PRIORITY":
      return (
        <PriorityDropdown
          value={(config.priority as TIssuePriorities) ?? "none"}
          onChange={(value) => setConfig({ priority: value })}
          buttonVariant="border-with-text"
        />
      );

    case "SET_ASSIGNEES":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <MemberDropdown
            projectId={projectId}
            multiple
            value={config.assignee_ids ?? []}
            onChange={(value) => setConfig({ assignee_ids: value })}
            buttonVariant="border-with-text"
            placeholder={t("assignees")}
          />
          <CustomSelect
            value={config.mode ?? "replace"}
            label={
              config.mode === "add"
                ? t("workflow_rules.action_config.add_to_existing")
                : t("workflow_rules.action_config.replace_existing")
            }
            onChange={(value: string) => setConfig({ mode: value })}
            input
          >
            <CustomSelect.Option value="replace">
              {t("workflow_rules.action_config.replace_existing_assignees")}
            </CustomSelect.Option>
            <CustomSelect.Option value="add">
              {t("workflow_rules.action_config.add_to_existing_assignees")}
            </CustomSelect.Option>
          </CustomSelect>
        </div>
      );

    case "ADD_LABELS":
    case "REMOVE_LABELS":
      return (
        <LabelDropdown
          projectId={projectId}
          value={config.label_ids ?? []}
          onChange={(value) => setConfig({ label_ids: value })}
          label={
            <span>
              {(config.label_ids?.length ?? 0) > 0
                ? t("workflow_rules.action_config.labels_selected_count", {
                    count: config.label_ids.length,
                  })
                : t("workflow_rules.action_config.choose_labels")}
            </span>
          }
        />
      );

    case "SET_DUE_DATE":
    case "SET_START_DATE": {
      const mode = config.mode ?? "fixed";
      return (
        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            value={mode}
            label={
              mode === "relative"
                ? t("workflow_rules.action_config.relative_to_trigger")
                : t("workflow_rules.action_config.fixed_date")
            }
            onChange={(value: "fixed" | "relative") =>
              setConfig(
                value === "relative"
                  ? { mode: "relative", days_from_trigger: config.days_from_trigger ?? 1, date: undefined }
                  : {
                      mode: "fixed",
                      date: config.date ?? renderFormattedPayloadDate(new Date()),
                      days_from_trigger: undefined,
                    }
              )
            }
            input
          >
            <CustomSelect.Option value="fixed">{t("workflow_rules.action_config.fixed_date")}</CustomSelect.Option>
            <CustomSelect.Option value="relative">
              {t("workflow_rules.action_config.relative_to_trigger")}
            </CustomSelect.Option>
          </CustomSelect>
          {mode === "relative" ? (
            <div className="flex items-center gap-1.5 text-13 text-secondary">
              <Input
                type="number"
                min={0}
                inputSize="sm"
                className="w-16"
                value={config.days_from_trigger ?? 0}
                onChange={(event) => setConfig({ days_from_trigger: Number(event.target.value) })}
              />
              {t("workflow_rules.action_config.days_from_trigger")}
            </div>
          ) : (
            <DateDropdown
              value={getDate(config.date) ?? null}
              onChange={(date) => setConfig({ date: renderFormattedPayloadDate(date) })}
              buttonVariant="border-with-text"
            />
          )}
        </div>
      );
    }

    case "POST_COMMENT":
      return (
        <TemplateTokenTextarea
          value={config.comment_template ?? ""}
          onChange={(value) => setConfig({ comment_template: value })}
        />
      );

    case "MENTION_USER":
      return (
        <div className="flex flex-col gap-2">
          <MemberDropdown
            projectId={projectId}
            multiple={false}
            value={config.user_id ?? null}
            onChange={(value) => setConfig({ user_id: value })}
            buttonVariant="border-with-text"
            placeholder={t("workflow_rules.action_config.user_to_mention")}
          />
          <TemplateTokenTextarea
            value={config.comment_template ?? ""}
            onChange={(value) => setConfig({ comment_template: value })}
          />
        </div>
      );

    default:
      return null;
  }
}
