/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { ICustomer, ICustomerRequest, TCustomerRequestWritePayload, TCustomerWritePayload } from "@plane/types";
// services
import { CustomerService } from "@/services/customer.service";
// store
import type { CoreRootStore } from "./root.store";

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers") in
 * plane-selfhost. Mirrors TeamspaceStore's shape - a plain workspace-scoped
 * entity map plus a nested `customerRequestsMap` (keyed by customer id) for
 * feature 2's `CustomerRequest` children, fetched together with the
 * Customer detail (`fetchCustomerDetails`) the same way Teamspace fetches
 * its members/projects alongside its own detail call.
 */
export interface ICustomerStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  customerMap: Record<string, ICustomer>;
  customerRequestsMap: Record<string, ICustomerRequest[]>;

  // computed actions
  getCustomerIds: (workspaceSlug: string) => string[] | null;
  getCustomerById: (customerId: string) => ICustomer | null;
  getCustomerRequestsById: (customerId: string) => ICustomerRequest[];

  // fetch
  fetchCustomers: (workspaceSlug: string) => Promise<ICustomer[]>;
  fetchCustomerDetails: (workspaceSlug: string, customerId: string) => Promise<ICustomer>;
  fetchCustomerRequests: (workspaceSlug: string, customerId: string) => Promise<ICustomerRequest[]>;

  // crud - Customer
  createCustomer: (workspaceSlug: string, data: TCustomerWritePayload) => Promise<ICustomer>;
  updateCustomer: (workspaceSlug: string, customerId: string, data: TCustomerWritePayload) => Promise<ICustomer>;
  deleteCustomer: (workspaceSlug: string, customerId: string) => Promise<void>;

  // crud - CustomerRequest
  createCustomerRequest: (
    workspaceSlug: string,
    customerId: string,
    data: TCustomerRequestWritePayload
  ) => Promise<ICustomerRequest>;
  updateCustomerRequest: (
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    data: TCustomerRequestWritePayload
  ) => Promise<ICustomerRequest>;
  deleteCustomerRequest: (workspaceSlug: string, customerId: string, requestId: string) => Promise<void>;

  // CustomerRequest <-> Issue linking
  linkCustomerRequestIssue: (
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    issueId: string
  ) => Promise<void>;
  unlinkCustomerRequestIssue: (
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    issueId: string
  ) => Promise<void>;
}

export class CustomerStore implements ICustomerStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  customerMap: Record<string, ICustomer> = {};
  customerRequestsMap: Record<string, ICustomerRequest[]> = {};
  // root store
  rootStore;
  // services
  customerService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      customerMap: observable,
      customerRequestsMap: observable,

      fetchCustomers: action,
      fetchCustomerDetails: action,
      fetchCustomerRequests: action,
      createCustomer: action,
      updateCustomer: action,
      deleteCustomer: action,
      createCustomerRequest: action,
      updateCustomerRequest: action,
      deleteCustomerRequest: action,
      linkCustomerRequestIssue: action,
      unlinkCustomerRequestIssue: action,
    });

    this.rootStore = _rootStore;
    this.customerService = new CustomerService();
  }

  getCustomerIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    const customers = sortBy(Object.values(this.customerMap ?? {}), [(customer) => customer.name]);
    return customers.map((customer) => customer.id);
  });

  getCustomerById = computedFn((customerId: string): ICustomer | null => this.customerMap?.[customerId] ?? null);

  getCustomerRequestsById = computedFn(
    (customerId: string): ICustomerRequest[] => this.customerRequestsMap?.[customerId] ?? []
  );

  fetchCustomers = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await this.customerService.getCustomers(workspaceSlug);
      runInAction(() => {
        response.forEach((customer) => {
          set(this.customerMap, [customer.id], customer);
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

  fetchCustomerDetails = async (workspaceSlug: string, customerId: string) => {
    const response = await this.customerService.getCustomerDetails(workspaceSlug, customerId);
    runInAction(() => {
      set(this.customerMap, [customerId], response);
    });
    return response;
  };

  fetchCustomerRequests = async (workspaceSlug: string, customerId: string) => {
    const response = await this.customerService.getCustomerRequests(workspaceSlug, customerId);
    runInAction(() => {
      set(this.customerRequestsMap, [customerId], response);
    });
    return response;
  };

  createCustomer = async (workspaceSlug: string, data: TCustomerWritePayload) => {
    const response = await this.customerService.createCustomer(workspaceSlug, data);
    runInAction(() => {
      set(this.customerMap, [response.id], response);
    });
    return response;
  };

  updateCustomer = async (workspaceSlug: string, customerId: string, data: TCustomerWritePayload) => {
    const before = this.customerMap[customerId];
    try {
      runInAction(() => {
        set(this.customerMap, [customerId], { ...before, ...data });
      });
      const response = await this.customerService.patchCustomer(workspaceSlug, customerId, data);
      runInAction(() => {
        set(this.customerMap, [customerId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (before) set(this.customerMap, [customerId], before);
      });
      throw error;
    }
  };

  deleteCustomer = async (workspaceSlug: string, customerId: string) => {
    await this.customerService.deleteCustomer(workspaceSlug, customerId);
    runInAction(() => {
      delete this.customerMap[customerId];
      delete this.customerRequestsMap[customerId];
    });
  };

  createCustomerRequest = async (workspaceSlug: string, customerId: string, data: TCustomerRequestWritePayload) => {
    const response = await this.customerService.createCustomerRequest(workspaceSlug, customerId, data);
    runInAction(() => {
      set(this.customerRequestsMap, [customerId], [response, ...(this.customerRequestsMap[customerId] ?? [])]);
      // Keep the list-page request_count roughly in sync without a full refetch.
      const customer = this.customerMap[customerId];
      if (customer) {
        set(this.customerMap, [customerId, "request_count"], (customer.request_count ?? 0) + 1);
      }
    });
    return response;
  };

  updateCustomerRequest = async (
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    data: TCustomerRequestWritePayload
  ) => {
    const response = await this.customerService.patchCustomerRequest(workspaceSlug, customerId, requestId, data);
    runInAction(() => {
      set(
        this.customerRequestsMap,
        [customerId],
        (this.customerRequestsMap[customerId] ?? []).map((req) => (req.id === requestId ? response : req))
      );
    });
    return response;
  };

  deleteCustomerRequest = async (workspaceSlug: string, customerId: string, requestId: string) => {
    await this.customerService.deleteCustomerRequest(workspaceSlug, customerId, requestId);
    runInAction(() => {
      set(
        this.customerRequestsMap,
        [customerId],
        (this.customerRequestsMap[customerId] ?? []).filter((req) => req.id !== requestId)
      );
      const customer = this.customerMap[customerId];
      if (customer) {
        set(this.customerMap, [customerId, "request_count"], Math.max(0, (customer.request_count ?? 1) - 1));
      }
    });
  };

  linkCustomerRequestIssue = async (workspaceSlug: string, customerId: string, requestId: string, issueId: string) => {
    await this.customerService.linkCustomerRequestIssue(workspaceSlug, customerId, requestId, issueId);
    await this.fetchCustomerRequests(workspaceSlug, customerId);
  };

  unlinkCustomerRequestIssue = async (
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    issueId: string
  ) => {
    await this.customerService.unlinkCustomerRequestIssue(workspaceSlug, customerId, requestId, issueId);
    await this.fetchCustomerRequests(workspaceSlug, customerId);
  };
}
