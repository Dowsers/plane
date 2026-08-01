/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLocalStorage } from "@plane/hooks";

const STORAGE_KEY = "gantt_show_dependency_lines";

// Client-only toggle, no backend persistence - see
// docs/feature-specs/03-projects-roadmaps-initiatives.md ("Lignes de
// dependance Gantt") in plane-selfhost. Shared by the header button and the
// overlay via the same localStorage key so both stay in sync without prop
// drilling between sibling components.
export const useGanttDependencyLinesToggle = () => {
  const { storedValue, setValue } = useLocalStorage<boolean>(STORAGE_KEY, true);
  const isEnabled = storedValue ?? true;

  return {
    isEnabled,
    toggle: () => setValue(!isEnabled),
  };
};
