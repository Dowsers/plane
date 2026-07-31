/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { usePopper } from "react-popper";
import { Flag } from "lucide-react";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@plane/propel/icons";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useMilestone } from "@/hooks/store/use-milestone";
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { DropdownButton } from "./buttons";
import { BUTTON_VARIANTS_WITH_TEXT } from "./constants";
import type { TDropdownProps } from "./types";

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  projectId: string | undefined;
  value: string | null;
  renderByDefault?: boolean;
};

export const MilestoneDropdown = observer(function MilestoneDropdown(props: Props) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    hideIcon = false,
    onChange,
    onClose,
    placeholder = "",
    placement,
    projectId,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
  } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { getProjectMilestoneIds, getMilestoneById, fetchMilestones } = useMilestone();
  const { isMobile } = usePlatformOS();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });

  const selectedName = value ? getMilestoneById(value)?.name : null;

  const { handleClose, handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    isOpen,
    onClose,
    setIsOpen,
  });

  useEffect(() => {
    if (isOpen && projectId && workspaceSlug && !getProjectMilestoneIds(projectId)) {
      fetchMilestones(workspaceSlug.toString(), projectId);
    }
    if (isOpen && !isMobile) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, workspaceSlug]);

  const dropdownOnChange = (val: string | null) => {
    onChange(val);
    handleClose();
  };

  const milestoneIds = (projectId ? getProjectMilestoneIds(projectId) : null) ?? [];
  const options = milestoneIds
    .map((milestoneId) => {
      const milestone = getMilestoneById(milestoneId);
      return {
        value: milestoneId,
        query: milestone?.name ?? "",
        content: (
          <div className="flex items-center gap-2">
            <Flag className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-grow truncate">{milestone?.name}</span>
          </div>
        ),
      };
    })
    .filter((option) => (query === "" ? true : option.query.toLowerCase().includes(query.toLowerCase())));

  const comboButton = (
    <>
      {button ? (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn("clickable block h-full w-full outline-none hover:bg-layer-1", buttonContainerClassName)}
          onClick={handleOnClick}
          disabled={disabled}
          tabIndex={tabIndex}
        >
          {button}
        </button>
      ) : (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn(
            "clickable block h-full max-w-full outline-none hover:bg-layer-1",
            { "cursor-not-allowed text-secondary": disabled, "cursor-pointer": !disabled },
            buttonContainerClassName
          )}
          onClick={handleOnClick}
          disabled={disabled}
          tabIndex={tabIndex}
        >
          <DropdownButton
            className={buttonClassName}
            isActive={isOpen}
            tooltipHeading={t("milestones.label")}
            tooltipContent={selectedName ?? placeholder}
            showTooltip={showTooltip}
            variant={buttonVariant}
          >
            {!hideIcon && <Flag className="h-3 w-3 flex-shrink-0" />}
            {BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (!!selectedName || !!placeholder) && (
              <span className="max-w-40 truncate">{selectedName ?? placeholder}</span>
            )}
            {dropdownArrow && (
              <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
            )}
          </DropdownButton>
        </button>
      )}
    </>
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- same pattern as CycleDropdown/PriorityDropdown; Combobox's own Input/Options provide the actual interactive semantics
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      className={cn("h-full", className)}
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && (
        <Combobox.Options className="fixed z-10" static>
          <div
            className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search.label")}
                onKeyDown={(e) => {
                  if (query !== "" && e.key === "Escape") {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              <Combobox.Option
                value={null}
                className={({ active, selected }) =>
                  cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                    active ? "bg-layer-transparent-hover" : "",
                    selected ? "text-primary" : "text-secondary"
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <span className="flex-grow truncate">{t("milestones.no_milestone")}</span>
                    {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                  </>
                )}
              </Combobox.Option>
              {options.length > 0 ? (
                options.map((option) => (
                  <Combobox.Option
                    key={option.value}
                    value={option.value}
                    className={({ active, selected }) =>
                      cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                        active ? "bg-layer-transparent-hover" : "",
                        selected ? "text-primary" : "text-secondary"
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="flex-grow truncate">{option.content}</span>
                        {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matches_found")}</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
});
