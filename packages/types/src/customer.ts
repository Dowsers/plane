/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "./common";

// docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers") in
// plane-selfhost - mirrors apps/api/plane/db/models/customer.py.

export type TCustomerStatus = "active" | "prospect" | "churned";

export interface ICustomer {
  id: string;
  workspace: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  contact_name: string;
  contact_email: string;
  domain: string;
  status: TCustomerStatus;
  // Annotated counts (feature 3, exigence 2) - present on the list/detail
  // response, absent on a plain write response.
  request_count?: number;
  issue_count?: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export type TCustomerWritePayload = Partial<
  Pick<ICustomer, "name" | "description" | "logo_props" | "contact_name" | "contact_email" | "domain" | "status">
>;

export interface ICustomerRequestIssue {
  id: string;
  customer_request: string;
  issue_id: string;
  sequence_id: number;
  name: string;
  project_id: string;
  project_identifier: string;
  state_id: string;
  created_at: string;
  created_by?: string | null;
}

export interface ICustomerRequest {
  id: string;
  customer: string;
  workspace: string;
  name: string;
  description: string;
  requested_at: string | null;
  issues?: ICustomerRequestIssue[];
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export type TCustomerRequestWritePayload = Partial<Pick<ICustomerRequest, "name" | "description" | "requested_at">>;

// Mirror shape on the Issue side - GET .../issues/<issue_id>/customer-requests/
export interface IIssueCustomerRequest {
  id: string;
  customer_request_id: string;
  customer_id: string;
  customer_name: string;
  request_name: string;
  request_description: string;
  issue: string;
  created_at: string;
}
