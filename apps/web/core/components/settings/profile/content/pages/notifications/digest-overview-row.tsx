/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IWorkspace } from "@plane/types";
import { getButtonStyling } from "@plane/propel/button";
// services
import { DigestService } from "@/services/digest.service";

const digestService = new DigestService();

type Props = {
  workspace: IWorkspace;
};

/**
 * One row of the "Periodic digest" overview card on the global, workspace-
 * agnostic Personal Settings > Notifications page
 * (apps/web/core/components/settings/profile/content/pages/notifications/root.tsx).
 *
 * `DigestPreference` is scoped to (user, workspace) - see
 * apps/api/plane/db/models/digest.py - but this settings page's own route
 * (`/settings/profile/notifications`) carries no `:workspaceSlug`, so
 * `useWorkspace().currentWorkspace`/`useProject().joinedProjectIds` (both
 * derived from the URL's workspace slug, see `RouterStore.workspaceSlug`)
 * are unavailable here. Rather than bolt an unprecedented workspace
 * selector onto this page and fetch that other workspace's projects
 * outside the normal MobX store flow just to render a full inline form,
 * this row fetches only the lightweight preference status directly
 * (bypassing the store, same low-level `DigestService` call the dedicated
 * page uses) and links out to `/<slug>/digests`, where the full settings
 * form (`DigestPreferencesPanel`) lives with correct workspace context.
 */
export function DigestOverviewRow(props: Props) {
  const { workspace } = props;
  const { t } = useTranslation();

  const { data, isLoading } = useSWR(`DIGEST_PREFERENCES_OVERVIEW_${workspace.slug}`, () =>
    digestService.getPreferences(workspace.slug)
  );

  const statusLabel = (() => {
    if (isLoading || !data) return "...";
    if (!data.is_enabled) return t("digest.overview.status_off");
    const frequency = t(`digest.frequency.${data.frequency}`);
    return data.send_email
      ? t("digest.overview.status_on_in_app_email", { frequency })
      : t("digest.overview.status_on_in_app", { frequency });
  })();

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-subtle p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-13 font-medium text-primary">{workspace.name}</span>
        <span className="text-12 text-tertiary">{statusLabel}</span>
      </div>
      <Link href={`/${workspace.slug}/digests`} className={getButtonStyling("secondary", "sm")}>
        {t("digest.overview.configure")}
      </Link>
    </div>
  );
}
