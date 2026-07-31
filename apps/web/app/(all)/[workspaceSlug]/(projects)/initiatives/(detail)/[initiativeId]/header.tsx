/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Target } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";

export const InitiativeDetailHeader = observer(function InitiativeDetailHeader() {
  const { workspaceSlug, initiativeId } = useParams();
  const { t } = useTranslation();
  const { getInitiativeById } = useInitiative();

  const initiative = initiativeId ? getInitiativeById(initiativeId.toString()) : null;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                href={`/${workspaceSlug}/initiatives/`}
                label={t("initiatives.label")}
                icon={<Target className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {initiative && <Breadcrumbs.Item component={<BreadcrumbLink label={initiative.name} />} />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
