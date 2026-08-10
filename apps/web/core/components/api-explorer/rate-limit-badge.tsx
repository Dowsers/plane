/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle, Gauge } from "lucide-react";
// plane imports
import { Badge } from "@plane/propel/badge";
import { Tooltip } from "@plane/propel/tooltip";
// local imports
import { RATE_LIMIT_LOW_THRESHOLD, type TRateLimitInfo } from "./utils";

type Props = {
  info: TRateLimitInfo | null;
};

/**
 * Spec exigence 8 (docs/feature-specs/08-api-webhooks-cli.md, "6.
 * Explorateur d'API interactif", in plane-selfhost): reads the
 * `X-RateLimit-*` headers added in category 8 feature 2 off the most
 * recent real response and shows a permanent badge, warning below the
 * spec's own example threshold and flipping to a hard "0 remaining" state
 * once exhausted - the execute button disabling itself on that state is
 * handled by the caller (request-builder.tsx), not this component.
 */
export function RateLimitBadge({ info }: Props) {
  if (!info || info.limit === null || info.remaining === null) {
    return (
      <Tooltip tooltipContent="No rate-limit information yet - it appears on the first real API call.">
        <Badge variant="neutral" size="base" prependIcon={<Gauge />}>
          Rate limit: n/a
        </Badge>
      </Tooltip>
    );
  }

  const isExhausted = info.remaining <= 0;
  const isLow = info.remaining > 0 && info.remaining <= RATE_LIMIT_LOW_THRESHOLD;

  return (
    <Tooltip
      tooltipContent={
        isExhausted
          ? "This token's rate-limit quota is exhausted - executing is disabled until it resets."
          : "Requests remaining in this token's current rate-limit window."
      }
    >
      <Badge
        variant={isExhausted ? "danger" : isLow ? "warning" : "success"}
        size="base"
        prependIcon={isExhausted || isLow ? <AlertTriangle /> : <Gauge />}
      >
        {info.remaining}/{info.limit} requests left
      </Badge>
    </Tooltip>
  );
}
