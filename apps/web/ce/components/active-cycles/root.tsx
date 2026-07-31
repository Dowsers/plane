/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button, ContentWrapper, Loader } from "@plane/ui";
// services
import { CycleService } from "@/services/cycle.service";
// local imports
import { WorkspaceActiveCycleListItem } from "./workspace-active-cycle-list-item";

const cycleService = new CycleService();
const PER_PAGE = 12;
const INITIAL_CURSOR = `${PER_PAGE}:0:0`;

export const WorkspaceActiveCyclesRoot = observer(function WorkspaceActiveCyclesRoot() {
  const { workspaceSlug } = useParams();
  const [cursor, setCursor] = useState(INITIAL_CURSOR);
  const { t } = useTranslation();

  const { data, isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_ACTIVE_CYCLES", workspaceSlug, cursor] : null,
    workspaceSlug ? () => cycleService.workspaceActiveCycles(workspaceSlug.toString(), cursor, PER_PAGE) : null,
    { revalidateOnFocus: false }
  );

  if (isLoading && !data) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="60px" />
          <Loader.Item height="60px" />
          <Loader.Item height="60px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (!data || data.results.length === 0) {
    return (
      <ContentWrapper className="items-center justify-center">
        <p className="text-14 text-secondary">No active cycles across your projects right now.</p>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <div className="flex flex-col">
        {data.results.map((cycle) => (
          <WorkspaceActiveCycleListItem key={cycle.id} workspaceSlug={workspaceSlug?.toString() ?? ""} cycle={cycle} />
        ))}
      </div>
      {(data.prev_page_results || data.next_page_results) && (
        <div className="flex items-center justify-end gap-2 pt-4">
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data.prev_page_results}
            onClick={() => data.prev_page_results && setCursor(data.prev_cursor)}
          >
            {t("prev")}
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data.next_page_results}
            onClick={() => data.next_page_results && setCursor(data.next_cursor)}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </ContentWrapper>
  );
});
