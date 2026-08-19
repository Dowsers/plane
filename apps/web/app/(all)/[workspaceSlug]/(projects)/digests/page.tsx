/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ContentWrapper } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { DigestPreferencesPanel } from "@/components/digests";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";

/**
 * Default landing content for the dedicated "Digests" surface (category 9,
 * feature 5 - "Digest periodique automatise") when no specific digest is
 * selected - the personal preferences form (frequency/day/time/scope/
 * channels + "Send a preview now"). Past digests are picked from the
 * sidebar list (`DigestsSidebarRoot`) rendered by the parent layout.
 */
function DigestsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? t("digest.page_label", { workspace: currentWorkspace.name }) : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <ContentWrapper>
        <DigestPreferencesPanel workspaceSlug={workspaceSlug} />
      </ContentWrapper>
    </>
  );
}

export default observer(DigestsPage);
