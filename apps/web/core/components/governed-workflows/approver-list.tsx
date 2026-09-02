/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plus, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button, Checkbox, CustomSelect } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// local imports
import { APPROVER_ROLE_LABELS, APPROVER_ROLE_OPTIONS } from "./constants";
import type { TLocalWorkflowTransitionApprover } from "./types";

type Props = {
  projectId: string;
  approvers: TLocalWorkflowTransitionApprover[];
  onChange: (approvers: TLocalWorkflowTransitionApprover[]) => void;
};

const emptyApprover = (): TLocalWorkflowTransitionApprover => ({
  member: null,
  role: null,
  approval_required: false,
  _key: `local-approver-${Date.now()}-${Math.random().toString(36).slice(2)}`,
});

/**
 * Restricts who may execute (or approve) this transition - exigence 5/6 of
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations") in plane-selfhost. No rows at all =
 * unrestricted (anyone who reaches the transition can execute it directly,
 * subject only to the conditions below).
 *
 * `approval_required` is a per-ROW toggle, not a per-transition one - see
 * `WorkflowTransitionApprover`'s own docstring
 * (apps/api/plane/db/models/workflow_transition.py) for the resolved
 * semantics this UI must communicate honestly: a row with "Needs approval"
 * OFF grants that member/role DIRECT execution rights (skips approval
 * entirely for them), even if another row on the same transition has it ON.
 * The common "everyone must request approval" setup is simply every row
 * having it ON and none OFF - there is no separate "make the whole
 * transition approval-only" switch, by design.
 */
export function ApproverList(props: Props) {
  const { projectId, approvers, onChange } = props;
  const { t } = useTranslation();

  const updateApprover = (index: number, patch: Partial<TLocalWorkflowTransitionApprover>) => {
    onChange(approvers.map((approver, i) => (i === index ? Object.assign({}, approver, patch) : approver)));
  };

  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-13 font-medium text-secondary">{t("governed_workflows.approvers.heading")}</h5>
      {approvers.length === 0 && (
        <p className="text-12 text-tertiary">{t("governed_workflows.approvers.empty_state")}</p>
      )}
      {approvers.map((approver, index) => (
        <div key={approver._key} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
          <CustomSelect
            value={approver.member ? "member" : "role"}
            label={approver.member ? t("governed_workflows.approvers.specific_member") : t("role")}
            onChange={(value: "member" | "role") =>
              updateApprover(index, value === "member" ? { role: null } : { member: null })
            }
            input
          >
            <CustomSelect.Option value="role">{t("role")}</CustomSelect.Option>
            <CustomSelect.Option value="member">
              {t("governed_workflows.approvers.specific_member")}
            </CustomSelect.Option>
          </CustomSelect>

          {approver.member !== null ? (
            <MemberDropdown
              projectId={projectId}
              multiple={false}
              value={approver.member}
              onChange={(value) => updateApprover(index, { member: value })}
              buttonVariant="border-with-text"
              placeholder={t("governed_workflows.approvers.choose_member")}
            />
          ) : (
            <CustomSelect
              value={approver.role ?? ""}
              label={
                approver.role !== null
                  ? APPROVER_ROLE_LABELS[approver.role]
                  : t("governed_workflows.approvers.choose_role")
              }
              onChange={(value: number) => updateApprover(index, { role: value })}
              input
            >
              {APPROVER_ROLE_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          )}

          <label
            htmlFor={`workflow-transition-approver-required-${approver._key}`}
            className="flex shrink-0 items-center gap-1.5 text-12 text-secondary"
          >
            <Checkbox
              id={`workflow-transition-approver-required-${approver._key}`}
              checked={approver.approval_required}
              onChange={(event) => updateApprover(index, { approval_required: event.target.checked })}
            />
            {t("governed_workflows.approvers.needs_approval")}
          </label>

          <button
            type="button"
            onClick={() => onChange(approvers.filter((_, i) => i !== index))}
            className="ml-auto shrink-0 rounded-sm p-1 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        variant="link-primary"
        size="sm"
        className="w-fit"
        prependIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => onChange([...approvers, emptyApprover()])}
      >
        {t("governed_workflows.approvers.add_approver")}
      </Button>
    </div>
  );
}
