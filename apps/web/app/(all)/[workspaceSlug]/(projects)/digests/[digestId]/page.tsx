/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { DigestDetailRoot } from "@/components/digests";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";

function DigestDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, digestId } = params;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? t("digest.page_label", { workspace: currentWorkspace.name }) : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <DigestDetailRoot workspaceSlug={workspaceSlug} digestId={digestId} />
    </>
  );
}

export default observer(DigestDetailPage);
