/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import useSWR from "swr";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PoweredBy } from "@/components/common/powered-by";
import { DashboardNavbar } from "@/components/dashboards/navbar";
import { SomethingWentWrongError } from "@/components/issues/issue-layouts/error";
// hooks
import { PageNotFound } from "@/components/ui/not-found";
import { useDashboardPublish, useDashboardPublishList } from "@/hooks/store/dashboards";
import type { Route } from "./+types/layout";

const DEFAULT_TITLE = "Plane";
const DEFAULT_DESCRIPTION = "Made with Plane, an AI-powered work management platform with publishing capabilities.";

interface DashboardMetadata {
  name?: string;
  description?: string;
}

// Loader function runs on the server and fetches metadata + widget
// config/layout in one shot - see `plane.space.views.dashboard.
// DashboardPublicEndpoint`. Deliberately cheap (no computed widget data).
export async function loader({ params }: Route.LoaderArgs) {
  const { anchor } = params;

  // Validate anchor before using in request (only allow alphanumeric, -, _)
  const ANCHOR_REGEX = /^[a-zA-Z0-9_-]+$/;
  if (!ANCHOR_REGEX.test(anchor)) {
    return { metadata: null };
  }

  try {
    const response = await fetch(`${process.env.VITE_API_BASE_URL}/api/public/dashboards/${anchor}/`);

    if (!response.ok) {
      return { metadata: null };
    }

    const metadata: DashboardMetadata = await response.json();
    return { metadata };
  } catch (error) {
    console.error("Error fetching dashboard metadata:", error);
    return { metadata: null };
  }
}

// Meta function uses the loader data to generate metadata
export function meta({ loaderData }: Route.MetaArgs) {
  const metadata = loaderData?.metadata;

  const title = metadata?.name || DEFAULT_TITLE;
  const description = metadata?.description || DEFAULT_DESCRIPTION;

  return [
    { title },
    { name: "description", content: description },
    // OpenGraph metadata
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    // Twitter metadata
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

// Prevent loader from re-running on anchor param changes
export function shouldRevalidate({ currentParams, nextParams }: ShouldRevalidateFunctionArgs) {
  return currentParams.anchor !== nextParams.anchor;
}

function DashboardLayout(props: Route.ComponentProps) {
  const { anchor } = props.params;
  // store hooks
  const { fetchDashboard } = useDashboardPublishList();
  const dashboard = useDashboardPublish(anchor);
  // fetch the published dashboard's metadata + widget config/layout
  const { error } = useSWR(anchor ? `PUBLIC_DASHBOARD_${anchor}` : null, anchor ? () => fetchDashboard(anchor) : null, {
    revalidateOnFocus: false,
  });

  if (!dashboard && !error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-1">
        <LogoSpinner />
      </div>
    );
  }

  if (error?.status === 404) return <PageNotFound />;

  if (error || !dashboard) return <SomethingWentWrongError />;

  return (
    <>
      <div className="relative flex h-screen min-h-[500px] w-screen flex-col overflow-hidden">
        <div className="relative flex h-[60px] shrink-0 items-center border-b border-subtle-1 bg-surface-1 select-none">
          <DashboardNavbar dashboard={dashboard} />
        </div>
        <div className="relative size-full overflow-hidden overflow-y-auto bg-surface-2">
          <Outlet />
        </div>
      </div>
      <PoweredBy />
    </>
  );
}

export default observer(DashboardLayout);
