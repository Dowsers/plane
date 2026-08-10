// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Translates the human-friendly names a terminal user actually types
// (project "ENG", state "Done", assignee "me") into the UUIDs the real
// REST API expects - server-side filtering (issue_filters()) only
// understands UUIDs/raw enum values, so this resolution happens once,
// client-side, per exigence 4 ("traduit en query params de l'API
// existante, sans dupliquer de logique de filtrage cote client" - this is
// id resolution, not filtering logic).

import type { PlaneClient } from "./client.js";
import { isUuid } from "./cli-utils.js";
import { ValidationError } from "./errors.js";

export interface ProjectLite {
  id: string;
  identifier: string;
  name: string;
}

export async function resolveProject(client: PlaneClient, workspace: string, ref: string): Promise<ProjectLite> {
  if (isUuid(ref)) {
    const { data } = await client.get<ProjectLite>(`/api/v1/workspaces/${workspace}/projects/${ref}/`);
    return data;
  }
  const { results } = await client.paginateAll<ProjectLite>(
    `/api/v1/workspaces/${workspace}/projects/`,
    {},
    { perPage: 100, all: true }
  );
  const needle = ref.toLowerCase();
  const match = results.find((p) => p.identifier.toLowerCase() === needle || p.name.toLowerCase() === needle);
  if (!match) {
    throw new ValidationError(`No project matches "${ref}" (checked identifier and name).`);
  }
  return match;
}

interface NamedEntity {
  id: string;
  name: string;
}

async function resolveNamedEntity(client: PlaneClient, listPath: string, ref: string, kind: string): Promise<string> {
  if (isUuid(ref)) return ref;
  const { results } = await client.paginateAll<NamedEntity>(listPath, {}, { perPage: 1000, all: true });
  const needle = ref.toLowerCase();
  const match = results.find((item) => item.name.toLowerCase() === needle);
  if (!match) throw new ValidationError(`No ${kind} named "${ref}" found.`);
  return match.id;
}

export function resolveState(client: PlaneClient, workspace: string, projectId: string, ref: string): Promise<string> {
  return resolveNamedEntity(client, `/api/v1/workspaces/${workspace}/projects/${projectId}/states/`, ref, "state");
}

export function resolveLabel(client: PlaneClient, workspace: string, projectId: string, ref: string): Promise<string> {
  return resolveNamedEntity(client, `/api/v1/workspaces/${workspace}/projects/${projectId}/labels/`, ref, "label");
}

export function resolveCycle(client: PlaneClient, workspace: string, projectId: string, ref: string): Promise<string> {
  return resolveNamedEntity(client, `/api/v1/workspaces/${workspace}/projects/${projectId}/cycles/`, ref, "cycle");
}

export function resolveModule(client: PlaneClient, workspace: string, projectId: string, ref: string): Promise<string> {
  return resolveNamedEntity(client, `/api/v1/workspaces/${workspace}/projects/${projectId}/modules/`, ref, "module");
}

interface UserLite {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
}

/**
 * "me" is resolved via /users/me/ (exigence 4's explicit shortcut).
 * Anything else that isn't already a UUID is matched against the
 * project's member list (email, display name, or full name) - the
 * workspace-wide member endpoint is instance-admin-only in this fork, so
 * this project-scoped one is the only lookup available to a regular
 * member's token.
 */
export async function resolveAssignee(
  client: PlaneClient,
  workspace: string,
  projectId: string,
  ref: string
): Promise<string> {
  if (ref.toLowerCase() === "me") {
    const { data } = await client.get<UserLite>("/api/v1/users/me/");
    return data.id;
  }
  if (isUuid(ref)) return ref;

  const { data: members } = await client.get<UserLite[]>(
    `/api/v1/workspaces/${workspace}/projects/${projectId}/members/`
  );
  const needle = ref.toLowerCase();
  const match = members.find(
    (u) =>
      u.email?.toLowerCase() === needle ||
      u.display_name?.toLowerCase() === needle ||
      `${u.first_name} ${u.last_name}`.trim().toLowerCase() === needle
  );
  if (!match) {
    throw new ValidationError(
      `No project member matches "${ref}" (checked email, display name, full name). Pass a user UUID directly, or use "me".`
    );
  }
  return match.id;
}
