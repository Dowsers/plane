/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTheme } from "next-themes";
// assets
import darkWikiAsset from "@/app/assets/empty-state/wiki/all-dark.webp?url";
import lightWikiAsset from "@/app/assets/empty-state/wiki/all-light.webp?url";
// components
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
// local imports
import { WikiCreateMenu } from "./create-menu";

type Props = {
  workspaceSlug: string;
  canCreate: boolean;
  onPageCreated: (pageId: string) => void;
};

/** Category 10, feature 4 - reuses the pre-existing (previously unused) Wiki empty-state illustrations under `apps/web/app/assets/empty-state/wiki/`. */
export const WikiEmptyState = observer(function WikiEmptyState(props: Props) {
  const { workspaceSlug, canCreate, onPageCreated } = props;
  const { resolvedTheme } = useTheme();
  const resolvedPath = resolvedTheme === "light" ? lightWikiAsset : darkWikiAsset;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <DetailedEmptyState
        title="Nothing here yet"
        description="Create your first Wiki page or folder to start documenting."
        assetPath={resolvedPath}
      />
      {canCreate && (
        <WikiCreateMenu
          workspaceSlug={workspaceSlug}
          collectionId={null}
          canCreate={canCreate}
          onPageCreated={onPageCreated}
        />
      )}
    </div>
  );
});
