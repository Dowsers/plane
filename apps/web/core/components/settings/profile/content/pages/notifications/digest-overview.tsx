/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { DigestOverviewRow } from "./digest-overview-row";

/**
 * Category 9 (AI features, docs/feature-specs/09-ai-features.md in
 * plane-selfhost), feature 5 - "Digest periodique automatise": the
 * "Digest periodique" card on Personal Settings > Notifications (the
 * spec's own primary suggestion, "Considerations API/UX" section). One row
 * per workspace the user belongs to - see `DigestOverviewRow` for why this
 * page links out to each workspace's own `/digests` page for the full
 * settings form rather than embedding it directly.
 */
export const DigestOverviewCard = observer(function DigestOverviewCard() {
  const { t } = useTranslation();
  const { workspaces } = useWorkspace();
  const workspaceList = Object.values(workspaces ?? {});

  if (workspaceList.length === 0) return null;

  return (
    <div className="mt-7 flex flex-col gap-3 border-t border-subtle pt-7">
      <div>
        <h5 className="text-14 font-medium text-primary">{t("digest.overview.heading")}</h5>
        <p className="text-13 text-tertiary">{t("digest.overview.description")}</p>
      </div>
      <div className="flex flex-col gap-2">
        {workspaceList.map((workspace) => (
          <DigestOverviewRow key={workspace.id} workspace={workspace} />
        ))}
      </div>
    </div>
  );
});
