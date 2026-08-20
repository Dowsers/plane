/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observable, action, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TCreateModalStoreTypes, TCreatePageModal } from "@plane/constants";
import { DEFAULT_CREATE_PAGE_MODAL_DATA, EPageAccess } from "@plane/constants";
import type { TAIConversationContextType, TProfileSettingsTabs } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// lib
import { store } from "@/lib/store-context";

export interface ModalData {
  store: EIssuesStoreType;
  viewId: string;
}

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). The chat
 * panel is command-palette-launched (see
 * `power-k/config/ai-assistant-commands.ts`) - `contextType`/
 * `contextObjectId` are derived from wherever the command was triggered
 * (issue detail -> "issue", project -> "project", ... -> "workspace" as
 * the fallback) and passed straight through to
 * `POST .../ai-conversations/` when the modal creates a new conversation.
 */
export type TAIChatAssistantModalState = {
  isOpen: boolean;
  contextType: TAIConversationContextType;
  contextObjectId: string | null;
};

export interface IBaseCommandPaletteStore {
  // observables
  isCreateProjectModalOpen: boolean;
  isCreateCycleModalOpen: boolean;
  isCreateModuleModalOpen: boolean;
  isCreateInitiativeModalOpen: boolean;
  isCreateViewModalOpen: boolean;
  createPageModal: TCreatePageModal;
  isCreateIssueModalOpen: boolean;
  isDeleteIssueModalOpen: boolean;
  isBulkDeleteIssueModalOpen: boolean;
  createIssueStoreType: TCreateModalStoreTypes;
  createWorkItemAllowedProjectIds: string[] | undefined;
  profileSettingsModal: {
    activeTab: TProfileSettingsTabs | null;
    isOpen: boolean;
  };
  allStickiesModal: boolean;
  projectListOpenMap: Record<string, boolean>;
  aiChatAssistantModal: TAIChatAssistantModalState;
  getIsProjectListOpen: (projectId: string) => boolean;
  // toggle actions
  toggleAIChatAssistantModal: (payload?: Partial<TAIChatAssistantModalState>) => void;
  toggleCreateProjectModal: (value?: boolean) => void;
  toggleCreateCycleModal: (value?: boolean) => void;
  toggleCreateInitiativeModal: (value?: boolean) => void;
  toggleCreateViewModal: (value?: boolean) => void;
  toggleCreatePageModal: (value?: TCreatePageModal) => void;
  toggleCreateIssueModal: (value?: boolean, storeType?: TCreateModalStoreTypes, allowedProjectIds?: string[]) => void;
  toggleCreateModuleModal: (value?: boolean) => void;
  toggleDeleteIssueModal: (value?: boolean) => void;
  toggleBulkDeleteIssueModal: (value?: boolean) => void;
  toggleAllStickiesModal: (value?: boolean) => void;
  toggleProjectListOpen: (projectId: string, value?: boolean) => void;
  toggleProfileSettingsModal: (value: { activeTab?: TProfileSettingsTabs | null; isOpen?: boolean }) => void;
}

export abstract class BaseCommandPaletteStore implements IBaseCommandPaletteStore {
  // observables
  isCreateProjectModalOpen: boolean = false;
  isCreateCycleModalOpen: boolean = false;
  isCreateModuleModalOpen: boolean = false;
  isCreateInitiativeModalOpen: boolean = false;
  isCreateViewModalOpen: boolean = false;
  isCreateIssueModalOpen: boolean = false;
  isDeleteIssueModalOpen: boolean = false;
  isBulkDeleteIssueModalOpen: boolean = false;
  createPageModal: TCreatePageModal = DEFAULT_CREATE_PAGE_MODAL_DATA;
  createIssueStoreType: TCreateModalStoreTypes = EIssuesStoreType.PROJECT;
  createWorkItemAllowedProjectIds: IBaseCommandPaletteStore["createWorkItemAllowedProjectIds"] = undefined;
  profileSettingsModal: IBaseCommandPaletteStore["profileSettingsModal"] = {
    activeTab: "general",
    isOpen: false,
  };
  allStickiesModal: boolean = false;
  projectListOpenMap: Record<string, boolean> = {};
  aiChatAssistantModal: TAIChatAssistantModalState = {
    isOpen: false,
    contextType: "workspace",
    contextObjectId: null,
  };

  constructor() {
    makeObservable(this, {
      // observable
      isCreateProjectModalOpen: observable.ref,
      isCreateCycleModalOpen: observable.ref,
      isCreateModuleModalOpen: observable.ref,
      isCreateInitiativeModalOpen: observable.ref,
      isCreateViewModalOpen: observable.ref,
      isCreateIssueModalOpen: observable.ref,
      isDeleteIssueModalOpen: observable.ref,
      isBulkDeleteIssueModalOpen: observable.ref,
      createPageModal: observable,
      createIssueStoreType: observable,
      createWorkItemAllowedProjectIds: observable,
      profileSettingsModal: observable,
      allStickiesModal: observable,
      projectListOpenMap: observable,
      aiChatAssistantModal: observable,
      // toggle actions
      toggleAIChatAssistantModal: action,
      toggleCreateProjectModal: action,
      toggleCreateCycleModal: action,
      toggleCreateInitiativeModal: action,
      toggleCreateViewModal: action,
      toggleCreatePageModal: action,
      toggleCreateIssueModal: action,
      toggleCreateModuleModal: action,
      toggleDeleteIssueModal: action,
      toggleBulkDeleteIssueModal: action,
      toggleAllStickiesModal: action,
      toggleProjectListOpen: action,
      toggleProfileSettingsModal: action,
    });
  }

  /**
   * Returns whether any base modal is open
   * @protected - allows access from child classes
   */
  protected getCoreModalsState(): boolean {
    return Boolean(
      this.isCreateIssueModalOpen ||
      this.isCreateCycleModalOpen ||
      this.isCreateProjectModalOpen ||
      this.isCreateInitiativeModalOpen ||
      this.isCreateModuleModalOpen ||
      this.isCreateViewModalOpen ||
      store.powerK.isShortcutsListModalOpen ||
      this.isBulkDeleteIssueModalOpen ||
      this.isDeleteIssueModalOpen ||
      this.createPageModal.isOpen ||
      this.allStickiesModal ||
      this.aiChatAssistantModal.isOpen
    );
  }
  // computedFn
  getIsProjectListOpen = computedFn((projectId: string) => this.projectListOpenMap[projectId]);

  /**
   * Toggles the AI chat assistant modal (category 9, feature 3). A partial
   * payload merges over the current state (same convention as
   * `toggleProfileSettingsModal`) so a caller can update just `isOpen`
   * without having to re-pass the context, or set a fresh context and open
   * it in one call. Called with no argument, it just flips `isOpen`.
   * @param payload
   */
  toggleAIChatAssistantModal: IBaseCommandPaletteStore["toggleAIChatAssistantModal"] = (payload) => {
    if (payload) {
      this.aiChatAssistantModal = {
        ...this.aiChatAssistantModal,
        ...payload,
      };
    } else {
      this.aiChatAssistantModal = {
        ...this.aiChatAssistantModal,
        isOpen: !this.aiChatAssistantModal.isOpen,
      };
    }
  };

  /**
   * Toggles the project list open state
   * @param projectId
   * @param value
   */
  toggleProjectListOpen = (projectId: string, value?: boolean) => {
    if (value !== undefined) this.projectListOpenMap[projectId] = value;
    else this.projectListOpenMap[projectId] = !this.projectListOpenMap[projectId];
  };

  /**
   * Toggles the create project modal
   * @param value
   * @returns
   */
  toggleCreateProjectModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isCreateProjectModalOpen = value;
    } else {
      this.isCreateProjectModalOpen = !this.isCreateProjectModalOpen;
    }
  };

  /**
   * Toggles the create cycle modal
   * @param value
   * @returns
   */
  toggleCreateCycleModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isCreateCycleModalOpen = value;
    } else {
      this.isCreateCycleModalOpen = !this.isCreateCycleModalOpen;
    }
  };

  /**
   * Toggles the create view modal
   * @param value
   * @returns
   */
  toggleCreateViewModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isCreateViewModalOpen = value;
    } else {
      this.isCreateViewModalOpen = !this.isCreateViewModalOpen;
    }
  };

  /**
   * Toggles the create page modal along with the page access
   * @param value
   * @returns
   */
  toggleCreatePageModal = (value?: TCreatePageModal) => {
    if (value) {
      this.createPageModal = {
        isOpen: value.isOpen,
        pageAccess: value.pageAccess || EPageAccess.PUBLIC,
      };
    } else {
      this.createPageModal = {
        isOpen: !this.createPageModal.isOpen,
        pageAccess: EPageAccess.PUBLIC,
      };
    }
  };

  /**
   * Toggles the create issue modal
   * @param value
   * @param storeType
   * @returns
   */
  toggleCreateIssueModal = (value?: boolean, storeType?: TCreateModalStoreTypes, allowedProjectIds?: string[]) => {
    if (value !== undefined) {
      this.isCreateIssueModalOpen = value;
      this.createIssueStoreType = storeType || EIssuesStoreType.PROJECT;
      this.createWorkItemAllowedProjectIds = allowedProjectIds ?? undefined;
    } else {
      this.isCreateIssueModalOpen = !this.isCreateIssueModalOpen;
      this.createIssueStoreType = EIssuesStoreType.PROJECT;
      this.createWorkItemAllowedProjectIds = undefined;
    }
  };

  /**
   * Toggles the delete issue modal
   * @param value
   * @returns
   */
  toggleDeleteIssueModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isDeleteIssueModalOpen = value;
    } else {
      this.isDeleteIssueModalOpen = !this.isDeleteIssueModalOpen;
    }
  };

  /**
   * Toggles the create module modal
   * @param value
   * @returns
   */
  toggleCreateModuleModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isCreateModuleModalOpen = value;
    } else {
      this.isCreateModuleModalOpen = !this.isCreateModuleModalOpen;
    }
  };

  /**
   * Toggles the create initiative modal
   * @param value
   * @returns
   */
  toggleCreateInitiativeModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isCreateInitiativeModalOpen = value;
    } else {
      this.isCreateInitiativeModalOpen = !this.isCreateInitiativeModalOpen;
    }
  };

  /**
   * Toggles the bulk delete issue modal
   * @param value
   * @returns
   */
  toggleBulkDeleteIssueModal = (value?: boolean) => {
    if (value !== undefined) {
      this.isBulkDeleteIssueModalOpen = value;
    } else {
      this.isBulkDeleteIssueModalOpen = !this.isBulkDeleteIssueModalOpen;
    }
  };

  /**
   * Toggles the all stickies modal
   * @param value
   * @returns
   */
  toggleAllStickiesModal = (value?: boolean) => {
    if (value) {
      this.allStickiesModal = value;
    } else {
      this.allStickiesModal = !this.allStickiesModal;
    }
  };

  /**
   * Toggles the profile settings modal
   * @param value
   * @returns
   */
  toggleProfileSettingsModal: IBaseCommandPaletteStore["toggleProfileSettingsModal"] = (payload) => {
    const updatedSettings: IBaseCommandPaletteStore["profileSettingsModal"] = {
      ...this.profileSettingsModal,
      ...payload,
    };

    runInAction(() => {
      this.profileSettingsModal = updatedSettings;
    });
  };
}
