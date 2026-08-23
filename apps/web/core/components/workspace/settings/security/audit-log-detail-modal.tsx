/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { X } from "lucide-react";
// plane imports
import { AUDIT_EVENT_TYPE_LABELS } from "@plane/constants";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { renderFormattedDate, renderFormattedTime } from "@plane/utils";
// services
import workspaceAuditLogService from "@/services/workspace-audit-log.service";

type Props = {
  workspaceSlug: string;
  auditLogId: string | null;
  onClose: () => void;
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption-sm-medium text-tertiary uppercase">{label}</span>
      <div className="text-body-xs-regular text-secondary">{value}</div>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined || (typeof value === "object" && Object.keys(value).length === 0)) {
    return <span className="text-tertiary">—</span>;
  }
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-layer-1 p-2 text-caption-sm-regular whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3+5 merged - "Details" side panel for a single
 * audit log entry (exigence: "bouton 'Details' (ouvre un panneau lateral
 * avec old_value/new_value/metadata bruts)"). This fork's UI primitives
 * only offer centered modals (`EModalPosition` has no side-drawer
 * position, see packages/ui/src/modals/constants.ts), so this is built as
 * a centered modal rather than a true side drawer - functionally
 * equivalent (full payload, opened on row click, dismissible), just not a
 * sliding panel.
 */
export function AuditLogDetailModal(props: Props) {
  const { workspaceSlug, auditLogId, onClose } = props;

  const { data, isLoading } = useSWR(
    auditLogId ? ["WORKSPACE_AUDIT_LOG_DETAIL", workspaceSlug, auditLogId] : null,
    auditLogId ? () => workspaceAuditLogService.retrieve(workspaceSlug, auditLogId) : null
  );

  return (
    <ModalCore isOpen={Boolean(auditLogId)} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-16 font-medium text-primary">
            {data ? AUDIT_EVENT_TYPE_LABELS[data.event_type] : "Audit log entry"}
          </h4>
          <button onClick={onClose} type="button" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !data ? (
          <Loader className="flex flex-col gap-3">
            <Loader.Item height="20px" />
            <Loader.Item height="20px" />
            <Loader.Item height="60px" />
          </Loader>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <DetailRow
              label="Date"
              value={`${renderFormattedDate(data.created_at)}, ${renderFormattedTime(data.created_at)}`}
            />
            <DetailRow label="Event" value={AUDIT_EVENT_TYPE_LABELS[data.event_type]} />
            <DetailRow label="Actor" value={data.actor?.email ?? data.actor_email_snapshot ?? "System"} />
            <DetailRow
              label="Target"
              value={
                data.target_user?.email ??
                data.target_email_snapshot ??
                (data.target_type ? `${data.target_type} (${data.target_id})` : "—")
              }
            />
            <DetailRow label="IP address" value={data.ip_address ?? "—"} />
            <DetailRow label="User agent" value={data.user_agent || "—"} />
            <div className="col-span-2">
              <DetailRow label="Old value" value={<JsonBlock value={data.old_value} />} />
            </div>
            <div className="col-span-2">
              <DetailRow label="New value" value={<JsonBlock value={data.new_value} />} />
            </div>
            <div className="col-span-2">
              <DetailRow label="Metadata" value={<JsonBlock value={data.metadata} />} />
            </div>
          </div>
        )}
      </div>
    </ModalCore>
  );
}
