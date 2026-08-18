/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sparkles } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectUpdateAIGenerationMetadata } from "@plane/types";
import { cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";

type Props = {
  createdAt: string;
  generationMetadata: TProjectUpdateAIGenerationMetadata | Record<string, never> | null;
  className?: string;
};

/**
 * Discreet "Drafted with AI assistance" badge for a published `ProjectUpdate`
 * with `is_ai_assisted: true` - category 9, feature 6 (docs/feature-specs/
 * 09-ai-features.md "6. Redaction assistee des mises a jour de statut" in
 * plane-selfhost, spec's own wording: "badge discret ... avec tooltip (date
 * de generation, modele utilise)"). Callers are responsible for gating on
 * `update.is_ai_assisted` before rendering - mirrors `AgentBadge`'s own
 * caller-gates-visibility convention (apps/web/core/components/common/agent-badge.tsx),
 * and reuses the same small-Pill-plus-icon visual language.
 */
export function ProjectUpdateAIBadge(props: Props) {
  const { createdAt, generationMetadata, className } = props;
  const { t } = useTranslation();

  const modelName = (generationMetadata as TProjectUpdateAIGenerationMetadata | null)?.llm_model;
  const tooltipContent = t("project_updates.ai_draft.badge_tooltip", {
    date: `${renderFormattedDate(createdAt)}, ${renderFormattedTime(createdAt)}`,
    model: modelName || t("project_updates.ai_draft.unknown_model"),
  });

  return (
    <Tooltip tooltipContent={tooltipContent} position="top">
      <span>
        <Pill
          variant={EPillVariant.INFO}
          size={EPillSize.XS}
          className={cn("inline-flex shrink-0 items-center gap-1", className)}
        >
          <Sparkles className="size-3" aria-hidden="true" />
          {t("project_updates.ai_draft.badge_label")}
        </Pill>
      </span>
    </Tooltip>
  );
}
