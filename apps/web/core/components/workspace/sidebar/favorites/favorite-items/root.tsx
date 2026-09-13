/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type {
  DropTargetRecord,
  DragLocationHistory,
} from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import type { ElementDragPayload } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { Transition } from "@headlessui/react";
import { observer } from "mobx-react";
import { createRoot } from "react-dom/client";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { IconButton } from "@plane/propel/icon-button";
import { ChevronRightIcon } from "@plane/propel/icons";
import type { IFavorite, InstructionType } from "@plane/types";
import { ControlLink, DropIndicator } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useFavoriteItemDetails } from "@/hooks/use-favorite-item-details";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane web imports
import { ProjectNavigationRoot } from "@/plane-web/components/sidebar";
// local imports
import { getCanDrop, getInstructionFromPayload } from "../favorites.helpers";
import { FavoriteItemDragHandle, FavoriteItemQuickAction, FavoriteItemTitle, FavoriteItemWrapper } from "./common";

type Props = {
  isLastChild: boolean;
  parentId: string | undefined;
  workspaceSlug: string;
  favorite: IFavorite;
  handleRemoveFromFavorites: (favorite: IFavorite) => void;
  handleDrop: (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => void;
};

export const FavoriteRoot = observer(function FavoriteRoot(props: Props) {
  // props
  const { isLastChild, parentId, workspaceSlug, favorite, handleRemoveFromFavorites, handleDrop } = props;
  // store hooks
  const { itemLink, itemIcon, itemTitle } = useFavoriteItemDetails(workspaceSlug, favorite);
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { getIsProjectListOpen, toggleProjectListOpen } = useCommandPalette();
  //state
  const [isDragging, setIsDragging] = useState(false);
  const [isMenuActive, setIsMenuActive] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);

  // A favorited project is the only favorite entity type that itself has
  // sub-navigation (Work items/Cycles/Modules/Milestones/Updates/Views/
  // Pages/Intake). In "TABBED" mode that sub-nav lives in the horizontal
  // tab bar shown once you land on the project (see
  // apps/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/layout.tsx),
  // so a plain link straight to the project is enough. In "ACCORDION" mode
  // (the default) that tab bar never renders at all - the only place the
  // sub-nav exists is the inline expand-in-sidebar tree that
  // projects-list-item.tsx renders for the regular Projects list. Without
  // this, a favorited project reached only via Favorites had no way to
  // reach any of its sub-pages: no tab bar (ACCORDION mode disables it)
  // and no expand affordance (this component was a flat link). Mirrors
  // projects-list-item.tsx's isAccordionMode/ProjectNavigationRoot pattern,
  // reusing the same projectListOpenMap (keyed by project id only, not by
  // which sidebar section triggered it) so expand state stays consistent
  // between the Projects list and Favorites.
  const isProjectFavorite = favorite.entity_type === "project";
  const isAccordionMode = projectPreferences.navigationMode === "ACCORDION";
  const isExpandable = isProjectFavorite && isAccordionMode;
  const isProjectListOpen = isExpandable ? getIsProjectListOpen(favorite.entity_identifier ?? "") : false;

  const handleTitleClick = () => {
    if (isExpandable) toggleProjectListOpen(favorite.entity_identifier ?? "", !isProjectListOpen);
  };

  //ref
  const elementRef = useRef<HTMLDivElement>(null);
  const actionSectionRef = useRef<HTMLDivElement | null>(null);

  const handleQuickAction = (value: boolean) => setIsMenuActive(value);

  // drag and drop
  useEffect(() => {
    const element = elementRef.current;

    if (!element) return;
    const initialData = { id: favorite.id, isGroup: false, isChild: !!parentId, parentId };
    return combine(
      draggable({
        element,
        dragHandle: elementRef.current,
        getInitialData: () => initialData,
        onDragStart: () => {
          setIsDragging(true);
        },
        onDrop: () => {
          setIsDragging(false);
        },
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "0px", y: "0px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              root.render(
                <div className="rounded-sm bg-surface-1 p-1 pr-2 text-13">
                  <FavoriteItemTitle href={itemLink} icon={itemIcon} title={itemTitle} />
                </div>
              );
              return () => root.unmount();
            },
            nativeSetDragImage,
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => getCanDrop(source, favorite, !!parentId),
        onDragStart: () => {
          setIsDragging(true);
        },
        getData: ({ input, element: dropElement }) => {
          const blockedStates: InstructionType[] = ["make-child"];
          if (!isLastChild) {
            blockedStates.push("reorder-below");
          }

          return attachInstruction(initialData, {
            input,
            element: dropElement,
            currentLevel: 1,
            indentPerLevel: 0,
            mode: isLastChild ? "last-in-group" : "standard",
            block: blockedStates,
          });
        },
        onDrag: ({ self, source, location }) => {
          const dragInstruction = getInstructionFromPayload(self, source, location);
          setInstruction(dragInstruction);
        },
        onDragLeave: () => {
          setInstruction(undefined);
        },
        onDrop: ({ self, source, location }) => {
          setInstruction(undefined);
          handleDrop(self, source, location);
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementRef?.current, isDragging, isLastChild, favorite.id]);

  useOutsideClickDetector(actionSectionRef, () => setIsMenuActive(false));

  return (
    <>
      {isDragging && <DropIndicator isVisible={instruction === "reorder-above"} />}
      <FavoriteItemWrapper elementRef={elementRef} isMenuActive={isMenuActive}>
        <FavoriteItemDragHandle isDragging={isDragging} sort_order={favorite.sort_order} />
        {isExpandable ? (
          <ControlLink href={itemLink} className="flex w-full items-center gap-1.5 truncate" onClick={handleTitleClick}>
            <span className="flex size-5 items-center justify-center">{itemIcon}</span>
            <span className="flex-1 truncate text-13 leading-5 font-medium">{itemTitle}</span>
          </ControlLink>
        ) : (
          <FavoriteItemTitle href={itemLink} icon={itemIcon} title={itemTitle} />
        )}
        {isExpandable && (
          <IconButton
            variant="ghost"
            size="sm"
            icon={ChevronRightIcon}
            onClick={() => toggleProjectListOpen(favorite.entity_identifier ?? "", !isProjectListOpen)}
            className={cn("hidden text-placeholder group-hover/project-item:inline-flex", {
              "inline-flex": isMenuActive,
            })}
            iconClassName={cn("transition-transform", { "rotate-90": isProjectListOpen })}
          />
        )}
        <FavoriteItemQuickAction
          favorite={favorite}
          ref={actionSectionRef}
          isMenuActive={isMenuActive}
          onChange={handleQuickAction}
          handleRemoveFromFavorites={handleRemoveFromFavorites}
        />
      </FavoriteItemWrapper>
      {isExpandable && (
        <Transition
          show={isProjectListOpen}
          enter="transition duration-100 ease-out"
          enterFrom="transform scale-95 opacity-0"
          enterTo="transform scale-100 opacity-100"
          leave="transition duration-75 ease-out"
          leaveFrom="transform scale-100 opacity-100"
          leaveTo="transform scale-95 opacity-0"
        >
          {isProjectListOpen && (
            <div className="relative mt-1 mb-1.5 flex flex-col gap-0.5 pl-6">
              <div className="absolute top-0 bottom-1 left-[15px] w-[1px] bg-layer-3" />
              <ProjectNavigationRoot workspaceSlug={workspaceSlug} projectId={favorite.entity_identifier ?? ""} />
            </div>
          )}
        </Transition>
      )}
      {isLastChild && <DropIndicator isVisible={instruction === "reorder-below"} />}
    </>
  );
});
