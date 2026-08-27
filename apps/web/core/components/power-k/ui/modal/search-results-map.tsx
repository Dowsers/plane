/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Briefcase, Building2, FileText, Layers, LayoutGrid } from "lucide-react";
// plane imports
import { CommentReplyIcon, ContrastIcon, DiceIcon } from "@plane/propel/icons";
import type {
  IWorkspaceCustomerSearchResult,
  IWorkspaceDefaultSearchResult,
  IWorkspaceIssueCommentSearchResult,
  IWorkspaceIssueSearchResult,
  IWorkspaceMemberSearchResult,
  IWorkspacePageSearchResult,
  IWorkspaceProjectSearchResult,
  IWorkspaceSearchResult,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import { generateWorkItemLink, getFileURL } from "@plane/utils";
// components
import type { TPowerKSearchResultsKeys } from "@/components/power-k/core/types";
// plane web imports
import { SEARCH_RESULTS_GROUPS_MAP_EXTENDED } from "@/plane-web/components/command-palette/power-k/search/search-results-map";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local imports
import { PowerKSearchResultSnippet } from "./search-snippet";

export type TPowerKSearchResultGroupDetails = {
  icon?: React.ComponentType<{ className?: string }>;
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 6 - lets a category (e.g. "member") render a
  // per-item leading visual (an Avatar) built from the item's own data,
  // instead of the single static `icon` component shared by every row of
  // a category.
  renderIcon?: (item: any) => React.ReactNode;
  itemName: (item: any) => React.ReactNode;
  // `workspaceSlug` (new, optional 3rd param) - unlike every other
  // category, a `member` result item carries no `workspace__slug` of its
  // own (see `GlobalSearchEndpoint.filter_members`), so its `path` builder
  // needs the CURRENT route's workspace slug instead (Power-K only ever
  // opens from within a workspace, so this is always available in
  // practice). Existing 2-arg `path` functions stay valid unchanged (a
  // function accepting fewer params is assignable to a type expecting
  // more).
  path: (item: any, projectId: string | undefined, workspaceSlug?: string) => string;
  title: string;
};

export const POWER_K_SEARCH_RESULTS_GROUPS_MAP: Record<TPowerKSearchResultsKeys, TPowerKSearchResultGroupDetails> = {
  cycle: {
    icon: ContrastIcon,
    itemName: (cycle: IWorkspaceDefaultSearchResult) => (
      <p>
        <span className="text-11 text-tertiary">{cycle.project__identifier}</span> {cycle.name}
      </p>
    ),
    path: (cycle: IWorkspaceDefaultSearchResult) =>
      `/${cycle?.workspace__slug}/projects/${cycle?.project_id}/cycles/${cycle?.id}`,
    title: "Cycles",
  },
  issue: {
    itemName: (workItem: IWorkspaceIssueSearchResult) => (
      <div className="flex w-full flex-col gap-0.5 truncate">
        <div className="flex gap-2">
          <IssueIdentifier
            projectId={workItem.project_id}
            issueTypeId={workItem.type_id}
            projectIdentifier={workItem.project__identifier}
            issueSequenceId={workItem.sequence_id}
            size="xs"
          />{" "}
          <span className="truncate">{workItem.name}</span>
        </div>
        {/* Category 12, feature 6, exigence 2/4 - the title itself doesn't
        contain the searched term when `matched_in === "description"`, so
        the excerpt is the only thing that shows the user WHY this issue
        matched. Nothing renders here for the pre-existing "title" case. */}
        {workItem.matched_in === "description" && <PowerKSearchResultSnippet snippet={workItem.snippet} />}
      </div>
    ),
    path: (workItem: IWorkspaceIssueSearchResult) =>
      generateWorkItemLink({
        workspaceSlug: workItem?.workspace__slug,
        projectId: workItem?.project_id,
        issueId: workItem?.id,
        projectIdentifier: workItem.project__identifier,
        sequenceId: workItem?.sequence_id,
      }),
    title: "Work items",
  },
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 6 ("Recherche approfondie dans la Command
  // Palette"), exigence 2/4 - new "Comments" category. Shows the parent
  // issue's identifier/name (same convention as the `issue` category just
  // above) plus the commenting actor's avatar/name and the matched excerpt.
  issue_comment: {
    icon: CommentReplyIcon,
    itemName: (comment: IWorkspaceIssueCommentSearchResult) => (
      <div className="flex w-full min-w-0 items-start gap-2 truncate">
        <Avatar
          src={comment.actor.avatar_url ? getFileURL(comment.actor.avatar_url) : undefined}
          name={comment.actor.display_name}
          size={16}
          className="mt-0.5 flex-shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 truncate">
          <div className="flex items-center gap-2 truncate">
            <IssueIdentifier
              projectId={comment.project_id}
              projectIdentifier={comment.project__identifier}
              issueSequenceId={comment.issue__sequence_id}
              size="xs"
            />
            <span className="truncate">{comment.issue__name}</span>
          </div>
          <PowerKSearchResultSnippet snippet={comment.snippet} />
        </div>
      </div>
    ),
    path: (comment: IWorkspaceIssueCommentSearchResult) =>
      `${generateWorkItemLink({
        workspaceSlug: comment?.workspace__slug,
        projectId: comment?.project_id,
        issueId: comment?.issue_id,
        projectIdentifier: comment.project__identifier,
        sequenceId: comment?.issue__sequence_id,
      })}#comment-${comment?.comment_id}`,
    title: "Comments",
  },
  // Category 12, feature 6, exigence 3 - new "Members" category. Visually
  // reuses the leading-avatar convention already established by the
  // `user_mention` @-mention autocomplete (see `useEditorMention`,
  // apps/web/core/hooks/editor/use-editor-mention.tsx) rather than
  // inventing a new one, plus the member's email (a field that picker
  // never had/needed).
  member: {
    renderIcon: (member: IWorkspaceMemberSearchResult) => (
      <Avatar
        src={member.avatar_url ? getFileURL(member.avatar_url) : undefined}
        name={member.display_name}
        size={20}
        className="flex-shrink-0"
      />
    ),
    itemName: (member: IWorkspaceMemberSearchResult) => (
      <div className="flex min-w-0 flex-col truncate">
        <span className="truncate">{member.display_name}</span>
        <span className="truncate text-11 text-tertiary">{member.email}</span>
      </div>
    ),
    // Category 12, feature 6, § Questions ouvertes #1 - the spec leaves the
    // click-through target genuinely open ("profil en lecture seule" vs.
    // "vue Issues filtree assigne"). This fork already has a read-only,
    // workspace-scoped member profile page (`/:workspaceSlug/profile/:userId`,
    // see apps/web/app/(all)/[workspaceSlug]/(projects)/profile/[userId])
    // reachable by any workspace member (its base "Overview" tab has no
    // role gate - only the assigned/created/subscribed sub-tabs do), so
    // this reuses that existing view rather than building a new filtered
    // Issues page, per the spec's own preference for reusing existing
    // views over creating new ones.
    path: (member: IWorkspaceMemberSearchResult, _projectId: string | undefined, workspaceSlug?: string) =>
      `/${workspaceSlug}/profile/${member?.member_id}`,
    title: "Members",
  },
  issue_view: {
    icon: Layers,
    itemName: (view: IWorkspaceDefaultSearchResult) => (
      <p>
        <span className="text-11 text-tertiary">{view.project__identifier}</span> {view.name}
      </p>
    ),
    path: (view: IWorkspaceDefaultSearchResult) =>
      `/${view?.workspace__slug}/projects/${view?.project_id}/views/${view?.id}`,
    title: "Views",
  },
  module: {
    icon: DiceIcon,
    itemName: (module: IWorkspaceDefaultSearchResult) => (
      <p>
        <span className="text-11 text-tertiary">{module.project__identifier}</span> {module.name}
      </p>
    ),
    path: (module: IWorkspaceDefaultSearchResult) =>
      `/${module?.workspace__slug}/projects/${module?.project_id}/modules/${module?.id}`,
    title: "Modules",
  },
  page: {
    icon: FileText,
    // Category 10, feature 4 ("Wiki workspace en GA") exigence 10 - a
    // distinctive "Wiki" badge on a project-less (`is_global`) page
    // result, in the same identifier-badge slot every other result type
    // above already uses for its own tag (project identifier). This is
    // the exact spot `is_global` was added to `IWorkspacePageSearchResult`
    // for (the backend's `GlobalSearchEndpoint.filter_pages` payload
    // already carried it).
    itemName: (page: IWorkspacePageSearchResult) => (
      <p>
        <span className="text-11 text-tertiary">{page.is_global ? "Wiki" : page.project__identifiers?.[0]}</span>{" "}
        {page.name}
      </p>
    ),
    path: (page: IWorkspacePageSearchResult, projectId: string | undefined) => {
      let redirectProjectId = page?.project_ids?.[0];
      if (!!projectId && page?.project_ids?.includes(projectId)) redirectProjectId = projectId;
      return redirectProjectId
        ? `/${page?.workspace__slug}/projects/${redirectProjectId}/pages/${page?.id}`
        : `/${page?.workspace__slug}/wiki/${page?.id}`;
    },
    title: "Pages",
  },
  project: {
    icon: Briefcase,
    itemName: (project: IWorkspaceProjectSearchResult) => project?.name,
    path: (project: IWorkspaceProjectSearchResult) => `/${project?.workspace__slug}/projects/${project?.id}/issues/`,
    title: "Projects",
  },
  // docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
  // feature 3, exigence 10) in plane-selfhost - new "Customers" category,
  // same shape as `project` above (workspace-scoped, name-only match).
  customer: {
    icon: Building2,
    itemName: (customer: IWorkspaceCustomerSearchResult) => customer?.name,
    path: (customer: IWorkspaceCustomerSearchResult) => `/${customer?.workspace__slug}/customers/${customer?.id}/`,
    title: "Customers",
  },
  workspace: {
    icon: LayoutGrid,
    itemName: (workspace: IWorkspaceSearchResult) => workspace?.name,
    path: (workspace: IWorkspaceSearchResult) => `/${workspace?.slug}/`,
    title: "Workspaces",
  },
  ...SEARCH_RESULTS_GROUPS_MAP_EXTENDED,
};
