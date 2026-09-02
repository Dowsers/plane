/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button, Loader } from "@plane/ui";
import type { TRecurringIssueTemplate } from "@plane/types";
// components
import { SettingsHeading } from "@/components/settings/heading";
// services
import { RecurringIssueTemplateService } from "@/services/recurring-issue-template.service";
// local imports
import { RecurringIssueTemplateGeneratedIssuesPanel } from "./generated-issues-panel";
import { RecurringIssueTemplateFormModal } from "./template-form-modal";
import { RecurringIssueTemplateListItem } from "./template-list-item";

const recurringIssueTemplateService = new RecurringIssueTemplateService();

const TEMPLATES_KEY = (workspaceSlug: string, projectId: string, cursor: string | undefined) =>
  `RECURRING_ISSUE_TEMPLATES_${workspaceSlug}_${projectId}_${cursor ?? ""}`;

const PER_PAGE = 20;

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** Admin/Member - matches the backend's own `WRITE_ROLES`. Guests still
   * see the (read-only) list, since the backend's `READ_ROLES` includes
   * them. */
  canEdit: boolean;
};

/**
 * "Recurring work items" project settings tab - templates that
 * periodically materialize real work items on a schedule. See
 * docs/feature-specs/06-automation-workflow-sla.md ("Work items
 * récurrents", section 3) in plane-selfhost, and the backend half of this
 * feature: apps/api/plane/app/views/recurring_issue_template/base.py.
 *
 * No mobx store here, deliberately - follows the sibling `WorkflowRulesRoot`
 * (apps/web/core/components/automations/workflow-rules/root.tsx, Category 6
 * Feature 1's rule engine) convention of plain service calls + SWR rather
 * than a dedicated store, since this data has no cross-cutting consumers
 * elsewhere in the app (the one place that *would* consume it - a badge on
 * a generated issue's own detail view, linking back to its template - can't
 * be wired up yet: the regular issue serializer doesn't expose
 * `recurring_template`/`recurring_template_name_snapshot`, a backend gap
 * out of scope for this frontend-only task; see the task report).
 */
export function RecurringIssueTemplatesRoot(props: Props) {
  const { workspaceSlug, projectId, canEdit } = props;
  // plane hooks
  const { t } = useTranslation();

  const [editingTemplate, setEditingTemplate] = useState<TRecurringIssueTemplate | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [generatedIssuesTemplate, setGeneratedIssuesTemplate] = useState<TRecurringIssueTemplate | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading } = useSWR(TEMPLATES_KEY(workspaceSlug, projectId, cursor), () =>
    recurringIssueTemplateService.list(workspaceSlug, projectId, { cursor, per_page: PER_PAGE })
  );

  const refresh = () => mutate(TEMPLATES_KEY(workspaceSlug, projectId, cursor));

  return (
    <section className="mt-7 w-full">
      <SettingsHeading
        title={t("recurring_issue_templates.root.title")}
        description={t("recurring_issue_templates.root.description")}
        control={
          canEdit && (
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setEditingTemplate(null);
                setIsFormOpen(true);
              }}
            >
              {t("recurring_issue_templates.root.new_template")}
            </Button>
          )
        }
      />

      <div className="mt-4 flex flex-col gap-2">
        {isLoading && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        )}
        {!isLoading && (data?.results.length ?? 0) === 0 && (
          <p className="text-13 text-tertiary">{t("recurring_issue_templates.root.empty_state")}</p>
        )}
        {data?.results.map((template) => (
          <RecurringIssueTemplateListItem
            key={template.id}
            template={template}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            canEdit={canEdit}
            onEdit={() => {
              setEditingTemplate(template);
              setIsFormOpen(true);
            }}
            onViewGeneratedIssues={() => setGeneratedIssuesTemplate(template)}
            onChanged={refresh}
          />
        ))}
      </div>

      {(data?.prev_page_results || data?.next_page_results) && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data?.prev_page_results || !data?.prev_cursor}
            onClick={() => setCursor(data?.prev_cursor)}
          >
            {t("recurring_issue_templates.root.previous")}
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data?.next_page_results || !data?.next_cursor}
            onClick={() => setCursor(data?.next_cursor)}
          >
            {t("next")}
          </Button>
        </div>
      )}

      <RecurringIssueTemplateFormModal
        isOpen={isFormOpen}
        handleClose={() => setIsFormOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        template={editingTemplate}
        onSaved={refresh}
      />

      {generatedIssuesTemplate && (
        <RecurringIssueTemplateGeneratedIssuesPanel
          isOpen={!!generatedIssuesTemplate}
          handleClose={() => setGeneratedIssuesTemplate(null)}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          template={generatedIssuesTemplate}
        />
      )}
    </section>
  );
}
