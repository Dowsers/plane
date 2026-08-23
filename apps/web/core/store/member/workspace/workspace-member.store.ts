/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { EUserPermissions } from "@plane/constants";
import type { IWorkspaceBulkInviteFormData, IWorkspaceMember, IWorkspaceMemberInvitation } from "@plane/types";
import { isPubliclyVisibleBotActor } from "@plane/utils";
// plane-web constants
// services
import { WorkspaceService } from "@/services/workspace.service";
// types
import type { IRouterStore } from "@/store/router.store";
import type { IUserStore } from "@/store/user";
// store
import type { IMemberRootStore } from "../index.ts";
import type { IWorkspaceMemberFiltersStore } from "./workspace-member-filters.store";
import { WorkspaceMemberFiltersStore } from "./workspace-member-filters.store";
import type { RootStore } from "@/plane-web/store/root.store";

export interface IWorkspaceMembership {
  id: string;
  member: string;
  role: EUserPermissions;
  is_active?: boolean;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - see `IWorkspaceMember.is_owner`'s own
  // comment (packages/types/src/workspace.ts).
  is_owner?: boolean;
}

export interface IWorkspaceMemberStore {
  // observables
  workspaceMemberMap: Record<string, Record<string, IWorkspaceMembership>>;
  workspaceMemberInvitations: Record<string, IWorkspaceMemberInvitation[]>;
  // filters store
  filtersStore: IWorkspaceMemberFiltersStore;
  // computed
  workspaceMemberIds: string[] | null;
  workspaceMemberInvitationIds: string[] | null;
  memberMap: Record<string, IWorkspaceMembership> | null;
  // computed actions
  getWorkspaceMemberIds: (workspaceSlug: string) => string[];
  getFilteredWorkspaceMemberIds: (workspaceSlug: string) => string[];
  getSearchedWorkspaceMemberIds: (searchQuery: string) => string[] | null;
  getSearchedWorkspaceInvitationIds: (searchQuery: string) => string[] | null;
  getWorkspaceMemberDetails: (workspaceMemberId: string) => IWorkspaceMember | null;
  getWorkspaceInvitationDetails: (invitationId: string) => IWorkspaceMemberInvitation | null;
  // fetch actions
  fetchWorkspaceMembers: (workspaceSlug: string) => Promise<IWorkspaceMember[]>;
  fetchWorkspaceMemberInvitations: (workspaceSlug: string) => Promise<IWorkspaceMemberInvitation[]>;
  // crud actions
  updateMember: (workspaceSlug: string, userId: string, data: { role: EUserPermissions }) => Promise<void>;
  removeMemberFromWorkspace: (workspaceSlug: string, userId: string) => Promise<void>;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - transfer real Workspace Owner status.
  transferOwnership: (workspaceSlug: string, newOwnerId: string) => Promise<void>;
  // invite actions
  inviteMembersToWorkspace: (workspaceSlug: string, data: IWorkspaceBulkInviteFormData) => Promise<void>;
  updateMemberInvitation: (
    workspaceSlug: string,
    invitationId: string,
    data: Partial<IWorkspaceMemberInvitation>
  ) => Promise<void>;
  deleteMemberInvitation: (workspaceSlug: string, invitationId: string) => Promise<void>;
  isUserSuspended: (userId: string, workspaceSlug: string) => boolean;
}

export class WorkspaceMemberStore implements IWorkspaceMemberStore {
  // observables
  workspaceMemberMap: {
    [workspaceSlug: string]: Record<string, IWorkspaceMembership>;
  } = {}; // { workspaceSlug: { userId: userDetails } }
  workspaceMemberInvitations: Record<string, IWorkspaceMemberInvitation[]> = {}; // { workspaceSlug: [invitations] }
  // filters store
  filtersStore: IWorkspaceMemberFiltersStore;
  // stores
  routerStore: IRouterStore;
  userStore: IUserStore;
  memberRoot: IMemberRootStore;
  // services
  workspaceService;

  constructor(_memberRoot: IMemberRootStore, _rootStore: RootStore) {
    makeObservable(this, {
      // observables
      workspaceMemberMap: observable,
      workspaceMemberInvitations: observable,
      // computed
      workspaceMemberIds: computed,
      workspaceMemberInvitationIds: computed,
      memberMap: computed,
      // actions
      fetchWorkspaceMembers: action,
      updateMember: action,
      removeMemberFromWorkspace: action,
      transferOwnership: action,
      fetchWorkspaceMemberInvitations: action,
      updateMemberInvitation: action,
      deleteMemberInvitation: action,
    });
    // initialize filters store
    this.filtersStore = new WorkspaceMemberFiltersStore();
    // root store
    this.routerStore = _rootStore.router;
    this.userStore = _rootStore.user;
    this.memberRoot = _memberRoot;
    // services
    this.workspaceService = new WorkspaceService();
  }

  /**
   * @description get the list of all the user ids of all the members of the current workspace
   */
  get workspaceMemberIds() {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;

    return this.getWorkspaceMemberIds(workspaceSlug);
  }

  get memberMap() {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;
    return this.workspaceMemberMap?.[workspaceSlug] ?? {};
  }

  get workspaceMemberInvitationIds() {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;
    return this.workspaceMemberInvitations?.[workspaceSlug]?.map((inv) => inv.id);
  }

  getWorkspaceMemberIds = computedFn((workspaceSlug: string) => {
    let members = Object.values(this.workspaceMemberMap?.[workspaceSlug] ?? {});
    members = sortBy(members, [
      (m) => m.member !== this.userStore?.data?.id,
      (m) => this.memberRoot?.memberMap?.[m.member]?.display_name?.toLowerCase(),
    ]);
    // filter out bots, but keep every publicly-visible bot type visible
    // (category 9, feature 7's `WORKSPACE_AGENT` and, since feature 3,
    // `AI_ASSISTANT_BOT` too - see `isPubliclyVisibleBotActor` for why this
    // can't stay a blanket `is_bot` exclusion: the six category-7
    // integration bots and `WORKSPACE_SEED` must stay hidden, but these two
    // bot types are intentionally as visible as a human member, e.g. in
    // @mention autocomplete).
    const memberIds = members
      .filter((m) => {
        const user = this.memberRoot?.memberMap?.[m.member];
        return isPubliclyVisibleBotActor(user);
      })
      .map((m) => m.member);
    return memberIds;
  });

  /**
   * @description get the filtered and sorted list of all the user ids of all the members of the workspace
   * @param workspaceSlug
   */
  getFilteredWorkspaceMemberIds = computedFn((workspaceSlug: string) => {
    let members = Object.values(this.workspaceMemberMap?.[workspaceSlug] ?? {});
    //filter out bots (except publicly-visible bot types, see above) and inactive members
    members = members.filter((m) => {
      const user = this.memberRoot?.memberMap?.[m.member];
      return isPubliclyVisibleBotActor(user);
    });

    // Use filters store to get filtered member ids
    const memberIds = this.filtersStore.getFilteredMemberIds(
      members,
      this.memberRoot?.memberMap || {},
      (member) => member.member
    );

    return memberIds;
  });

  /**
   * @description get the list of all the user ids that match the search query of all the members of the current workspace
   * @param searchQuery
   */
  getSearchedWorkspaceMemberIds = computedFn((searchQuery: string) => {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;
    const filteredMemberIds = this.getFilteredWorkspaceMemberIds(workspaceSlug);
    if (!filteredMemberIds) return null;
    const searchedWorkspaceMemberIds = filteredMemberIds.filter((userId) => {
      const memberDetails = this.getWorkspaceMemberDetails(userId);
      if (!memberDetails) return false;
      const memberSearchQuery = `${memberDetails.member.first_name} ${memberDetails.member.last_name} ${
        memberDetails.member?.display_name
      } ${memberDetails.member.email ?? ""}`;
      return memberSearchQuery.toLowerCase()?.includes(searchQuery.toLowerCase());
    });
    return searchedWorkspaceMemberIds;
  });

  /**
   * @description get the list of all the invitation ids that match the search query of all the member invitations of the current workspace
   * @param searchQuery
   */
  getSearchedWorkspaceInvitationIds = computedFn((searchQuery: string) => {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;
    const workspaceMemberInvitationIds = this.workspaceMemberInvitationIds;
    if (!workspaceMemberInvitationIds) return null;
    const searchedWorkspaceMemberInvitationIds = workspaceMemberInvitationIds.filter((invitationId) => {
      const invitationDetails = this.getWorkspaceInvitationDetails(invitationId);
      if (!invitationDetails) return false;
      const invitationSearchQuery = `${invitationDetails.email}`;
      return invitationSearchQuery.toLowerCase()?.includes(searchQuery.toLowerCase());
    });
    return searchedWorkspaceMemberInvitationIds;
  });

  /**
   * @description get the details of a workspace member
   * @param userId
   */
  getWorkspaceMemberDetails = computedFn((userId: string) => {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;
    const workspaceMember = this.workspaceMemberMap?.[workspaceSlug]?.[userId];
    if (!workspaceMember) return null;

    const memberDetails: IWorkspaceMember = {
      id: workspaceMember.id,
      role: workspaceMember.role,
      member: this.memberRoot?.memberMap?.[workspaceMember.member],
      is_active: workspaceMember.is_active,
      is_owner: workspaceMember.is_owner,
    };
    return memberDetails;
  });

  /**
   * @description get the details of a workspace member invitation
   * @param workspaceSlug
   * @param memberId
   */
  getWorkspaceInvitationDetails = computedFn((invitationId: string) => {
    const workspaceSlug = this.routerStore.workspaceSlug;
    if (!workspaceSlug) return null;
    const invitationsList = this.workspaceMemberInvitations?.[workspaceSlug];
    if (!invitationsList) return null;

    const invitation = invitationsList.find((inv) => inv.id === invitationId);
    return invitation ?? null;
  });

  /**
   * @description fetch all the members of a workspace
   * @param workspaceSlug
   */
  fetchWorkspaceMembers = async (workspaceSlug: string) =>
    await this.workspaceService.fetchWorkspaceMembers(workspaceSlug).then((response) => {
      runInAction(() => {
        response.forEach((member) => {
          set(this.memberRoot?.memberMap, member.member.id, { ...member.member, joining_date: member.created_at });
          set(this.workspaceMemberMap, [workspaceSlug, member.member.id], {
            id: member.id,
            member: member.member.id,
            role: member.role,
            is_active: member.is_active,
            is_owner: member.is_owner,
          });
        });
      });
      return response;
    });

  /**
   * @description update the role of a workspace member
   * @param workspaceSlug
   * @param userId
   * @param data
   */
  updateMember = async (workspaceSlug: string, userId: string, data: { role: EUserPermissions }) => {
    const memberDetails = this.getWorkspaceMemberDetails(userId);
    if (!memberDetails) throw new Error("Member not found");
    // original data to revert back in case of error
    const originalProjectMemberData = { ...this.workspaceMemberMap?.[workspaceSlug]?.[userId] };
    try {
      runInAction(() => {
        set(this.workspaceMemberMap, [workspaceSlug, userId, "role"], data.role);
      });
      await this.workspaceService.updateWorkspaceMember(workspaceSlug, memberDetails.id, data);
    } catch (error) {
      // revert back to original members in case of error
      runInAction(() => {
        set(this.workspaceMemberMap, [workspaceSlug, userId], originalProjectMemberData);
      });
      throw error;
    }
  };

  /**
   * @description remove a member from workspace
   * @param workspaceSlug
   * @param userId
   */
  removeMemberFromWorkspace = async (workspaceSlug: string, userId: string) => {
    const memberDetails = this.getWorkspaceMemberDetails(userId);
    if (!memberDetails) throw new Error("Member not found");
    await this.workspaceService.deleteWorkspaceMember(workspaceSlug, memberDetails?.id).then(() => {
      runInAction(() => {
        set(this.workspaceMemberMap, [workspaceSlug, userId, "is_active"], false);
      });
      return;
    });
  };

  /**
   * @description transfer real workspace ownership to another Admin
   * (category 11, docs/feature-specs/11-admin-security-sso.md in
   * plane-selfhost, feature 5). `is_owner` is a computed field (compared
   * against `Workspace.owner_id` server-side), so the only reliable way to
   * refresh it client-side for every member row (both the previous and the
   * new owner) is to refetch the member list after the transfer succeeds -
   * there is no single-member field to patch optimistically here.
   * @param workspaceSlug
   * @param newOwnerId
   */
  transferOwnership = async (workspaceSlug: string, newOwnerId: string) => {
    await this.workspaceService.transferWorkspaceOwnership(workspaceSlug, newOwnerId);
    await this.fetchWorkspaceMembers(workspaceSlug);
  };

  /**
   * @description fetch all the member invitations of a workspace
   * @param workspaceSlug
   */
  fetchWorkspaceMemberInvitations = async (workspaceSlug: string) =>
    await this.workspaceService.workspaceInvitations(workspaceSlug).then((response) => {
      runInAction(() => {
        set(this.workspaceMemberInvitations, workspaceSlug, response);
      });
      return response;
    });

  /**
   * @description bulk invite members to a workspace
   * @param workspaceSlug
   * @param data
   */
  inviteMembersToWorkspace = async (workspaceSlug: string, data: IWorkspaceBulkInviteFormData) => {
    const response = await this.workspaceService.inviteWorkspace(workspaceSlug, data);
    await this.fetchWorkspaceMemberInvitations(workspaceSlug);
    return response;
  };

  /**
   * @description update the role of a member invitation
   * @param workspaceSlug
   * @param invitationId
   * @param data
   */
  updateMemberInvitation = async (
    workspaceSlug: string,
    invitationId: string,
    data: Partial<IWorkspaceMemberInvitation>
  ) => {
    const originalMemberInvitations = [...(this.workspaceMemberInvitations?.[workspaceSlug] ?? [])]; // in case of error, we will revert back to original members
    try {
      const memberInvitations = originalMemberInvitations?.map((invitation) => ({
        ...invitation,
        ...(invitation.id === invitationId && data),
      }));
      // optimistic update
      runInAction(() => {
        set(this.workspaceMemberInvitations, workspaceSlug, memberInvitations);
      });
      await this.workspaceService.updateWorkspaceInvitation(workspaceSlug, invitationId, data);
    } catch (error) {
      // revert back to original members in case of error
      runInAction(() => {
        set(this.workspaceMemberInvitations, workspaceSlug, originalMemberInvitations);
      });
      throw error;
    }
  };

  /**
   * @description delete a member invitation
   * @param workspaceSlug
   * @param memberId
   */
  deleteMemberInvitation = async (workspaceSlug: string, invitationId: string) =>
    await this.workspaceService.deleteWorkspaceInvitations(workspaceSlug.toString(), invitationId).then(() => {
      runInAction(() => {
        this.workspaceMemberInvitations[workspaceSlug] = this.workspaceMemberInvitations[workspaceSlug].filter(
          (inv) => inv.id !== invitationId
        );
      });
      return;
    });

  isUserSuspended = computedFn((userId: string, workspaceSlug: string) => {
    if (!workspaceSlug) return false;
    const workspaceMember = this.workspaceMemberMap?.[workspaceSlug]?.[userId];
    return workspaceMember?.is_active === false;
  });
}
