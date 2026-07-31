/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  IProjectTemplate,
  IProjectTemplateListItem,
  TCreateProjectFromTemplatePayload,
  TCreateProjectTemplateFromProjectPayload,
} from "@plane/types";
// services
import { ProjectTemplateService } from "@/services/project-template.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IProjectTemplateStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  templateMap: Record<string, IProjectTemplateListItem | IProjectTemplate>;

  // computed actions
  getTemplateIds: (workspaceSlug: string) => string[] | null;
  getTemplateById: (templateId: string) => IProjectTemplateListItem | IProjectTemplate | null;

  // fetch
  fetchTemplates: (workspaceSlug: string) => Promise<IProjectTemplateListItem[]>;
  fetchTemplateDetails: (workspaceSlug: string, templateId: string) => Promise<IProjectTemplate>;

  // crud
  createTemplateFromProject: (
    workspaceSlug: string,
    data: TCreateProjectTemplateFromProjectPayload
  ) => Promise<IProjectTemplate>;
  duplicateTemplate: (workspaceSlug: string, templateId: string) => Promise<IProjectTemplate>;
  deleteTemplate: (workspaceSlug: string, templateId: string) => Promise<void>;
  createProjectFromTemplate: (
    workspaceSlug: string,
    templateId: string,
    data: TCreateProjectFromTemplatePayload
  ) => Promise<any>;
}

export class ProjectTemplateStore implements IProjectTemplateStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  templateMap: Record<string, IProjectTemplateListItem | IProjectTemplate> = {};
  // root store
  rootStore;
  // services
  projectTemplateService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      templateMap: observable,

      fetchTemplates: action,
      fetchTemplateDetails: action,
      createTemplateFromProject: action,
      duplicateTemplate: action,
      deleteTemplate: action,
      createProjectFromTemplate: action,
    });

    this.rootStore = _rootStore;
    this.projectTemplateService = new ProjectTemplateService();
  }

  getTemplateIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    return Object.keys(this.templateMap);
  });

  getTemplateById = computedFn(
    (templateId: string): IProjectTemplateListItem | IProjectTemplate | null => this.templateMap?.[templateId] ?? null
  );

  fetchTemplates = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await this.projectTemplateService.list(workspaceSlug);
      runInAction(() => {
        response.forEach((template) => {
          set(this.templateMap, [template.id], template);
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

  fetchTemplateDetails = async (workspaceSlug: string, templateId: string) => {
    const response = await this.projectTemplateService.retrieve(workspaceSlug, templateId);
    runInAction(() => {
      set(this.templateMap, [templateId], response);
    });
    return response;
  };

  createTemplateFromProject = async (workspaceSlug: string, data: TCreateProjectTemplateFromProjectPayload) => {
    const response = await this.projectTemplateService.createFromProject(workspaceSlug, data);
    runInAction(() => {
      set(this.templateMap, [response.id], response);
    });
    return response;
  };

  duplicateTemplate = async (workspaceSlug: string, templateId: string) => {
    const response = await this.projectTemplateService.duplicate(workspaceSlug, templateId);
    runInAction(() => {
      set(this.templateMap, [response.id], response);
    });
    return response;
  };

  deleteTemplate = async (workspaceSlug: string, templateId: string) => {
    await this.projectTemplateService.remove(workspaceSlug, templateId);
    runInAction(() => {
      delete this.templateMap[templateId];
    });
  };

  createProjectFromTemplate = async (
    workspaceSlug: string,
    templateId: string,
    data: TCreateProjectFromTemplatePayload
  ) => {
    const response = await this.projectTemplateService.createProject(workspaceSlug, templateId, data);
    this.rootStore.projectRoot.project.processProjectAfterCreation(workspaceSlug, response);
    return response;
  };
}
