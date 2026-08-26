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
  ITeam,
  ITeamMember,
  ITeamProject,
  TTeamMemberWritePayload,
  TTeamProjectWritePayload,
  TTeamWritePayload,
} from "@plane/types";
// services
import { TeamService } from "@/services/team.service";
// store
import type { CoreRootStore } from "./root.store";

export interface ITeamStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  teamMap: Record<string, ITeam>;
  teamMembersMap: Record<string, ITeamMember[]>;
  teamProjectsMap: Record<string, ITeamProject[]>;

  // computed actions
  getTeamIds: (workspaceSlug: string) => string[] | null;
  getTeamById: (teamId: string) => ITeam | null;
  getTeamMembersById: (teamId: string) => ITeamMember[];
  getTeamProjectsById: (teamId: string) => ITeamProject[];

  // fetch
  fetchTeams: (workspaceSlug: string) => Promise<ITeam[]>;
  fetchTeamDetails: (workspaceSlug: string, teamId: string) => Promise<ITeam>;

  // crud
  createTeam: (workspaceSlug: string, data: TTeamWritePayload) => Promise<ITeam>;
  updateTeam: (workspaceSlug: string, teamId: string, data: TTeamWritePayload) => Promise<ITeam>;
  deleteTeam: (workspaceSlug: string, teamId: string) => Promise<void>;
  addTeamMember: (workspaceSlug: string, teamId: string, data: TTeamMemberWritePayload) => Promise<void>;
  removeTeamMember: (workspaceSlug: string, teamId: string, memberId: string) => Promise<void>;
  addTeamProject: (workspaceSlug: string, teamId: string, data: TTeamProjectWritePayload) => Promise<void>;
  removeTeamProject: (workspaceSlug: string, teamId: string, projectId: string) => Promise<void>;
}

export class TeamStore implements ITeamStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  teamMap: Record<string, ITeam> = {};
  teamMembersMap: Record<string, ITeamMember[]> = {};
  teamProjectsMap: Record<string, ITeamProject[]> = {};
  // root store
  rootStore;
  // services
  teamService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      teamMap: observable,
      teamMembersMap: observable,
      teamProjectsMap: observable,

      fetchTeams: action,
      fetchTeamDetails: action,
      createTeam: action,
      updateTeam: action,
      deleteTeam: action,
      addTeamMember: action,
      removeTeamMember: action,
      addTeamProject: action,
      removeTeamProject: action,
    });

    this.rootStore = _rootStore;
    this.teamService = new TeamService();
  }

  /**
   * @description returns all team ids for a workspace, sorted by name
   */
  getTeamIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    const teams = sortBy(Object.values(this.teamMap ?? {}), [(team) => team.name]);
    return teams.map((team) => team.id);
  });

  getTeamById = computedFn((teamId: string): ITeam | null => this.teamMap?.[teamId] ?? null);

  getTeamMembersById = computedFn((teamId: string): ITeamMember[] => this.teamMembersMap?.[teamId] ?? []);

  getTeamProjectsById = computedFn((teamId: string): ITeamProject[] => this.teamProjectsMap?.[teamId] ?? []);

  fetchTeams = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await this.teamService.getTeams(workspaceSlug);
      runInAction(() => {
        response.forEach((team) => {
          set(this.teamMap, [team.id], team);
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

  fetchTeamDetails = async (workspaceSlug: string, teamId: string) => {
    const response = await this.teamService.getTeamDetails(workspaceSlug, teamId);
    runInAction(() => {
      set(this.teamMap, [teamId], response);
      set(this.teamMembersMap, [teamId], response.members);
      set(this.teamProjectsMap, [teamId], response.projects);
    });
    return response;
  };

  createTeam = async (workspaceSlug: string, data: TTeamWritePayload) => {
    const response = await this.teamService.createTeam(workspaceSlug, data);
    runInAction(() => {
      set(this.teamMap, [response.id], response);
    });
    return response;
  };

  updateTeam = async (workspaceSlug: string, teamId: string, data: TTeamWritePayload) => {
    const before = this.teamMap[teamId];
    try {
      runInAction(() => {
        set(this.teamMap, [teamId], { ...before, ...data });
      });
      const response = await this.teamService.patchTeam(workspaceSlug, teamId, data);
      runInAction(() => {
        set(this.teamMap, [teamId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (before) set(this.teamMap, [teamId], before);
      });
      throw error;
    }
  };

  deleteTeam = async (workspaceSlug: string, teamId: string) => {
    await this.teamService.deleteTeam(workspaceSlug, teamId);
    runInAction(() => {
      delete this.teamMap[teamId];
      delete this.teamMembersMap[teamId];
      delete this.teamProjectsMap[teamId];
    });
  };

  addTeamMember = async (workspaceSlug: string, teamId: string, data: TTeamMemberWritePayload) => {
    await this.teamService.addTeamMember(workspaceSlug, teamId, data);
    await this.fetchTeamDetails(workspaceSlug, teamId);
  };

  removeTeamMember = async (workspaceSlug: string, teamId: string, memberId: string) => {
    await this.teamService.removeTeamMember(workspaceSlug, teamId, memberId);
    runInAction(() => {
      set(
        this.teamMembersMap,
        [teamId],
        (this.teamMembersMap[teamId] ?? []).filter((member) => member.id !== memberId)
      );
    });
  };

  addTeamProject = async (workspaceSlug: string, teamId: string, data: TTeamProjectWritePayload) => {
    await this.teamService.addTeamProject(workspaceSlug, teamId, data);
    await this.fetchTeamDetails(workspaceSlug, teamId);
  };

  removeTeamProject = async (workspaceSlug: string, teamId: string, projectId: string) => {
    await this.teamService.removeTeamProject(workspaceSlug, teamId, projectId);
    runInAction(() => {
      set(
        this.teamProjectsMap,
        [teamId],
        (this.teamProjectsMap[teamId] ?? []).filter((project) => project.id !== projectId)
      );
    });
  };
}
