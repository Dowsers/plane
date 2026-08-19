/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
// plane imports
import type { TDigestItem } from "@plane/types";
import { Avatar } from "@plane/ui";
// local imports
import { describeDigestItem, getDigestItemLink } from "../item-type-meta";

type Props = {
  workspaceSlug: string;
  item: TDigestItem;
};

export function DigestItemRow(props: Props) {
  const { workspaceSlug, item } = props;
  const description = describeDigestItem(item);
  const link = getDigestItemLink(workspaceSlug, item);

  const content = (
    <span className="min-w-0 flex-1 truncate text-13 text-secondary group-hover:text-primary group-hover:underline">
      {description}
    </span>
  );

  return (
    <div className="group flex items-center gap-2 py-1">
      {link ? (
        <Link href={link} className="flex min-w-0 flex-1 items-center gap-2">
          {content}
        </Link>
      ) : (
        content
      )}
      {item.actor_detail && (
        <Avatar size="sm" name={item.actor_detail.display_name} src={item.actor_detail.avatar_url} />
      )}
    </div>
  );
}
