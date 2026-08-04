/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable } from "mobx";
// types
import type { TLogoProps, TPublicDashboard, TPublicDashboardWidget } from "@plane/types";
// store
import type { RootStore } from "../root.store";

/**
 * Holds one published dashboard's public payload (metadata + widget
 * config/layout - never computed widget data, see `DashboardPublicEndpoint`
 * on the backend) - mirrors `PublishStore` (`store/publish/publish.store.ts`)
 * for the equivalent project-publish flow, keyed by anchor instead of by
 * project.
 */
export interface IDashboardPublishStore extends TPublicDashboard {}

export class DashboardPublishStore implements IDashboardPublishStore {
  // observables
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  widgets: TPublicDashboardWidget[];
  created_at: string;
  updated_at: string;

  constructor(
    private store: RootStore,
    dashboard: TPublicDashboard
  ) {
    this.id = dashboard.id;
    this.name = dashboard.name;
    this.description = dashboard.description;
    this.logo_props = dashboard.logo_props;
    this.widgets = dashboard.widgets;
    this.created_at = dashboard.created_at;
    this.updated_at = dashboard.updated_at;

    makeObservable(this, {
      // observables
      id: observable.ref,
      name: observable.ref,
      description: observable.ref,
      logo_props: observable,
      widgets: observable,
      created_at: observable.ref,
      updated_at: observable.ref,
    });
  }
}
