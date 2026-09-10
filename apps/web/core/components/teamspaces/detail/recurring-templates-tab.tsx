/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { Plus } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TRecurringIssueTemplate } from "@plane/types";
import { Button, CustomMenu, Loader } from "@plane/ui";
// components
import { RecurringIssueTemplateFormModal } from "@/components/recurring-issue-templates/template-form-modal";
import { RecurringIssueTemplateGeneratedIssuesPanel } from "@/components/recurring-issue-templates/generated-issues-panel";
import { RecurringIssueTemplateListItem } from "@/components/recurring-issue-templates/template-list-item";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { RecurringIssueTemplateService } from "@/services/recurring-issue-template.service";

const recurringIssueTemplateService = new RecurringIssueTemplateService();
const PER_PAGE = 20;

type Props = {
  teamspaceId: string;
};

type TFormTarget = {
  projectId: string;
  template: TRecurringIssueTemplate | null;
};

const TEMPLATES_KEY = (workspaceSlug: string, teamspaceId: string, cursor: string | undefined) =>
  `TEAMSPACE_RECURRING_ISSUE_TEMPLATES_${workspaceSlug}_${teamspaceId}_${cursor ?? ""}`;

/**
 * Teamspace-level view of Recurring work items (Category 13 follow-up - "par
 * équipe"). A `RecurringIssueTemplate` still belongs to exactly one project
 * (docs/feature-specs/06-automation-workflow-sla.md section 3, exigence 2) -
 * a Teamspace has no "default project" to fall back on (`TeamspaceProject`
 * is a plain many-to-many). So this tab is read-side aggregation only
 * (`RecurringIssueTemplateService.listForTeamspace`, backed by
 * `WorkspaceTeamspaceRecurringIssueTemplatesEndpoint`); "New template" has
 * the user pick which of the Teamspace's own projects (that they can
 * actually create templates in) the template should belong to, then reuses
 * the exact same project-scoped form/list-item/generated-issues components
 * as the project settings page.
 */
export const TeamspaceRecurringTemplatesTab = observer(function TeamspaceRecurringTemplatesTab(props: Props) {
  const { teamspaceId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getTeamspaceProjectsById, fetchTeamspaceDetails } = useTeamspace();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [formTarget, setFormTarget] = useState<TFormTarget | null>(null);
  const [generatedIssuesTemplate, setGeneratedIssuesTemplate] = useState<TRecurringIssueTemplate | null>(null);

  // Ensures `getTeamspaceProjectsById` is populated even if this tab is
  // opened before the "Projects" tab has ever fetched - same
  // fetch-under-a-tab-specific-key convention as the sibling tabs (e.g.
  // `pages-tab.tsx`).
  useSWR(
    workspaceSlug ? ["TEAMSPACE_RECURRING_TEMPLATES_PROJECTS", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspaceDetails(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const { data, isLoading } = useSWR(
    workspaceSlug ? TEMPLATES_KEY(workspaceSlug.toString(), teamspaceId, cursor) : null,
    workspaceSlug
      ? () =>
          recurringIssueTemplateService.listForTeamspace(workspaceSlug.toString(), teamspaceId, {
            cursor,
            per_page: PER_PAGE,
          })
      : null
  );

  const refresh = () => workspaceSlug && mutate(TEMPLATES_KEY(workspaceSlug.toString(), teamspaceId, cursor));

  if (!workspaceSlug) return null;

  const projectLinks = getTeamspaceProjectsById(teamspaceId);
  const projectLabel = (projectId: string) => {
    const link = projectLinks.find((candidate) => candidate.project === projectId);
    return link ? `${link.project_identifier} · ${link.project_name}` : "";
  };
  // Matches the backend's own WRITE_ROLES for this feature (Admin/Member of
  // the *project* the template would belong to) - a Teamspace Lead who
  // isn't a member of a given attached project still can't create templates
  // in it, same as they can't do so from that project's own settings page.
  const writableProjectLinks = projectLinks.filter((link) =>
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug.toString(),
      link.project
    )
  );

  const openCreateForm = (projectId: string) => setFormTarget({ projectId, template: null });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-13 text-secondary">{t("teamspaces.recurring.description")}</p>
        {writableProjectLinks.length === 1 && (
          <Button
            variant="primary"
            size="sm"
            prependIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => openCreateForm(writableProjectLinks[0].project)}
          >
            {t("recurring_issue_templates.root.new_template")}
          </Button>
        )}
        {writableProjectLinks.length > 1 && (
          <CustomMenu
            customButton={
              <Button variant="primary" size="sm" prependIcon={<Plus className="h-3.5 w-3.5" />}>
                {t("recurring_issue_templates.root.new_template")}
              </Button>
            }
            placement="bottom-end"
            closeOnSelect
          >
            {writableProjectLinks.map((link) => (
              <CustomMenu.MenuItem key={link.project} onClick={() => openCreateForm(link.project)}>
                {link.project_identifier} · {link.project_name}
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        )}
        {!isLoading && (data?.results.length ?? 0) === 0 && (
          <p className="py-8 text-center text-13 text-tertiary">{t("teamspaces.recurring.empty_state")}</p>
        )}
        {data?.results.map((template) => (
          <div key={template.id} className="flex flex-col gap-1">
            <span className="text-11 text-tertiary">{projectLabel(template.project)}</span>
            <RecurringIssueTemplateListItem
              template={template}
              workspaceSlug={workspaceSlug.toString()}
              projectId={template.project}
              canEdit={allowPermissions(
                [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
                EUserPermissionsLevel.PROJECT,
                workspaceSlug.toString(),
                template.project
              )}
              onEdit={() => setFormTarget({ projectId: template.project, template })}
              onViewGeneratedIssues={() => setGeneratedIssuesTemplate(template)}
              onChanged={refresh}
            />
          </div>
        ))}
      </div>

      {(data?.prev_page_results || data?.next_page_results) && (
        <div className="mt-1 flex items-center justify-end gap-2">
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

      {formTarget && (
        <RecurringIssueTemplateFormModal
          isOpen={!!formTarget}
          handleClose={() => setFormTarget(null)}
          workspaceSlug={workspaceSlug.toString()}
          projectId={formTarget.projectId}
          template={formTarget.template}
          onSaved={() => {
            setFormTarget(null);
            refresh();
          }}
        />
      )}

      {generatedIssuesTemplate && (
        <RecurringIssueTemplateGeneratedIssuesPanel
          isOpen={!!generatedIssuesTemplate}
          handleClose={() => setGeneratedIssuesTemplate(null)}
          workspaceSlug={workspaceSlug.toString()}
          projectId={generatedIssuesTemplate.project}
          template={generatedIssuesTemplate}
        />
      )}
    </div>
  );
});
