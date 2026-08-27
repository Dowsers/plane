/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  ICustomer,
  ICustomerRequest,
  ICustomerRequestIssue,
  IIssueCustomerRequest,
  TCustomerRequestWritePayload,
  TCustomerWritePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers") in
 * plane-selfhost. Mirrors TeamspaceService's shape (plain CRUD wrapper
 * around apps/api/plane/app/urls/customer.py's route family).
 */
export class CustomerService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // Feature 1 - Customer CRUD

  async getCustomers(workspaceSlug: string, params?: { status?: string; search?: string; order_by?: string }) {
    return this.get(`/api/workspaces/${workspaceSlug}/customers/`, { params })
      .then((response) => response?.data as ICustomer[])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCustomerDetails(workspaceSlug: string, customerId: string): Promise<ICustomer> {
    return this.get(`/api/workspaces/${workspaceSlug}/customers/${customerId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCustomer(workspaceSlug: string, data: TCustomerWritePayload): Promise<ICustomer> {
    return this.post(`/api/workspaces/${workspaceSlug}/customers/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchCustomer(workspaceSlug: string, customerId: string, data: TCustomerWritePayload): Promise<ICustomer> {
    return this.patch(`/api/workspaces/${workspaceSlug}/customers/${customerId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCustomer(workspaceSlug: string, customerId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/customers/${customerId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // Feature 2 - CustomerRequest CRUD

  async getCustomerRequests(workspaceSlug: string, customerId: string): Promise<ICustomerRequest[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/customers/${customerId}/requests/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCustomerRequest(
    workspaceSlug: string,
    customerId: string,
    data: TCustomerRequestWritePayload
  ): Promise<ICustomerRequest> {
    return this.post(`/api/workspaces/${workspaceSlug}/customers/${customerId}/requests/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchCustomerRequest(
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    data: TCustomerRequestWritePayload
  ): Promise<ICustomerRequest> {
    return this.patch(`/api/workspaces/${workspaceSlug}/customers/${customerId}/requests/${requestId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCustomerRequest(workspaceSlug: string, customerId: string, requestId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/customers/${customerId}/requests/${requestId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // Feature 2 - CustomerRequest <-> Issue linking

  async linkCustomerRequestIssue(
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    issueId: string
  ): Promise<ICustomerRequestIssue> {
    return this.post(`/api/workspaces/${workspaceSlug}/customers/${customerId}/requests/${requestId}/issues/`, {
      issue_id: issueId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkCustomerRequestIssue(
    workspaceSlug: string,
    customerId: string,
    requestId: string,
    issueId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/customers/${customerId}/requests/${requestId}/issues/${issueId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // Mirror endpoint on the Issue side - feeds the "Customer requests" sidebar block.
  async getIssueCustomerRequests(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IIssueCustomerRequest[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/customer-requests/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const customerService = new CustomerService();
