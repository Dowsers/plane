/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import changelogEntries from "@/app/assets/changelog.json";
import { ProductUpdatesFallback } from "@/components/global/product-updates/fallback";

type TChangelogEntry = {
  hash: string;
  subject: string;
  author: string;
  date: string;
};

const entries = changelogEntries as TChangelogEntry[];

export const ProductUpdatesChangelog = observer(function ProductUpdatesChangelog() {
  if (entries.length === 0) {
    return <ProductUpdatesFallback description="No changelog entries are available yet." variant="self-managed" />;
  }

  return (
    <div className="vertical-scrollbar relative mx-0.5 flex scrollbar-xs h-[550px] flex-col overflow-hidden overflow-y-scroll px-6">
      <ul className="flex flex-col divide-y divide-subtle">
        {entries.map((entry) => (
          <li key={entry.hash} className="flex flex-col gap-1 py-3">
            <div className="flex items-center gap-2 text-11 text-secondary">
              <span>
                {new Date(entry.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span>&middot;</span>
              <span>{entry.author}</span>
              <span>&middot;</span>
              <span className="font-mono">{entry.hash}</span>
            </div>
            <div className="text-13 text-primary">{entry.subject}</div>
          </li>
        ))}
      </ul>
    </div>
  );
});
