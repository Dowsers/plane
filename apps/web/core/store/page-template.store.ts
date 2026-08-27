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
  IPageTemplate,
  IPageTemplateListItem,
  TCreatePageFromTemplatePayload,
  TCreatePageTemplatePayload,
  TSaveAsPageTemplatePayload,
} from "@plane/types";
// services
import { PageTemplateService } from "@/services/page-template.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IPageTemplateStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  templateMap: Record<string, IPageTemplateListItem | IPageTemplate>;

  // computed actions
  getTemplateIds: (workspaceSlug: string) => string[] | null;
  getTemplateById: (templateId: string) => IPageTemplateListItem | IPageTemplate | null;

  // fetch
  fetchTemplates: (workspaceSlug: string) => Promise<IPageTemplateListItem[]>;
  fetchTemplateDetails: (workspaceSlug: string, templateId: string) => Promise<IPageTemplate>;

  // crud
  createTemplate: (workspaceSlug: string, data: TCreatePageTemplatePayload) => Promise<IPageTemplate>;
  updateTemplate: (
    workspaceSlug: string,
    templateId: string,
    data: Partial<TCreatePageTemplatePayload>
  ) => Promise<IPageTemplate>;
  duplicateTemplate: (workspaceSlug: string, templateId: string) => Promise<IPageTemplate>;
  deleteTemplate: (workspaceSlug: string, templateId: string) => Promise<void>;
  saveAsTemplate: (workspaceSlug: string, pageId: string, data: TSaveAsPageTemplatePayload) => Promise<IPageTemplate>;
  createPageFromTemplate: (
    workspaceSlug: string,
    templateId: string,
    data: TCreatePageFromTemplatePayload
  ) => Promise<any>;
}

export class PageTemplateStore implements IPageTemplateStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  templateMap: Record<string, IPageTemplateListItem | IPageTemplate> = {};
  // root store
  rootStore;
  // services
  pageTemplateService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      templateMap: observable,

      fetchTemplates: action,
      fetchTemplateDetails: action,
      createTemplate: action,
      updateTemplate: action,
      duplicateTemplate: action,
      deleteTemplate: action,
      saveAsTemplate: action,
      createPageFromTemplate: action,
    });

    this.rootStore = _rootStore;
    this.pageTemplateService = new PageTemplateService();
  }

  getTemplateIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    return Object.keys(this.templateMap);
  });

  getTemplateById = computedFn(
    (templateId: string): IPageTemplateListItem | IPageTemplate | null => this.templateMap?.[templateId] ?? null
  );

  fetchTemplates = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await this.pageTemplateService.list(workspaceSlug);
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
    const response = await this.pageTemplateService.retrieve(workspaceSlug, templateId);
    runInAction(() => {
      set(this.templateMap, [templateId], response);
    });
    return response;
  };

  createTemplate = async (workspaceSlug: string, data: TCreatePageTemplatePayload) => {
    const response = await this.pageTemplateService.create(workspaceSlug, data);
    runInAction(() => {
      set(this.templateMap, [response.id], response);
    });
    return response;
  };

  updateTemplate = async (workspaceSlug: string, templateId: string, data: Partial<TCreatePageTemplatePayload>) => {
    const response = await this.pageTemplateService.update(workspaceSlug, templateId, data);
    runInAction(() => {
      set(this.templateMap, [templateId], response);
    });
    return response;
  };

  duplicateTemplate = async (workspaceSlug: string, templateId: string) => {
    const response = await this.pageTemplateService.duplicate(workspaceSlug, templateId);
    runInAction(() => {
      set(this.templateMap, [response.id], response);
    });
    return response;
  };

  deleteTemplate = async (workspaceSlug: string, templateId: string) => {
    await this.pageTemplateService.remove(workspaceSlug, templateId);
    runInAction(() => {
      delete this.templateMap[templateId];
    });
  };

  saveAsTemplate = async (workspaceSlug: string, pageId: string, data: TSaveAsPageTemplatePayload) => {
    const response = await this.pageTemplateService.saveAsTemplate(workspaceSlug, pageId, data);
    runInAction(() => {
      set(this.templateMap, [response.id], response);
    });
    return response;
  };

  createPageFromTemplate = async (workspaceSlug: string, templateId: string, data: TCreatePageFromTemplatePayload) => {
    const response = await this.pageTemplateService.createPage(workspaceSlug, templateId, data);
    // usage_count was incremented atomically server-side (exigence 5,
    // section 3) - bump the locally cached copy too, if we have one, so
    // the gallery/management screen reflect it without a refetch.
    runInAction(() => {
      const existing = this.templateMap[templateId];
      if (existing) {
        set(this.templateMap, [templateId, "usage_count"], (existing.usage_count ?? 0) + 1);
      }
    });
    return response;
  };
}
