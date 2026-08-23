/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Plus } from "lucide-react";
// plane imports
import { DOMAIN_VERIFICATION_METHOD_LABELS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkspaceVerifiedDomain } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// services
import workspaceSecurityService from "@/services/workspace-security.service";
// local imports
import { AddVerifiedDomainModal } from "./add-verified-domain-modal";

type Props = {
  workspaceSlug: string;
  isOwner: boolean;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * Workspace Settings > Security > "Verified domains" sub-panel. List is
 * Admin+ readable; add/verify/delete are Owner-only (matching
 * `WorkspaceVerifiedDomainEndpoint`/`WorkspaceVerifiedDomainVerifyEndpoint`).
 * "Verify now" is a SYNCHRONOUS round trip (backend's own decision, both
 * DNS TXT and HTML-file checks are hard-bounded at 5s) - a simple
 * per-row loading state, no polling.
 */
export const VerifiedDomainsPanel = observer(function VerifiedDomainsPanel(props: Props) {
  const { workspaceSlug, isOwner } = props;
  // state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    ["WORKSPACE_VERIFIED_DOMAINS", workspaceSlug],
    () => workspaceSecurityService.listVerifiedDomains(workspaceSlug),
    { revalidateOnFocus: false }
  );

  const handleCreated = (domain: TWorkspaceVerifiedDomain) => {
    mutate((prev) => [domain, ...(prev ?? [])], false);
  };

  const handleVerify = async (domain: TWorkspaceVerifiedDomain) => {
    setVerifyingId(domain.id);
    try {
      const result = await workspaceSecurityService.verifyDomain(workspaceSlug, domain.id);
      if (result.is_verified) {
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Domain verified", message: result.detail });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: "Verification failed", message: result.detail });
      }
      await mutate();
    } catch (error: unknown) {
      const err = error as { detail?: string; error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Verification failed",
        message: err?.detail ?? err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await workspaceSecurityService.deleteVerifiedDomain(workspaceSlug, pendingDeleteId);
      await mutate((prev) => (prev ?? []).filter((d) => d.id !== pendingDeleteId), false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Domain removed", message: "The verified domain was removed." });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not remove domain",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-body-xs-regular text-tertiary">
          Domains you&apos;ve proven ownership of - required before you can enforce SSO-only login for them.
        </p>
        {isOwner && (
          <Button
            variant="secondary"
            size="sm"
            prependIcon={<Plus className="size-3.5" />}
            onClick={() => setIsAddOpen(true)}
          >
            Add domain
          </Button>
        )}
      </div>

      {isLoading ? (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="48px" />
          <Loader.Item height="48px" />
        </Loader>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyStateCompact
          assetKey="search"
          title="No verified domains yet"
          description={
            isOwner
              ? "Add a domain to start enforcing SSO-only login for it."
              : "The workspace Owner hasn't added any verified domains yet."
          }
          align="center"
          rootClassName="py-10"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-subtle bg-layer-1 text-left text-tertiary">
                <th className="px-3 py-2 font-medium">Domain</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Verified at</th>
                {isOwner && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {data?.map((domain) => (
                <tr key={domain.id} className="border-b border-subtle-1 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-secondary">{domain.domain}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-tertiary">
                    {DOMAIN_VERIFICATION_METHOD_LABELS[domain.verification_method]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-11 ${
                        domain.is_verified
                          ? "bg-success-subtle text-success-primary"
                          : "bg-warning-subtle text-warning-primary"
                      }`}
                    >
                      {domain.is_verified ? "Verified" : "Pending"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-tertiary">
                    {domain.verified_at ? renderFormattedDate(domain.verified_at) : "—"}
                  </td>
                  {isOwner && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {!domain.is_verified && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleVerify(domain)}
                            loading={verifyingId === domain.id}
                          >
                            Verify now
                          </Button>
                        )}
                        <Button variant="error-outline" size="sm" onClick={() => setPendingDeleteId(domain.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddVerifiedDomainModal
        workspaceSlug={workspaceSlug}
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={handleCreated}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDeleteId)}
        handleClose={() => setPendingDeleteId(null)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title="Remove verified domain"
        content="Are you sure you want to remove this verified domain? Any SSO enforcement relying on it will stop applying."
      />
    </div>
  );
});
