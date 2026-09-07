/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { cn } from "@plane/utils";
// local imports
import type { TPopoverMenuOptions } from "./root";

export const NotificationMenuOptionItem = observer(function NotificationMenuOptionItem(props: TPopoverMenuOptions) {
  const { type, label = "", isActive, prependIcon, appendIcon, onClick } = props;

  if (type === "menu-item")
    return (
      <button
        type="button"
        className="mx-2 flex w-[calc(100%-1rem)] cursor-pointer items-center gap-2 rounded-xs p-1 px-2 text-left transition-all hover:bg-layer-1"
        onClick={() => onClick && onClick()}
      >
        {prependIcon}
        <div
          className={cn("text-body-xs-medium whitespace-nowrap", {
            "text-primary": isActive,
            "text-secondary": !isActive,
          })}
        >
          {label}
        </div>
        {appendIcon && <div className="ml-auto">{appendIcon}</div>}
      </button>
    );

  return <div className="border-b border-subtle" />;
});
