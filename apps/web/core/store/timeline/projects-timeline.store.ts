/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { autorun } from "mobx";
// Store
import type { RootStore } from "@/plane-web/store/root.store";
import { BaseTimeLineStore } from "@/plane-web/store/timeline/base-timeline.store";
import type { IBaseTimelineStore } from "@/plane-web/store/timeline/base-timeline.store";

export interface IProjectsTimeLineStore extends IBaseTimelineStore {
  isDependencyEnabled: boolean;
}

export class ProjectsTimeLineStore extends BaseTimeLineStore implements IProjectsTimeLineStore {
  constructor(_rootStore: RootStore) {
    super(_rootStore);

    autorun(() => {
      const getRoadmapProjectById = this.rootStore.roadmap.getRoadmapProjectById;
      this.updateBlocks(getRoadmapProjectById);
    });
  }
}
