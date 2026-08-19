/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TDigestRun } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";

type Props = {
  workspaceSlug: string;
  digest: TDigestRun;
  isActive: boolean;
};

const STATUS_COLOR_CLASS: Record<TDigestRun["status"], string> = {
  PENDING: "text-tertiary",
  GENERATED: "text-secondary",
  SENT: "text-success",
  SKIPPED_EMPTY: "text-tertiary",
  FAILED: "text-danger",
};

export function DigestSidebarItem(props: Props) {
  const { workspaceSlug, digest, isActive } = props;
  const { t } = useTranslation();

  return (
    <Link
      href={`/${workspaceSlug}/digests/${digest.id}`}
      className={cn(
        "flex flex-col gap-1 border-b border-subtle px-4 py-3 text-13 hover:bg-layer-1",
        isActive && "bg-layer-1"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-primary">{t(`digest.frequency.${digest.frequency}`)}</span>
        <span className={cn("text-11", STATUS_COLOR_CLASS[digest.status])}>{t(`digest.status.${digest.status}`)}</span>
      </div>
      <span className="text-11 text-tertiary">
        {renderFormattedDate(digest.period_start)} - {renderFormattedDate(digest.period_end)}
      </span>
      <span className="text-11 text-tertiary">{t("digest.item_count", { count: digest.item_count })}</span>
    </Link>
  );
}
