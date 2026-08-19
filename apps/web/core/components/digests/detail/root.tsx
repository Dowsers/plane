/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ContentWrapper, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// services
import { DigestService } from "@/services/digest.service";
// local imports
import { DIGEST_ITEM_TYPE_ICON, DIGEST_ITEM_TYPE_ORDER } from "../item-type-meta";
import { DigestItemRow } from "./item-row";

const digestService = new DigestService();

type Props = {
  workspaceSlug: string;
  digestId: string;
};

/**
 * Detail pane for one `DigestRun` - grouped by project then item type via
 * `items_by_project` (the backend's own pre-grouped shape,
 * `DigestRunDetailSerializer.get_items_by_project`,
 * apps/api/plane/app/serializers/digest.py), matching the spec's own
 * "Considerations API/UX" wording ("detail d'un digest avec ses items
 * groupes par projet/cycle").
 */
export const DigestDetailRoot = observer(function DigestDetailRoot(props: Props) {
  const { workspaceSlug, digestId } = props;
  const { t } = useTranslation();

  const { data: digest, isLoading } = useSWR(`DIGEST_DETAIL_${workspaceSlug}_${digestId}`, () =>
    digestService.getDigest(workspaceSlug, digestId)
  );

  if (isLoading || !digest) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <div className="flex flex-col gap-1 border-b border-subtle pb-4">
        <div className="flex items-center gap-2 text-13 text-tertiary">
          <span>{t(`digest.frequency.${digest.frequency}`)}</span>
          <span>&middot;</span>
          <span>
            {renderFormattedDate(digest.period_start)} - {renderFormattedDate(digest.period_end)}
          </span>
          <span>&middot;</span>
          <span>{t(`digest.status.${digest.status}`)}</span>
          <span>&middot;</span>
          <span>{t(`digest.generation_method.${digest.generation_method}`)}</span>
        </div>
      </div>

      {digest.summary_text && (
        <div className="border-b border-subtle py-4">
          <h5 className="pb-2 text-13 font-medium text-primary">{t("digest.detail.summary_title")}</h5>
          <p className="text-13 whitespace-pre-line text-secondary">{digest.summary_text}</p>
        </div>
      )}

      {digest.items_by_project.length === 0 ? (
        <p className="py-10 text-center text-13 text-tertiary">{t("digest.detail.no_items")}</p>
      ) : (
        <div className="flex flex-col gap-6 py-4">
          {digest.items_by_project.map((group) => (
            <div key={group.project_id} className="flex flex-col gap-3">
              <h4 className="text-14 font-medium text-primary">{group.project_name || group.project_id}</h4>
              <div className="flex flex-col gap-4">
                {DIGEST_ITEM_TYPE_ORDER.map((itemType) => {
                  const typeItems = group.items_by_type[itemType];
                  if (!typeItems || typeItems.length === 0) return null;
                  const Icon = DIGEST_ITEM_TYPE_ICON[itemType];
                  return (
                    <div key={itemType} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-12 font-medium text-tertiary">
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span>
                          {t(`digest.detail.item_types.${itemType}`)} ({typeItems.length})
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 border-l-2 border-subtle pl-3">
                        {typeItems.map((item) => (
                          <DigestItemRow key={item.id} workspaceSlug={workspaceSlug} item={item} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentWrapper>
  );
});
