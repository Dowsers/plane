/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkspaceAPIExplorerSettings } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";

type Props = {
  settings: TWorkspaceAPIExplorerSettings;
  isAdmin: boolean;
  isSaving: boolean;
  onToggleEnabled: (value: boolean) => void;
  onToggleAllowMembersExecute: (value: boolean) => void;
};

/**
 * Spec exigence 14/item 10's own settings toggle: "un reglage de
 * workspace ('Autoriser les Members a executer des requetes')". Also
 * exposes the sibling `is_enabled` switch from the same
 * `WorkspaceAPIExplorerSettings` row (item 10's opening sentence: "Respect
 * WorkspaceAPIExplorerSettings" names both fields) - without it, an Admin
 * who had previously turned the whole feature off for this workspace
 * would have no way to turn it back on from here. Read-only for
 * non-Admins (mirrors `WorkspaceAPIExplorerSettingsEndpoint.patch` being
 * Admin-only server-side).
 */
export function SettingsToggle({ settings, isAdmin, isSaving, onToggleEnabled, onToggleAllowMembersExecute }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-subtle p-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h6 className="text-13 font-medium text-primary">Enable the API Explorer for this workspace</h6>
          <p className="text-12 text-tertiary">
            Also requires the instance-wide flag to be enabled by whoever deployed this instance.
          </p>
        </div>
        <ToggleSwitch value={settings.is_enabled} onChange={onToggleEnabled} disabled={!isAdmin || isSaving} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h6 className="text-13 font-medium text-primary">Allow Members to execute mutating requests</h6>
          <p className="text-12 text-tertiary">
            Members can always browse the schema and run read-only calls. Without this, only Admins can run
            POST/PATCH/PUT/DELETE calls from here.
          </p>
        </div>
        <ToggleSwitch
          value={settings.allow_members_execute}
          onChange={onToggleAllowMembersExecute}
          disabled={!isAdmin || isSaving}
        />
      </div>
    </div>
  );
}
