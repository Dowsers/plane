/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSLAPolicy } from "@plane/types";
import { Button, Loader } from "@plane/ui";
// services
import { SLAPolicyService } from "@/services/sla-policy.service";
// local imports
import { SLAPolicyFormModal } from "./policy-form-modal";
import { SLAPolicyListItem } from "./policy-list-item";

const slaPolicyService = new SLAPolicyService();

const POLICIES_KEY = (workspaceSlug: string) => `SLA_POLICIES_${workspaceSlug}`;

type Props = {
  workspaceSlug: string;
};

/**
 * "Policies" tab of the SLA workspace settings screen - list + create/
 * edit/duplicate/delete/reorder. No mobx store here, deliberately -
 * follows the sibling `WorkflowRulesRoot`/`TriageRulesRoot` convention of
 * plain service calls + SWR rather than a dedicated store, since this data
 * has no cross-cutting consumers elsewhere in the app (the issue detail
 * sidebar widget and the compliance report both fetch their own,
 * differently-shaped data independently).
 *
 * Reorder is implemented as swap-with-neighbor "move up"/"move down"
 * buttons rather than drag-and-drop - this fork has no existing
 * drag-and-drop list precedent to reuse for a plain settings list (the
 * closest, `@plane/ui`'s `sortable`, is used for kanban/board columns, a
 * materially heavier integration for a short admin list), and the
 * backend's own `sort_order` is a plain float with no atomic "move
 * between two neighbors" endpoint - two sequential PATCHes swapping the
 * two adjacent policies' `sort_order` values achieves the same effect
 * safely, since policies are already returned sorted by `sort_order` (see
 * `SLAPolicy.Meta.ordering`), so list index directly reflects precedence.
 */
export function SLAPolicyListRoot(props: Props) {
  const { workspaceSlug } = props;
  const [editingPolicy, setEditingPolicy] = useState<TSLAPolicy | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: policies, isLoading } = useSWR(POLICIES_KEY(workspaceSlug), () => slaPolicyService.list(workspaceSlug));

  const refresh = () => mutate(POLICIES_KEY(workspaceSlug));

  const handleReorder = async (policy: TSLAPolicy, direction: "up" | "down") => {
    if (!policies) return;
    const index = policies.findIndex((item) => item.id === policy.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= policies.length) return;
    const swapWith = policies[swapIndex];
    try {
      await Promise.all([
        slaPolicyService.update(workspaceSlug, policy.id, { sort_order: swapWith.sort_order }),
        slaPolicyService.update(workspaceSlug, swapWith.id, { sort_order: policy.sort_order }),
      ]);
      refresh();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to reorder policies." });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-12 text-tertiary">
          Lower number = higher precedence. When more than one policy matches a work item, the one listed first wins.
        </p>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setEditingPolicy(null);
            setIsFormOpen(true);
          }}
        >
          New policy
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="70px" />
            <Loader.Item height="70px" />
          </Loader>
        )}
        {!isLoading && (policies?.length ?? 0) === 0 && (
          <p className="text-13 text-tertiary">No SLA policies configured yet.</p>
        )}
        {policies?.map((policy, index) => (
          <SLAPolicyListItem
            key={policy.id}
            policy={policy}
            workspaceSlug={workspaceSlug}
            canMoveUp={index > 0}
            canMoveDown={index < policies.length - 1}
            onEdit={() => {
              setEditingPolicy(policy);
              setIsFormOpen(true);
            }}
            onChanged={refresh}
            onReorder={(direction) => handleReorder(policy, direction)}
          />
        ))}
      </div>

      <SLAPolicyFormModal
        isOpen={isFormOpen}
        handleClose={() => setIsFormOpen(false)}
        workspaceSlug={workspaceSlug}
        policy={editingPolicy}
        onSaved={refresh}
      />
    </div>
  );
}
