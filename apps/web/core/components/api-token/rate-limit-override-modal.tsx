/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { mutate } from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IApiToken } from "@plane/types";
import { Button, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// constants
import { API_TOKENS_LIST } from "@/constants/fetch-keys";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { RateLimitOverrideService } from "@/services/rate-limit-override.service";

const rateLimitOverrideService = new RateLimitOverrideService();

type TRateUnit = "min" | "hour";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  token: IApiToken;
};

/**
 * The override endpoint (`WorkspaceAPITokenRateLimitOverrideEndpoint`) is
 * workspace-scoped and Workspace Admin only, but this modal is opened from
 * the account-level "Personal Access Tokens" page
 * (apps/web/core/components/settings/profile/content/pages/api-tokens.tsx),
 * which has no `workspaceSlug` in its URL and a personal token itself has
 * no single owning workspace (`APIToken.workspace` is never set by
 * `ApiTokenEndpoint.post`). So the caller must explicitly pick, from their
 * own workspace list, which workspace's Admin role they're invoking this
 * as - access is (re-)checked live for whichever workspace is selected via
 * `fetchUserWorkspaceInfo`, since `workspaceUserInfo` is only ever
 * populated for workspaces the user has already visited this session.
 */
export function RequestRateLimitOverrideModal(props: Props) {
  const { isOpen, onClose, token } = props;
  // store hooks
  const { workspaces } = useWorkspace();
  const { allowPermissions, fetchUserWorkspaceInfo } = useUserPermissions();
  // states
  const [workspaceSlug, setWorkspaceSlug] = useState<string>("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<TRateUnit>("hour");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState<boolean | null>(null);

  // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array from Object.values, no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
  const workspaceOptions = Object.values(workspaces ?? {}).sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (isOpen && !workspaceSlug && workspaceOptions.length > 0) {
      setWorkspaceSlug(workspaceOptions[0].slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceOptions.length]);

  useEffect(() => {
    if (!isOpen || !workspaceSlug) return;
    let cancelled = false;
    setHasAdminAccess(null);
    setIsCheckingAccess(true);
    fetchUserWorkspaceInfo(workspaceSlug)
      .then(() => {
        if (cancelled) return;
        setHasAdminAccess(allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug));
        return;
      })
      .catch(() => {
        if (!cancelled) setHasAdminAccess(false);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingAccess(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug]);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setValue("");
      setUnit("hour");
      setReason("");
      setWorkspaceSlug("");
      setHasAdminAccess(null);
    }, 300);
  };

  const handleSubmit = async () => {
    const parsedValue = Number(value);
    if (!workspaceSlug) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Select a workspace first." });
      return;
    }
    if (!value || Number.isNaN(parsedValue) || parsedValue <= 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Enter a positive target rate." });
      return;
    }
    if (!reason.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "A reason is required for traceability." });
      return;
    }

    setIsSubmitting(true);
    try {
      await rateLimitOverrideService.override(workspaceSlug, token.id, {
        allowed_rate_limit: `${Math.round(parsedValue)}/${unit}`,
        reason: reason.trim(),
      });
      await mutate(API_TOKENS_LIST);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Rate limit override applied." });
      handleClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to apply the rate limit override.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h4 className="text-18 font-medium text-primary">Request rate limit override</h4>
        <p className="text-13 text-tertiary">
          Applies to the personal access token &quot;{token.label}&quot;. Only a Workspace Admin of the workspace you
          select below can grant this, and the change is fully traceable (who, when, why).
        </p>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Workspace</span>
          <CustomSelect
            value={workspaceSlug}
            label={workspaceOptions.find((workspace) => workspace.slug === workspaceSlug)?.name ?? "Select a workspace"}
            onChange={(val: string) => setWorkspaceSlug(val)}
            input
          >
            {workspaceOptions.map((workspace) => (
              <CustomSelect.Option key={workspace.id} value={workspace.slug}>
                {workspace.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          {isCheckingAccess && <span className="text-11 text-tertiary">Checking your access…</span>}
          {!isCheckingAccess && hasAdminAccess === false && (
            <span className="text-11 text-danger-primary">
              You need Workspace Admin access in this workspace to request an override here.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Target rate</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              placeholder="e.g. 500"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputSize="sm"
              className="flex-1"
            />
            <CustomSelect
              value={unit}
              label={unit === "min" ? "Per minute" : "Per hour"}
              onChange={(val: TRateUnit) => setUnit(val)}
              input
            >
              <CustomSelect.Option value="min">Per minute</CustomSelect.Option>
              <CustomSelect.Option value="hour">Per hour</CustomSelect.Option>
            </CustomSelect>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Reason (required)</span>
          <TextArea
            placeholder="e.g. CI/CD sync integration needs a higher burst allowance"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            textAreaSize="sm"
            className="min-h-[70px] w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={hasAdminAccess === false || isCheckingAccess || !workspaceSlug}
          >
            Apply override
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
