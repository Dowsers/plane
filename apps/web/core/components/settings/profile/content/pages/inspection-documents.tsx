/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { MyInspectionSignatures } from "@/components/inspection";
import { SettingsHeading } from "@/components/settings/heading";

/**
 * Account Settings > "My signed documents" - the evaluator's own personal
 * record of every inspection undertaking they have signed, across all
 * workspaces and projects, with the evidentiary PDF for each.
 *
 * Lives under the ACCOUNT rather than a workspace on purpose: the point of a
 * personal record is that it survives leaving a workspace, and the endpoint
 * behind it (`/users/me/inspection-signatures/`) is user-scoped for the same
 * reason.
 */
export const InspectionDocumentsProfileSettings = observer(function InspectionDocumentsProfileSettings() {
  const { t } = useTranslation();

  return (
    <div className="w-full">
      <SettingsHeading
        title={t("inspection.my_signatures.title")}
        description={t("inspection.my_signatures.description")}
      />
      <MyInspectionSignatures className="mt-6" />
    </div>
  );
});
