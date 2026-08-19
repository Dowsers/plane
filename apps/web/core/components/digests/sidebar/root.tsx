/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TDigestRun } from "@plane/types";
import { Breadcrumbs, Button, Header, Loader } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// services
import { DigestService } from "@/services/digest.service";
// local imports
import { DigestSidebarItem } from "./item";

const digestService = new DigestService();

/**
 * Sidebar (list) side of the dedicated "Digests" surface - category 9 (AI
 * features, docs/feature-specs/09-ai-features.md in plane-selfhost),
 * feature 5. Deliberately a NEW, standalone route
 * (`:workspaceSlug/digests`) rather than a third tab bolted onto
 * `NOTIFICATION_TABS`/`WorkspaceNotificationStore`
 * (packages/constants/src/notification.ts, apps/web/core/store/
 * notifications/workspace-notifications.store.ts) - that store's
 * `currentNotificationTab`/`notificationIdsByWorkspaceId` filtering is
 * tightly typed and coupled to the real-time notification data model
 * (`TNotification`, unread counts, mark-as-read), which has no shared shape
 * with `TDigestRun`. Retrofitting a third value there would mean widening a
 * narrow union type used throughout that store for something structurally
 * unrelated - exactly the "impractical" case call out in this feature's own
 * build notes. Instead, this surface is surfaced as a sibling entry point
 * from the real-time inbox (see the "Digests" button added to
 * `NotificationSidebarHeaderOptions`) while staying implementation-wise
 * independent, matching the backend's own "dedicated queryable Digests
 * surface, independent of the real-time notification feed" framing.
 */
export const DigestsSidebarRoot = observer(function DigestsSidebarRoot() {
  const { workspaceSlug, digestId } = useParams();
  const { t } = useTranslation();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<TDigestRun[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const slug = workspaceSlug?.toString();

  const { isLoading } = useSWR(
    slug ? `DIGEST_RUNS_${slug}` : null,
    slug
      ? async () => {
          const response = await digestService.listDigests(slug);
          setItems(response.results ?? []);
          setHasMore(!!response.next_page_results);
          setCursor(response.next_cursor);
          return response;
        }
      : null
  );

  const handleLoadMore = async () => {
    if (!slug || !cursor) return;
    setIsLoadingMore(true);
    try {
      const response = await digestService.listDigests(slug, cursor);
      setItems((prev) => [...prev, ...(response.results ?? [])]);
      setHasMore(!!response.next_page_results);
      setCursor(response.next_cursor);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (!slug) return null;

  return (
    <div className="relative flex h-full w-full flex-shrink-0 flex-col border-0 border-subtle bg-surface-1 md:w-3/12 md:border-r">
      <Header className="flex-shrink-0 bg-surface-1">
        <Header.LeftItem>
          <Breadcrumbs>
            <Breadcrumbs.Item component={<BreadcrumbLink label={t("digest.label")} disableTooltip />} />
          </Breadcrumbs>
        </Header.LeftItem>
        <Header.RightItem>
          <Link
            href={`/${slug}/notifications`}
            className="flex items-center gap-1 text-12 text-tertiary hover:text-secondary"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("digest.nav.back_to_inbox")}
          </Link>
        </Header.RightItem>
      </Header>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <Loader className="flex flex-col gap-2 p-4">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="text-13 font-medium text-primary">{t("digest.empty_state.no_digests_title")}</p>
            <p className="text-12 text-tertiary">{t("digest.empty_state.no_digests_description")}</p>
          </div>
        )}

        {!isLoading &&
          items.map((digest) => (
            <DigestSidebarItem key={digest.id} workspaceSlug={slug} digest={digest} isActive={digest.id === digestId} />
          ))}

        {hasMore && (
          <div className="p-3">
            <Button
              variant="neutral-primary"
              size="sm"
              onClick={handleLoadMore}
              loading={isLoadingMore}
              className="w-full"
            >
              {t("load_more")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});
