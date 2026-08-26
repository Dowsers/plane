/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  ITeamspace,
  ITeamspaceMember,
  ITeamspaceProject,
  TTeamspaceMemberWritePayload,
  TTeamspaceProjectWritePayload,
  TTeamspaceWritePayload,
} from "@plane/types";
// services
import { TeamspaceService } from "@/services/teamspace.service";
// store
import type { CoreRootStore } from "./root.store";

export interface ITeamspaceStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  teamspaceMap: Record<string, ITeamspace>;
  teamspaceMembersMap: Record<string, ITeamspaceMember[]>;
  teamspaceProjectsMap: Record<string, ITeamspaceProject[]>;

  // computed actions
  getTeamspaceIds: (workspaceSlug: string) => string[] | null;
  getTeamspaceById: (teamspaceId: string) => ITeamspace | null;
  getTeamspaceMembersById: (teamspaceId: string) => ITeamspaceMember[];
  getTeamspaceProjectsById: (teamspaceId: string) => ITeamspaceProject[];

  // fetch
  fetchTeamspaces: (workspaceSlug: string) => Promise<ITeamspace[]>;
  fetchTeamspaceDetails: (workspaceSlug: string, teamspaceId: string) => Promise<ITeamspace>;

  // crud
  createTeamspace: (workspaceSlug: string, data: TTeamspaceWritePayload) => Promise<ITeamspace>;
  updateTeamspace: (workspaceSlug: string, teamspaceId: string, data: TTeamspaceWritePayload) => Promise<ITeamspace>;
  deleteTeamspace: (workspaceSlug: string, teamspaceId: string) => Promise<void>;
  addTeamspaceMember: (workspaceSlug: string, teamspaceId: string, data: TTeamspaceMemberWritePayload) => Promise<void>;
  removeTeamspaceMember: (workspaceSlug: string, teamspaceId: string, memberId: string) => Promise<void>;
  addTeamspaceProject: (
    workspaceSlug: string,
    teamspaceId: string,
    data: TTeamspaceProjectWritePayload
  ) => Promise<void>;
  removeTeamspaceProject: (workspaceSlug: string, teamspaceId: string, projectId: string) => Promise<void>;
}

export class TeamspaceStore implements ITeamspaceStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  teamspaceMap: Record<string, ITeamspace> = {};
  teamspaceMembersMap: Record<string, ITeamspaceMember[]> = {};
  teamspaceProjectsMap: Record<string, ITeamspaceProject[]> = {};
  // root store
  rootStore;
  // services
  teamspaceService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      teamspaceMap: observable,
      teamspaceMembersMap: observable,
      teamspaceProjectsMap: observable,

      fetchTeamspaces: action,
      fetchTeamspaceDetails: action,
      createTeamspace: action,
      updateTeamspace: action,
      deleteTeamspace: action,
      addTeamspaceMember: action,
      removeTeamspaceMember: action,
      addTeamspaceProject: action,
      removeTeamspaceProject: action,
    });

    this.rootStore = _rootStore;
    this.teamspaceService = new TeamspaceService();
  }

  /**
   * @description returns all teamspace ids for a workspace, sorted by name
   */
  getTeamspaceIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    const teamspaces = sortBy(Object.values(this.teamspaceMap ?? {}), [(teamspace) => teamspace.name]);
    return teamspaces.map((teamspace) => teamspace.id);
  });

  getTeamspaceById = computedFn((teamspaceId: string): ITeamspace | null => this.teamspaceMap?.[teamspaceId] ?? null);

  getTeamspaceMembersById = computedFn(
    (teamspaceId: string): ITeamspaceMember[] => this.teamspaceMembersMap?.[teamspaceId] ?? []
  );

  getTeamspaceProjectsById = computedFn(
    (teamspaceId: string): ITeamspaceProject[] => this.teamspaceProjectsMap?.[teamspaceId] ?? []
  );

  fetchTeamspaces = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await this.teamspaceService.getTeamspaces(workspaceSlug);
      runInAction(() => {
        response.forEach((teamspace) => {
          set(this.teamspaceMap, [teamspace.id], teamspace);
        });
        set(this.fetchedWorkspaces, workspaceSlug, true);
        this.loader = false;
      });
      return response;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  fetchTeamspaceDetails = async (workspaceSlug: string, teamspaceId: string) => {
    const response = await this.teamspaceService.getTeamspaceDetails(workspaceSlug, teamspaceId);
    runInAction(() => {
      set(this.teamspaceMap, [teamspaceId], response);
      set(this.teamspaceMembersMap, [teamspaceId], response.members);
      set(this.teamspaceProjectsMap, [teamspaceId], response.projects);
    });
    return response;
  };

  createTeamspace = async (workspaceSlug: string, data: TTeamspaceWritePayload) => {
    const response = await this.teamspaceService.createTeamspace(workspaceSlug, data);
    runInAction(() => {
      set(this.teamspaceMap, [response.id], response);
    });
    return response;
  };

  updateTeamspace = async (workspaceSlug: string, teamspaceId: string, data: TTeamspaceWritePayload) => {
    const before = this.teamspaceMap[teamspaceId];
    try {
      runInAction(() => {
        set(this.teamspaceMap, [teamspaceId], { ...before, ...data });
      });
      const response = await this.teamspaceService.patchTeamspace(workspaceSlug, teamspaceId, data);
      runInAction(() => {
        set(this.teamspaceMap, [teamspaceId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (before) set(this.teamspaceMap, [teamspaceId], before);
      });
      throw error;
    }
  };

  deleteTeamspace = async (workspaceSlug: string, teamspaceId: string) => {
    await this.teamspaceService.deleteTeamspace(workspaceSlug, teamspaceId);
    runInAction(() => {
      delete this.teamspaceMap[teamspaceId];
      delete this.teamspaceMembersMap[teamspaceId];
      delete this.teamspaceProjectsMap[teamspaceId];
    });
  };

  addTeamspaceMember = async (workspaceSlug: string, teamspaceId: string, data: TTeamspaceMemberWritePayload) => {
    await this.teamspaceService.addTeamspaceMember(workspaceSlug, teamspaceId, data);
    await this.fetchTeamspaceDetails(workspaceSlug, teamspaceId);
  };

  removeTeamspaceMember = async (workspaceSlug: string, teamspaceId: string, memberId: string) => {
    await this.teamspaceService.removeTeamspaceMember(workspaceSlug, teamspaceId, memberId);
    runInAction(() => {
      set(
        this.teamspaceMembersMap,
        [teamspaceId],
        (this.teamspaceMembersMap[teamspaceId] ?? []).filter((member) => member.id !== memberId)
      );
    });
  };

  addTeamspaceProject = async (workspaceSlug: string, teamspaceId: string, data: TTeamspaceProjectWritePayload) => {
    await this.teamspaceService.addTeamspaceProject(workspaceSlug, teamspaceId, data);
    await this.fetchTeamspaceDetails(workspaceSlug, teamspaceId);
  };

  removeTeamspaceProject = async (workspaceSlug: string, teamspaceId: string, projectId: string) => {
    await this.teamspaceService.removeTeamspaceProject(workspaceSlug, teamspaceId, projectId);
    runInAction(() => {
      set(
        this.teamspaceProjectsMap,
        [teamspaceId],
        (this.teamspaceProjectsMap[teamspaceId] ?? []).filter((project) => project.id !== projectId)
      );
    });
  };
}
