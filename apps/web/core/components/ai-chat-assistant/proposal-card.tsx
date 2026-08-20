/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Check, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TAIChangeProposal } from "@plane/types";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  proposal: TAIChangeProposal;
  isResolving: boolean;
  onResolve: (proposalId: string, action: "approve" | "reject") => Promise<unknown>;
};

/** Renders an arbitrary JSON proposal value (`previous_value`/
 * `proposed_value`) as a short human-readable string. `field_name`s like
 * `assignees`/`labels` carry raw id lists rather than resolved display
 * names (resolving those would need per-field lookups against the
 * target's own project - state/member/label stores that may not even be
 * loaded for a project the viewer isn't currently browsing) - a
 * documented, scoped simplification; the diff is still meaningful since
 * `field_name` itself is always shown alongside it. */
const formatProposalValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const STATUS_BADGE_CLASSNAME: Record<TAIChangeProposal["status"], string> = {
  pending: "bg-layer-3 text-secondary",
  approved: "bg-success-subtle text-success",
  applied: "bg-success-subtle text-success",
  rejected: "bg-danger-subtle text-danger",
  expired: "bg-layer-3 text-tertiary",
};

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app", "propose" mode
 * (exigence 5/6). One atomic, individually-approvable suggested change -
 * a field name plus its before/after diff, with an approve/reject
 * affordance while `status === "pending"`. Once resolved, shows the
 * resulting status as a plain badge instead (no further action possible -
 * matches the backend's own `_guard_reviewable` freezing an already-
 * resolved/expired proposal).
 */
export const AIChangeProposalCard = (props: Props) => {
  const { proposal, isResolving, onResolve } = props;
  const { t } = useTranslation();
  const [localError, setLocalError] = useState<string | null>(null);

  const isPending = proposal.status === "pending";

  const handleResolve = async (action: "approve" | "reject") => {
    setLocalError(null);
    try {
      await onResolve(proposal.id, action);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: action === "approve" ? t("ai.proposals.approve_success") : t("ai.proposals.reject_success"),
      });
    } catch (error: unknown) {
      const err = error as { error?: string; status?: number };
      const message = err?.error ?? t("ai.proposals.resolve_error");
      setLocalError(message);
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border-[0.5px] border-subtle bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-13 font-medium text-primary">{proposal.field_name}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-11 font-medium capitalize",
            STATUS_BADGE_CLASSNAME[proposal.status]
          )}
        >
          {t(`ai.proposals.status.${proposal.status}`)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-13">
        <span className="rounded-sm bg-layer-2 px-2 py-1 text-secondary line-through">
          {formatProposalValue(proposal.previous_value)}
        </span>
        <span className="text-tertiary">→</span>
        <span className="rounded-sm bg-layer-2 px-2 py-1 font-medium text-primary">
          {formatProposalValue(proposal.proposed_value)}
        </span>
      </div>

      {localError && <p className="text-danger text-12">{localError}</p>}

      {isPending && (
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            prependIcon={<Check className="size-3.5" />}
            loading={isResolving}
            onClick={() => handleResolve("approve")}
          >
            {t("ai.proposals.approve")}
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            prependIcon={<X className="size-3.5" />}
            disabled={isResolving}
            onClick={() => handleResolve("reject")}
          >
            {t("ai.proposals.reject")}
          </Button>
        </div>
      )}
    </div>
  );
};
