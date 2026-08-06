/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// types
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
// components
import { SPREADSHEET_COLUMNS } from "@/plane-web/components/issues/issue-layouts/utils";
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { getIssueUpdateErrorMessage } from "@/helpers/workflow-transition.helper";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";

type Props = {
  displayProperties: IIssueDisplayProperties;
  issueDetail: TIssue;
  disableUserActions: boolean;
  property: keyof IIssueDisplayProperties;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  isEstimateEnabled: boolean;
};

export const IssueColumn = observer(function IssueColumn(props: Props) {
  const { displayProperties, issueDetail, disableUserActions, property, updateIssue } = props;
  // router
  const tableCellRef = useRef<HTMLTableCellElement | null>(null);

  const shouldRenderProperty = shouldRenderColumn(property);

  const Column = SPREADSHEET_COLUMNS[property];

  if (!Column) return null;

  const handleUpdateIssue = async (issue: TIssue, data: Partial<TIssue>) => {
    if (!updateIssue) return;
    try {
      await updateIssue(issue.project_id, issue.id, data);
    } catch (error) {
      // Governed workflows (docs/feature-specs/06-automation-workflow-sla.md,
      // section 4 in plane-selfhost) - a denied state transition throws
      // `{error_code: "TRANSITION_NOT_ALLOWED", reason}`; this call site had
      // no error handling at all before this feature, which meant any
      // failure here (not just this new one) was an unhandled promise
      // rejection with nothing shown to the user.
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: getIssueUpdateErrorMessage(error, "Unable to update the work item."),
      });
    }
  };

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={property}
      shouldRenderProperty={() => shouldRenderProperty}
    >
      <td
        tabIndex={0}
        className="h-11 min-w-36 border-r-[1px] border-subtle text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
        ref={tableCellRef}
      >
        <Column
          issue={issueDetail}
          onChange={handleUpdateIssue}
          disabled={disableUserActions}
          onClose={() => tableCellRef?.current?.focus()}
        />
      </td>
    </WithDisplayPropertiesHOC>
  );
});
