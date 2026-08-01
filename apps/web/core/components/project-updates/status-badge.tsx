/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TProjectUpdateStatus } from "@plane/types";
import { cn } from "@plane/utils";

const STATUS_STYLES: Record<TProjectUpdateStatus, string> = {
  ON_TRACK: "bg-success-subtle text-success-primary",
  AT_RISK: "bg-warning-subtle text-warning-primary",
  OFF_TRACK: "bg-danger-subtle text-danger-primary",
};

const STATUS_I18N_KEYS: Record<TProjectUpdateStatus, string> = {
  ON_TRACK: "project_updates.status.on_track",
  AT_RISK: "project_updates.status.at_risk",
  OFF_TRACK: "project_updates.status.off_track",
};

type Props = {
  status: TProjectUpdateStatus;
  className?: string;
};

export function ProjectUpdateStatusBadge(props: Props) {
  const { status, className } = props;
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-11 font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {t(STATUS_I18N_KEYS[status])}
    </span>
  );
}
