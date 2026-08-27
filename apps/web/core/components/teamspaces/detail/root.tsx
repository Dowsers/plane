/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Tab } from "@headlessui/react";
import { CalendarClock, FileText, Layers, ListChecks, RefreshCw } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTeamspaceWritePayload } from "@plane/types";
import { Loader, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// local imports
import { TEAMSPACE_LEAD } from "../constants";
import { TeamspaceQuickActions } from "../quick-actions";
import { TeamspaceCyclesTab } from "./cycles-tab";
import { TeamspaceMembersTab } from "./members-tab";
import { TeamspaceOverviewTab } from "./overview-tab";
import { TeamspacePagesTab } from "./pages-tab";
import { TeamspaceProjectsTab } from "./projects-tab";
import { TeamspaceViewsTab } from "./views-tab";

type Props = {
  teamspaceId: string;
};

const TABS = ["overview", "cycles", "pages", "views", "members", "projects", "info"] as const;
type TTab = (typeof TABS)[number];

const TAB_ICONS: Record<TTab, React.ComponentType<{ className?: string }>> = {
  overview: ListChecks,
  cycles: RefreshCw,
  pages: FileText,
  views: Layers,
  members: ListChecks,
  projects: ListChecks,
  info: CalendarClock,
};

// "Jump into" - spec section 2 UX note ("Jump into", "Team progress", "Team
// relations", "Team stats" per docs.plane.so). All four quick links point
// at tabs of this same detail page rather than a separate cross-project
// issue-list route (no such workspace-level, project-id-filtered route
// exists yet in apps/web/app/routes/core.ts - see final report).
const JUMP_INTO_ITEMS: { key: TTab; i18nKey: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", i18nKey: "teamspaces.jump_into.work_items", Icon: ListChecks },
  { key: "cycles", i18nKey: "teamspaces.jump_into.cycles", Icon: RefreshCw },
  { key: "views", i18nKey: "teamspaces.jump_into.views", Icon: Layers },
  { key: "pages", i18nKey: "teamspaces.jump_into.pages", Icon: FileText },
];

export const TeamspaceDetailRoot = observer(function TeamspaceDetailRoot(props: Props) {
  const { teamspaceId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const router = useAppRouter();
  const { allowPermissions } = useUserPermissions();
  const { data: currentUser } = useUser();
  const { getTeamspaceById, getTeamspaceMembersById, fetchTeamspaceDetails, updateTeamspace } = useTeamspace();

  const [description, setDescription] = useState<string | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_DETAILS", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspaceDetails(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const teamspace = getTeamspaceById(teamspaceId);
  const members = getTeamspaceMembersById(teamspaceId);

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isLead = members.some((member) => member.member === currentUser?.id && member.role === TEAMSPACE_LEAD);
  // Spec section 1, exigence 2 - write access (rename/description/icon,
  // attached projects, member management) reserved to workspace Admins and
  // the Teamspace's own Leads.
  const canModify = isWorkspaceAdmin || isLead;
  const lead = members.find((member) => member.role === TEAMSPACE_LEAD);

  if (isLoading && !teamspace) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="40px" />
        <Loader.Item height="60px" />
        <Loader.Item height="300px" />
      </Loader>
    );
  }

  if (!teamspace || !workspaceSlug) return null;

  const handleFieldChange = async (payload: TTeamspaceWritePayload) => {
    try {
      await updateTeamspace(workspaceSlug.toString(), teamspaceId, payload);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== null && description !== teamspace.description) {
      handleFieldChange({ description });
    }
  };

  const jumpTo = (tabKey: TTab) => setActiveTabIndex(TABS.indexOf(tabKey));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Logo logo={teamspace.logo_props} size={24} />
          <div className="flex flex-col">
            <h2 className="text-20 font-semibold">{teamspace.name}</h2>
            {lead && (
              <span className="text-12 text-secondary">
                {t("teamspaces.lead")}: {lead.member_display_name}
              </span>
            )}
          </div>
        </div>
        <TeamspaceQuickActions teamspace={teamspace} onDeleted={() => router.push(`/${workspaceSlug}/teamspaces/`)} />
      </div>

      {teamspace.description && <p className="text-13 text-secondary">{teamspace.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-13 text-secondary">
        <span>
          {t("teamspaces.members")}: {teamspace.members_count}
        </span>
        <span>
          {t("teamspaces.projects")}: {teamspace.projects_count}
        </span>
      </div>

      {/* "Jump into" - spec section 2, quick access to Work Items / Cycles / Views / Pages */}
      <div className="flex flex-wrap items-center gap-2">
        {JUMP_INTO_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => jumpTo(item.key)}
            className="flex items-center gap-1.5 rounded-md border-[0.5px] border-subtle px-3 py-1.5 text-13 hover:bg-layer-1"
          >
            <item.Icon className="h-3.5 w-3.5 text-tertiary" />
            {t(item.i18nKey)}
          </button>
        ))}
      </div>

      <Tab.Group as={Fragment} selectedIndex={activeTabIndex} onChange={setActiveTabIndex}>
        <Tab.List as="div" className="flex items-center gap-4 border-b border-subtle">
          {TABS.map((key) => {
            const Icon = TAB_ICONS[key];
            return (
              <Tab
                key={key}
                className={({ selected }) =>
                  cn(
                    "flex items-center gap-1.5 border-b-2 border-transparent px-1 pb-2 text-13 font-medium text-secondary focus:outline-none",
                    { "border-accent-primary text-primary": selected }
                  )
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`teamspaces.tabs.${key}`)}
              </Tab>
            );
          })}
        </Tab.List>
        <Tab.Panels as={Fragment}>
          <Tab.Panel as="div" className="pt-4">
            <TeamspaceOverviewTab teamspaceId={teamspaceId} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <TeamspaceCyclesTab teamspaceId={teamspaceId} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <TeamspacePagesTab teamspaceId={teamspaceId} canModify={canModify} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <TeamspaceViewsTab teamspaceId={teamspaceId} canModify={canModify} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <TeamspaceMembersTab teamspaceId={teamspaceId} canModify={canModify} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <TeamspaceProjectsTab teamspaceId={teamspaceId} canModify={canModify} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <TextArea
              value={description ?? teamspace.description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              disabled={!canModify}
              placeholder={t("teamspaces.description")}
              className="w-full"
              rows={6}
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
});
