/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
// local imports
import { ProjectUpdatesListHeader } from "./header";

export default function ProjectUpdatesListLayout() {
  return (
    <>
      <AppHeader header={<ProjectUpdatesListHeader />} />
      <Outlet />
    </>
  );
}
