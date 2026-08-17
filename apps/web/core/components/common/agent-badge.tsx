/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Bot } from "lucide-react";
// plane imports
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { cn } from "@plane/utils";

type TAgentBadge = {
  className?: string;
  size?: EPillSize.XS | EPillSize.SM;
};

/**
 * Shared "Agent" badge for the first-class workspace-agent actor type -
 * category 9, feature 7 (docs/feature-specs/09-ai-features.md "7. Type
 * d'acteur agent de premiere classe" in plane-selfhost, exigence 5: "toute
 * surface affichant un acteur... affiche un badge visuel distinct (icone
 * robot + libelle 'Agent')").
 *
 * Callers are responsible for gating this on `isWorkspaceAgentActor(actor)`
 * (@plane/utils) before rendering - never on `is_bot` alone, since the six
 * category-7 integration bots and `WORKSPACE_SEED` must stay unbadged
 * (and, per the backend's own visibility rule, invisible) exactly as
 * before.
 */
export function AgentBadge(props: TAgentBadge) {
  const { className, size = EPillSize.XS } = props;

  return (
    <Pill variant={EPillVariant.INFO} size={size} className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <Bot className="size-3" aria-hidden="true" />
      Agent
    </Pill>
  );
}
