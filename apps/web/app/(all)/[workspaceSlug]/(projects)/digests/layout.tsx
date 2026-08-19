/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { DigestsSidebarRoot } from "@/components/digests";

export default function DigestsLayout() {
  return (
    <div className="relative flex h-full w-full items-center overflow-hidden">
      <DigestsSidebarRoot />
      <div className="h-full w-full overflow-hidden overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
