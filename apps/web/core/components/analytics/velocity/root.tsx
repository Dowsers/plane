/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import AnalyticsWrapper from "../analytics-wrapper";
import VelocityChart from "./velocity-chart";

function Velocity() {
  return (
    <AnalyticsWrapper i18nTitle="workspace_analytics.velocity">
      <div className="flex flex-col gap-14">
        <VelocityChart />
      </div>
    </AnalyticsWrapper>
  );
}

export { Velocity };
