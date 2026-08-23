/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import {
  ALLOWED_AUTH_METHOD_LABELS,
  MEMBER_INVITE_RESTRICTION_DESCRIPTIONS,
  MEMBER_INVITE_RESTRICTION_LABELS,
  MEMBER_INVITE_RESTRICTION_OPTIONS,
  SESSION_TIMEOUT_MINUTES_MAX,
  SESSION_TIMEOUT_MINUTES_MIN,
} from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TAllowedAuthMethod, TWorkspaceSecurityPolicy, TWorkspaceSecurityPolicyUpdatePayload } from "@plane/types";
import { CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
// helpers
import { isReauthRequiredError } from "@/helpers/reauth.helper";
// hooks
import { useSensitiveActionGuard } from "@/hooks/use-sensitive-action-guard";
// services
import workspaceSecurityService from "@/services/workspace-security.service";
// local imports
import { ReauthModal } from "./reauth-modal";

type Props = {
  workspaceSlug: string;
  isOwner: boolean;
};

const ALLOWED_AUTH_METHOD_KEYS: TAllowedAuthMethod[] = ["EMAIL_PASSWORD", "MAGIC_LINK", "GOOGLE", "GITHUB"];

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * Workspace Settings > Security > "Security policy" sub-panel. Owner can
 * edit every field; a workspace Admin who is NOT the Owner sees the exact
 * same values read-only (matching the backend's own Admin-read/Owner-write
 * split on `WorkspaceSecurityPolicyEndpoint`) rather than the full
 * "reserved to the Owner" empty state the audit log section below still
 * uses (that endpoint is Owner-only for BOTH read and write).
 */
export const SecurityPolicyPanel = observer(function SecurityPolicyPanel(props: Props) {
  const { workspaceSlug, isOwner } = props;
  // sensitive-action guard - PATCH .../security-policy/ is itself gated by
  // `force_reauth_for_sensitive_actions` (exigence 8).
  const { runGuarded, isReauthModalOpen, onReauthSuccess, onReauthClose } = useSensitiveActionGuard(workspaceSlug);
  // state
  const [draft, setDraft] = useState<TWorkspaceSecurityPolicy | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    ["WORKSPACE_SECURITY_POLICY", workspaceSlug],
    () => workspaceSecurityService.getSecurityPolicy(workspaceSlug),
    { revalidateOnFocus: false }
  );

  // Sync the editable draft from the fetched value - only while not mid-save,
  // so a save-in-flight round trip never clobbers what the Owner just typed.
  useEffect(() => {
    if (data && !isSaving) setDraft(data);
  }, [data, isSaving]);

  const isDirty = Boolean(
    draft &&
    data &&
    (draft.enforce_sso_only !== data.enforce_sso_only ||
      draft.member_invite_restriction !== data.member_invite_restriction ||
      draft.session_timeout_minutes !== data.session_timeout_minutes ||
      draft.force_reauth_for_sensitive_actions !== data.force_reauth_for_sensitive_actions ||
      draft.allowed_auth_methods.length !== data.allowed_auth_methods.length ||
      draft.allowed_auth_methods.some((m) => !data.allowed_auth_methods.includes(m)))
  );

  const updateDraft = (patch: Partial<TWorkspaceSecurityPolicy>) => {
    if (!isOwner) return;
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const toggleAuthMethod = (method: TAllowedAuthMethod) => {
    if (!draft) return;
    const next = draft.allowed_auth_methods.includes(method)
      ? draft.allowed_auth_methods.filter((m) => m !== method)
      : [...draft.allowed_auth_methods, method];
    updateDraft({ allowed_auth_methods: next });
  };

  const handleSave = async () => {
    if (!draft) return;
    const payload: TWorkspaceSecurityPolicyUpdatePayload = {
      enforce_sso_only: draft.enforce_sso_only,
      member_invite_restriction: draft.member_invite_restriction,
      allowed_auth_methods: draft.allowed_auth_methods,
      session_timeout_minutes: draft.session_timeout_minutes,
      force_reauth_for_sensitive_actions: draft.force_reauth_for_sensitive_actions,
    };
    setIsSaving(true);
    try {
      const updated = await runGuarded(() => workspaceSecurityService.updateSecurityPolicy(workspaceSlug, payload));
      await mutate(updated, false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Security policy updated",
        message: "Your workspace's security policy has been saved.",
      });
    } catch (error: unknown) {
      // A cancelled re-auth challenge is a deliberate no-op, not a failure
      // - `useSensitiveActionGuard` already closed the modal, nothing else
      // to surface here.
      if (isReauthRequiredError(error)) return;

      const err = error as { error?: string } & Record<string, string[] | undefined>;
      // Anti-lockout guards (exigence 4+10) return `{"error": "..."}` -
      // surface that exact, explicit message rather than a generic one.
      if (err?.error) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Could not save security policy", message: err.error });
        return;
      }
      // Field-level validation errors (e.g. `session_timeout_minutes`
      // out of range) come back as `{field: ["message"]}`.
      const firstFieldError = Object.values(err ?? {}).find((v) => Array.isArray(v) && v.length > 0)?.[0];
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not save security policy",
        message: firstFieldError ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !draft) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="64px" />
        <Loader.Item height="64px" />
        <Loader.Item height="64px" />
      </Loader>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsBoxedControlItem
        title="Enforce SSO-only login"
        description="Block email/password and magic-link login for members whose email belongs to a verified domain below. Requires at least one OAuth method enabled on this instance."
        control={
          <ToggleSwitch
            value={draft.enforce_sso_only}
            onChange={() => updateDraft({ enforce_sso_only: !draft.enforce_sso_only })}
            disabled={!isOwner || isSaving}
            size="sm"
          />
        }
      />

      <SettingsBoxedControlItem
        title="Who can invite members"
        description={MEMBER_INVITE_RESTRICTION_DESCRIPTIONS[draft.member_invite_restriction]}
        control={
          <CustomSelect
            value={draft.member_invite_restriction}
            onChange={(value: TWorkspaceSecurityPolicy["member_invite_restriction"]) =>
              updateDraft({ member_invite_restriction: value })
            }
            label={MEMBER_INVITE_RESTRICTION_LABELS[draft.member_invite_restriction]}
            disabled={!isOwner || isSaving}
            buttonClassName="border border-subtle bg-layer-2"
          >
            {MEMBER_INVITE_RESTRICTION_OPTIONS.map((option) => (
              <CustomSelect.Option key={option} value={option}>
                {MEMBER_INVITE_RESTRICTION_LABELS[option]}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        }
      />

      <SettingsBoxedControlItem
        title="Session idle timeout"
        description="Members are signed out of this workspace after this many minutes of inactivity. Leave empty to use your instance's default idle-timeout ceiling, configured by your instance administrator."
        control={
          <Input
            type="number"
            min={SESSION_TIMEOUT_MINUTES_MIN}
            max={SESSION_TIMEOUT_MINUTES_MAX}
            value={draft.session_timeout_minutes ?? ""}
            placeholder="Instance default"
            onChange={(e) =>
              updateDraft({ session_timeout_minutes: e.target.value === "" ? null : Number(e.target.value) })
            }
            disabled={!isOwner || isSaving}
            inputSize="sm"
            className="w-36"
          />
        }
      />

      <SettingsBoxedControlItem
        title="Require re-authentication for sensitive actions"
        description="Workspace deletion, full data export, security-policy changes and API token revocation will ask members to confirm their identity again if their last login was more than 15 minutes ago."
        control={
          <ToggleSwitch
            value={draft.force_reauth_for_sensitive_actions}
            onChange={() =>
              updateDraft({ force_reauth_for_sensitive_actions: !draft.force_reauth_for_sensitive_actions })
            }
            disabled={!isOwner || isSaving}
            size="sm"
          />
        }
      />

      <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-layer-2 px-4 py-3">
        <h4 className="text-body-sm-medium text-primary">Allowed authentication methods</h4>
        <p className="text-caption-md-regular text-tertiary">
          Subset of the methods enabled on this instance that members of this workspace may sign in with.
        </p>
        <div className="mt-1 flex flex-wrap gap-4">
          {ALLOWED_AUTH_METHOD_KEYS.map((method) => (
            <label key={method} className="flex items-center gap-2 text-body-xs-regular text-secondary">
              <input
                type="checkbox"
                checked={draft.allowed_auth_methods.includes(method)}
                onChange={() => toggleAuthMethod(method)}
                disabled={!isOwner || isSaving}
                className="size-3.5"
              />
              {ALLOWED_AUTH_METHOD_LABELS[method]}
            </label>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!isDirty} loading={isSaving}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      )}

      <ReauthModal
        workspaceSlug={workspaceSlug}
        isOpen={isReauthModalOpen}
        onClose={onReauthClose}
        onSuccess={onReauthSuccess}
      />
    </div>
  );
});
