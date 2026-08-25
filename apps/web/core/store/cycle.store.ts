/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isPast, isToday } from "date-fns";
import { sortBy, set, isEmpty } from "lodash-es";
import { action, computed, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  ICycle,
  TCyclePlotType,
  TProgressSnapshot,
  TCycleEstimateDistribution,
  TCycleDistribution,
  TCycleEstimateType,
  TCycleProgressPreferences,
} from "@plane/types";
import type { DistributionUpdates } from "@plane/utils";
import { orderCycles, shouldFilterCycle, getDate, updateDistribution } from "@plane/utils";
// helpers
// services
import { CycleService } from "@/services/cycle.service";
import { CycleArchiveService } from "@/services/cycle_archive.service";
import { IssueService } from "@/services/issue";
import { ProjectService } from "@/services/project";
// store
import type { CoreRootStore } from "./root.store";

export interface ICycleStore {
  // loaders
  loader: boolean;
  progressLoader: boolean;
  // observables
  fetchedMap: Record<string, boolean>;
  cycleMap: Record<string, ICycle>;
  plotType: Record<string, TCyclePlotType>;
  estimatedType: Record<string, TCycleEstimateType>;
  activeCycleIdMap: Record<string, boolean>;
  progressPreferencesFetchedMap: Record<string, boolean>;

  // computed
  currentProjectCycleIds: string[] | null;
  currentProjectCompletedCycleIds: string[] | null;
  currentProjectIncompleteCycleIds: string[] | null;
  currentProjectActiveCycleId: string | null;
  currentProjectArchivedCycleIds: string[] | null;
  currentProjectActiveCycle: ICycle | null;

  // computed actions
  getFilteredCycleIds: (projectId: string, sortByManual: boolean) => string[] | null;
  getFilteredCompletedCycleIds: (projectId: string) => string[] | null;
  getFilteredArchivedCycleIds: (projectId: string) => string[] | null;
  getCycleById: (cycleId: string) => ICycle | null;
  getCycleNameById: (cycleId: string) => string | undefined;
  getProjectCycleDetails: (projectId: string) => ICycle[] | null;
  getProjectCycleIds: (projectId: string) => string[] | null;
  getPlotTypeByCycleId: (cycleId: string) => TCyclePlotType;
  getEstimateTypeByCycleId: (cycleId: string) => TCycleEstimateType;
  getIsPointsDataAvailable: (cycleId: string) => boolean;

  // actions
  updateCycleDistribution: (distributionUpdates: DistributionUpdates, cycleId: string) => void;
  setPlotType: (cycleId: string, plotType: TCyclePlotType) => void;
  setEstimateType: (cycleId: string, estimateType: TCycleEstimateType) => void;
  fetchCycleProgressPreferences: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
  updateCycleProgressPreferences: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: Partial<TCycleProgressPreferences>
  ) => Promise<void>;
  // fetch
  fetchWorkspaceCycles: (workspaceSlug: string) => Promise<ICycle[]>;
  // Category 12, feature 4 - additive bulk merge fed by the offline sync
  // engine's delta-pull loop, see `CycleStore.mergeFromSync`'s own
  // docstring. Never called from anywhere the existing `fetch*` methods
  // above are called from.
  mergeFromSync: (cycles: Partial<ICycle>[]) => void;
  fetchAllCycles: (workspaceSlug: string, projectId: string) => Promise<undefined | ICycle[]>;
  fetchActiveCycle: (workspaceSlug: string, projectId: string) => Promise<undefined | ICycle[]>;
  fetchArchivedCycles: (workspaceSlug: string, projectId: string) => Promise<undefined | ICycle[]>;
  fetchArchivedCycleDetails: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<ICycle>;
  fetchCycleDetails: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<ICycle>;
  fetchActiveCycleProgress: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<TProgressSnapshot>;
  fetchActiveCycleProgressPro: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
  fetchActiveCycleAnalytics: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    analytic_type: string
  ) => Promise<TCycleDistribution | TCycleEstimateDistribution>;
  // crud
  createCycle: (workspaceSlug: string, projectId: string, data: Partial<ICycle>) => Promise<ICycle>;
  updateCycleDetails: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: Partial<ICycle>
  ) => Promise<ICycle>;
  startStopCycle: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    action: "start" | "end"
  ) => Promise<ICycle>;
  deleteCycle: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
  // favorites
  addCycleToFavorites: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<any>;
  removeCycleFromFavorites: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
  // archive
  archiveCycle: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
  restoreCycle: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
}

export class CycleStore implements ICycleStore {
  // observables
  loader: boolean = false;
  progressLoader: boolean = false;
  cycleMap: Record<string, ICycle> = {};
  plotType: Record<string, TCyclePlotType> = {};
  estimatedType: Record<string, TCycleEstimateType> = {};
  activeCycleIdMap: Record<string, boolean> = {};
  progressPreferencesFetchedMap: Record<string, boolean> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore;
  // services
  projectService;
  issueService;
  cycleService;
  cycleArchiveService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      progressLoader: observable,
      cycleMap: observable,
      plotType: observable,
      estimatedType: observable,
      activeCycleIdMap: observable,
      progressPreferencesFetchedMap: observable,
      fetchedMap: observable,
      // computed
      currentProjectCycleIds: computed,
      currentProjectCompletedCycleIds: computed,
      currentProjectIncompleteCycleIds: computed,
      currentProjectActiveCycleId: computed,
      currentProjectArchivedCycleIds: computed,
      currentProjectActiveCycle: computed,

      // actions
      setEstimateType: action,
      fetchCycleProgressPreferences: action,
      updateCycleProgressPreferences: action,
      fetchWorkspaceCycles: action,
      mergeFromSync: action,
      fetchAllCycles: action,
      fetchActiveCycle: action,
      fetchArchivedCycles: action,
      fetchArchivedCycleDetails: action,
      fetchActiveCycleProgress: action,
      fetchActiveCycleAnalytics: action,
      fetchCycleDetails: action,
      updateCycleDetails: action,
      startStopCycle: action,
      deleteCycle: action,
      addCycleToFavorites: action,
      removeCycleFromFavorites: action,
      archiveCycle: action,
      restoreCycle: action,
    });

    this.rootStore = _rootStore;

    // services
    this.projectService = new ProjectService();
    this.issueService = new IssueService();
    this.cycleService = new CycleService();
    this.cycleArchiveService = new CycleArchiveService();
  }

  // computed
  /**
   * returns all cycle ids for a project
   */
  get currentProjectCycleIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    let allCycles = Object.values(this.cycleMap ?? {}).filter((c) => c?.project_id === projectId && !c?.archived_at);
    allCycles = sortBy(allCycles, [(c) => c.sort_order]);
    const allCycleIds = allCycles.map((c) => c.id);
    return allCycleIds;
  }

  /**
   * returns all completed cycle ids for a project
   */
  get currentProjectCompletedCycleIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    let completedCycles = Object.values(this.cycleMap ?? {}).filter((c) => {
      const endDate = getDate(c.end_date);
      const hasEndDatePassed = endDate && isPast(endDate);
      const isEndDateToday = endDate && isToday(endDate);
      return (
        c.project_id === projectId && ((hasEndDatePassed && !isEndDateToday) || c.status?.toLowerCase() === "completed")
      );
    });
    completedCycles = sortBy(completedCycles, [(c) => c.sort_order]);
    const completedCycleIds = completedCycles.map((c) => c.id);
    return completedCycleIds;
  }

  /**
   * returns all incomplete cycle ids for a project
   */
  get currentProjectIncompleteCycleIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    let incompleteCycles = Object.values(this.cycleMap ?? {}).filter((c) => {
      const endDate = getDate(c.end_date);
      const hasEndDatePassed = endDate && isPast(endDate);
      return (
        c.project_id === projectId && !hasEndDatePassed && !c?.archived_at && c.status?.toLowerCase() !== "completed"
      );
    });
    incompleteCycles = sortBy(incompleteCycles, [(c) => c.sort_order]);
    const incompleteCycleIds = incompleteCycles.map((c) => c.id);
    return incompleteCycleIds;
  }

  /**
   * returns active cycle id for a project
   */
  get currentProjectActiveCycleId() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return null;
    const activeCycle = Object.keys(this.cycleMap ?? {}).find(
      (cycleId) =>
        this.cycleMap?.[cycleId]?.project_id === projectId &&
        this.cycleMap?.[cycleId]?.status?.toLowerCase() === "current"
    );
    return activeCycle || null;
  }

  /**
   * returns all archived cycle ids for a project
   */
  get currentProjectArchivedCycleIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    let archivedCycles = Object.values(this.cycleMap ?? {}).filter(
      (c) => c.project_id === projectId && !!c.archived_at
    );
    archivedCycles = sortBy(archivedCycles, [(c) => c.sort_order]);
    const archivedCycleIds = archivedCycles.map((c) => c.id);
    return archivedCycleIds;
  }

  get currentProjectActiveCycle() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId && !this.currentProjectActiveCycleId) return null;
    return this.cycleMap?.[this.currentProjectActiveCycleId!] ?? null;
  }

  getIsPointsDataAvailable = computedFn((cycleId: string) => {
    const cycle = this.getCycleById(cycleId);
    if (!cycle) return false;
    if (cycle.version === 2) return cycle.progress?.some((p) => p.total_estimate_points > 0);
    else if (cycle.version === 1) {
      const completionChart = cycle.estimate_distribution?.completion_chart || {};
      return !isEmpty(completionChart) && Object.keys(completionChart).some((p) => completionChart[p]! > 0);
    } else return false;
  });

  /**
   * @description returns filtered cycle ids based on display filters and filters
   * @param {TCycleDisplayFilters} displayFilters
   * @param {TCycleFilters} filters
   * @returns {string[] | null}
   */
  getFilteredCycleIds = computedFn((projectId: string, sortByManual: boolean) => {
    const filters = this.rootStore.cycleFilter.getFiltersByProjectId(projectId);
    const searchQuery = this.rootStore.cycleFilter.searchQuery;
    if (!this.fetchedMap[projectId]) return null;
    let cycles = Object.values(this.cycleMap ?? {}).filter(
      (c) =>
        c.project_id === projectId &&
        !c.archived_at &&
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        shouldFilterCycle(c, filters ?? {})
    );
    cycles = orderCycles(cycles, sortByManual);
    const cycleIds = cycles.map((c) => c.id);
    return cycleIds;
  });

  /**
   * @description returns filtered cycle ids based on display filters and filters
   * @param {TCycleDisplayFilters} displayFilters
   * @param {TCycleFilters} filters
   * @returns {string[] | null}
   */
  getFilteredCompletedCycleIds = computedFn((projectId: string) => {
    const filters = this.rootStore.cycleFilter.getFiltersByProjectId(projectId);
    const searchQuery = this.rootStore.cycleFilter.searchQuery;
    if (!this.fetchedMap[projectId]) return null;
    let cycles = Object.values(this.cycleMap ?? {}).filter(
      (c) =>
        c.project_id === projectId &&
        !c.archived_at &&
        c.status?.toLowerCase() === "completed" &&
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        shouldFilterCycle(c, filters ?? {})
    );
    cycles = sortBy(cycles, [(c) => !c.start_date]);
    const cycleIds = cycles.map((c) => c.id);
    return cycleIds;
  });

  /**
   * @description returns filtered archived cycle ids based on display filters and filters
   * @param {string} projectId
   * @returns {string[] | null}
   */
  getFilteredArchivedCycleIds = computedFn((projectId: string) => {
    const filters = this.rootStore.cycleFilter.getArchivedFiltersByProjectId(projectId);
    const searchQuery = this.rootStore.cycleFilter.archivedCyclesSearchQuery;
    if (!this.fetchedMap[projectId]) return null;
    let cycles = Object.values(this.cycleMap ?? {}).filter(
      (c) =>
        c.project_id === projectId &&
        !!c.archived_at &&
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        shouldFilterCycle(c, filters ?? {})
    );
    cycles = sortBy(cycles, [(c) => !c.start_date]);
    const cycleIds = cycles.map((c) => c.id);
    return cycleIds;
  });

  /**
   * @description returns cycle details by cycle id
   * @param cycleId
   * @returns
   */
  getCycleById = computedFn((cycleId: string): ICycle | null => this.cycleMap?.[cycleId] ?? null);

  /**
   * @description returns cycle name by cycle id
   * @param cycleId
   * @returns
   */
  getCycleNameById = computedFn((cycleId: string): string => this.cycleMap?.[cycleId]?.name);

  /**
   * @description returns list of cycle details of the project id passed as argument
   * @param projectId
   */
  getProjectCycleDetails = computedFn((projectId: string): ICycle[] | null => {
    if (!this.fetchedMap[projectId]) return null;

    let cycles = Object.values(this.cycleMap ?? {}).filter((c) => c.project_id === projectId && !c?.archived_at);
    cycles = sortBy(cycles, [(c) => c.sort_order]);
    return cycles || null;
  });

  /**
   * @description returns list of cycle ids of the project id passed as argument
   * @param projectId
   */
  getProjectCycleIds = computedFn((projectId: string): string[] | null => {
    const cycles = this.getProjectCycleDetails(projectId);
    if (!cycles) return null;
    const cycleIds = cycles.map((c) => c.id);
    return cycleIds || null;
  });

  /**
   * @description gets the plot type for the cycle store
   * @param {TCyclePlotType} plotType
   */
  getPlotTypeByCycleId = computedFn((cycleId: string) => this.plotType[cycleId] || "burndown");

  /**
   * @description gets the estimate type for the cycle store
   * @param {TCycleEstimateType} estimateType
   */
  getEstimateTypeByCycleId = computedFn((cycleId: string) => {
    const { projectId } = this.rootStore.router;

    return projectId && this.rootStore.projectEstimate.areEstimateEnabledByProjectId(projectId)
      ? this.estimatedType[cycleId] || "issues"
      : "issues";
  });

  /**
   * @description updates the plot type for the cycle store
   * @param {TCyclePlotType} plotType
   */
  setPlotType = (cycleId: string, plotType: TCyclePlotType) => {
    set(this.plotType, [cycleId], plotType);
  };

  /**
   * @description updates the estimate type for the cycle store
   * @param {TCycleEstimateType} estimateType
   */
  setEstimateType = (cycleId: string, estimateType: TCycleEstimateType) => {
    set(this.estimatedType, [cycleId], estimateType);
  };

  /**
   * @description fetches and applies the current user's persisted
   * burndown/burn-up + issues/points chart preferences for a cycle, once
   * per cycle - see docs/feature-specs/05-insights-analytics.md, exigence 3.
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   */
  fetchCycleProgressPreferences = async (workspaceSlug: string, projectId: string, cycleId: string) => {
    if (this.progressPreferencesFetchedMap[cycleId]) return;
    try {
      const preferences = await this.cycleService.getCycleProgressPreferences(workspaceSlug, projectId, cycleId);
      runInAction(() => {
        if (preferences?.chart_type) set(this.plotType, [cycleId], preferences.chart_type);
        if (preferences?.estimate_type) set(this.estimatedType, [cycleId], preferences.estimate_type);
        set(this.progressPreferencesFetchedMap, [cycleId], true);
      });
    } catch (error) {
      console.error("Failed to fetch cycle progress preferences", error);
    }
  };

  /**
   * @description updates the local plot/estimate type (optimistic) and
   * persists the chosen burndown/burn-up + issues/points chart preference
   * for the current user on this cycle.
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @param data
   */
  updateCycleProgressPreferences = async (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: Partial<TCycleProgressPreferences>
  ) => {
    if (data.chart_type) this.setPlotType(cycleId, data.chart_type);
    if (data.estimate_type) this.setEstimateType(cycleId, data.estimate_type);
    try {
      await this.cycleService.patchCycleProgressPreferences(workspaceSlug, projectId, cycleId, data);
    } catch (error) {
      console.error("Failed to persist cycle progress preferences", error);
    }
  };

  /**
   * @description fetch all cycles
   * @param workspaceSlug
   * @returns ICycle[]
   */
  fetchWorkspaceCycles = async (workspaceSlug: string) =>
    await this.cycleService.getWorkspaceCycles(workspaceSlug).then((response) => {
      runInAction(() => {
        response.forEach((cycle) => {
          set(this.cycleMap, [cycle.id], { ...this.cycleMap[cycle.id], ...cycle });
          set(this.fetchedMap, cycle.project_id, true);
        });
      });
      return response;
    });

  /**
   * Category 12, feature 4 (docs/feature-specs/12-keyboard-mobile-
   * desktop.md in plane-selfhost) - merges the offline sync engine's
   * periodic workspace delta-pull results (`cycle` is read-only
   * reference data in that feature's scope, always the full currently-
   * visible snapshot, never a partial delta - see the backend's own
   * `build_delta_response` docstring) into `cycleMap`, keeping this
   * store's in-memory state fresh WITHOUT requiring any view to actually
   * be open and call `fetchWorkspaceCycles`/`fetchAllCycles` itself.
   * Same per-item merge shape those already use, just fed by a different
   * caller - `apps/web/core/store/sync-engine.store.ts`'s
   * `handleWorkerMessage`, on a `"delta-applied"` message, exclusively.
   */
  mergeFromSync = (cycles: Partial<ICycle>[]) => {
    runInAction(() => {
      cycles.forEach((cycle) => {
        if (!cycle.id) return;
        set(this.cycleMap, [cycle.id], { ...this.cycleMap[cycle.id], ...cycle });
      });
    });
  };

  /**
   * @description fetches all cycles for a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchAllCycles = async (workspaceSlug: string, projectId: string) => {
    try {
      this.loader = true;
      await this.cycleService.getCyclesWithParams(workspaceSlug, projectId).then((response) => {
        runInAction(() => {
          response.forEach((cycle) => {
            set(this.cycleMap, [cycle.id], cycle);
            if (cycle.status?.toLowerCase() === "current") {
              set(this.activeCycleIdMap, [cycle.id], true);
            }
          });
          set(this.fetchedMap, projectId, true);
          this.loader = false;
        });
        return response;
      });
    } catch {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * @description fetches archived cycles for a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchArchivedCycles = async (workspaceSlug: string, projectId: string) => {
    this.loader = true;
    return await this.cycleArchiveService
      .getArchivedCycles(workspaceSlug, projectId)
      .then((response) => {
        runInAction(() => {
          response.forEach((cycle) => {
            set(this.cycleMap, [cycle.id], cycle);
          });
          this.loader = false;
        });
        return response;
      })
      .catch(() => {
        this.loader = false;
        return undefined;
      });
  };

  /**
   * @description fetches active cycle for a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchActiveCycle = async (workspaceSlug: string, projectId: string) =>
    await this.cycleService.getCyclesWithParams(workspaceSlug, projectId, "current").then((response) => {
      runInAction(() => {
        response.forEach((cycle) => {
          set(this.activeCycleIdMap, [cycle.id], true);
          set(this.cycleMap, [cycle.id], cycle);
        });
      });
      return response;
    });

  /**
   * @description fetches active cycle progress
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   *  @returns
   */
  fetchActiveCycleProgress = async (workspaceSlug: string, projectId: string, cycleId: string) => {
    this.progressLoader = true;
    return await this.cycleService.workspaceActiveCyclesProgress(workspaceSlug, projectId, cycleId).then((progress) => {
      runInAction(() => {
        set(this.cycleMap, [cycleId], { ...this.cycleMap[cycleId], ...progress });
        this.progressLoader = false;
      });
      return progress;
    });
  };

  /**
   * @description fetches active cycle progress for pro users
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   *  @returns
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fetchActiveCycleProgressPro = action(async (workspaceSlug: string, projectId: string, cycleId: string) => {});

  /**
   * @description fetches active cycle analytics
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   *  @returns
   */
  fetchActiveCycleAnalytics = async (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    analytic_type: string
  ) =>
    await this.cycleService
      .workspaceActiveCyclesAnalytics(workspaceSlug, projectId, cycleId, analytic_type)
      .then((cycle) => {
        runInAction(() => {
          set(this.cycleMap, [cycleId, analytic_type === "points" ? "estimate_distribution" : "distribution"], cycle);
        });
        return cycle;
      });

  /**
   * @description fetches cycle details
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @returns
   */
  fetchArchivedCycleDetails = async (workspaceSlug: string, projectId: string, cycleId: string) =>
    await this.cycleArchiveService.getArchivedCycleDetails(workspaceSlug, projectId, cycleId).then((response) => {
      runInAction(() => {
        set(this.cycleMap, [response.id], { ...this.cycleMap?.[response.id], ...response });
      });
      return response;
    });

  /**
   * @description fetches cycle details
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @returns
   */
  fetchCycleDetails = async (workspaceSlug: string, projectId: string, cycleId: string) =>
    await this.cycleService.getCycleDetails(workspaceSlug, projectId, cycleId).then((response) => {
      runInAction(() => {
        set(this.cycleMap, [response.id], { ...this.cycleMap?.[response.id], ...response });
      });
      return response;
    });

  /**
   * This method updates the cycle's stats locally without fetching the updated stats from backend
   * @param distributionUpdates
   * @param cycleId
   * @returns
   */
  updateCycleDistribution = (distributionUpdates: DistributionUpdates, cycleId: string) => {
    const cycle = this.getCycleById(cycleId);
    if (!cycle) return;

    runInAction(() => {
      updateDistribution(cycle, distributionUpdates);
    });
  };

  /**
   * @description creates a new cycle
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns
   */
  createCycle = action(
    async (workspaceSlug: string, projectId: string, data: Partial<ICycle>) =>
      await this.cycleService.createCycle(workspaceSlug, projectId, data).then((response) => {
        runInAction(() => {
          set(this.cycleMap, [response.id], response);
        });
        return response;
      })
  );

  /**
   * @description updates cycle details
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @param data
   * @returns
   */
  updateCycleDetails = async (workspaceSlug: string, projectId: string, cycleId: string, data: Partial<ICycle>) => {
    try {
      runInAction(() => {
        set(this.cycleMap, [cycleId], { ...this.cycleMap?.[cycleId], ...data });
      });
      const response = await this.cycleService.patchCycle(workspaceSlug, projectId, cycleId, data);
      this.fetchCycleDetails(workspaceSlug, projectId, cycleId);
      return response;
    } catch (error) {
      console.log("Failed to patch cycle from cycle store");
      this.fetchAllCycles(workspaceSlug, projectId);
      this.fetchActiveCycle(workspaceSlug, projectId);
      throw error;
    }
  };

  /**
   * @description manually starts or ends a cycle
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @param action
   */
  startStopCycle = async (workspaceSlug: string, projectId: string, cycleId: string, cycleAction: "start" | "end") => {
    try {
      const response = await this.cycleService.startStopCycle(workspaceSlug, projectId, cycleId, cycleAction);
      runInAction(() => {
        set(this.cycleMap, [cycleId], { ...this.cycleMap?.[cycleId], ...response });
      });
      this.fetchCycleDetails(workspaceSlug, projectId, cycleId);
      return response;
    } catch (error) {
      console.log("Failed to start/stop cycle from cycle store");
      this.fetchCycleDetails(workspaceSlug, projectId, cycleId);
      throw error;
    }
  };

  /**
   * @description deletes a cycle
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   */
  deleteCycle = async (workspaceSlug: string, projectId: string, cycleId: string) =>
    await this.cycleService.deleteCycle(workspaceSlug, projectId, cycleId).then(() => {
      runInAction(() => {
        delete this.cycleMap[cycleId];
        delete this.activeCycleIdMap[cycleId];
        if (this.rootStore.favorite.entityMap[cycleId]) this.rootStore.favorite.removeFavoriteFromStore(cycleId);
      });
      return;
    });

  /**
   * @description adds a cycle to favorites
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @returns
   */
  addCycleToFavorites = async (workspaceSlug: string, projectId: string, cycleId: string) => {
    const currentCycle = this.getCycleById(cycleId);
    try {
      runInAction(() => {
        if (currentCycle) set(this.cycleMap, [cycleId, "is_favorite"], true);
      });
      // updating through api.
      const response = await this.rootStore.favorite.addFavorite(workspaceSlug.toString(), {
        entity_type: "cycle",
        entity_identifier: cycleId,
        project_id: projectId,
        entity_data: { name: currentCycle?.name || "" },
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (currentCycle) set(this.cycleMap, [cycleId, "is_favorite"], false);
      });
      throw error;
    }
  };

  /**
   * @description removes a cycle from favorites
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @returns
   */
  removeCycleFromFavorites = async (workspaceSlug: string, projectId: string, cycleId: string) => {
    const currentCycle = this.getCycleById(cycleId);
    try {
      runInAction(() => {
        if (currentCycle) set(this.cycleMap, [cycleId, "is_favorite"], false);
      });
      const response = await this.rootStore.favorite.removeFavoriteEntity(workspaceSlug, cycleId);
      return response;
    } catch (error) {
      runInAction(() => {
        if (currentCycle) set(this.cycleMap, [cycleId, "is_favorite"], true);
      });
      throw error;
    }
  };

  /**
   * @description archives a cycle
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @returns
   */
  archiveCycle = async (workspaceSlug: string, projectId: string, cycleId: string) => {
    const cycleDetails = this.getCycleById(cycleId);
    if (cycleDetails?.archived_at) return;
    await this.cycleArchiveService
      .archiveCycle(workspaceSlug, projectId, cycleId)
      .then((response) => {
        runInAction(() => {
          set(this.cycleMap, [cycleId, "archived_at"], response.archived_at);
          if (this.rootStore.favorite.entityMap[cycleId]) this.rootStore.favorite.removeFavoriteFromStore(cycleId);
        });
        return;
      })
      .catch((error) => {
        console.error("Failed to archive cycle in cycle store", error);
      });
  };

  /**
   * @description restores a cycle
   * @param workspaceSlug
   * @param projectId
   * @param cycleId
   * @returns
   */
  restoreCycle = async (workspaceSlug: string, projectId: string, cycleId: string) => {
    const cycleDetails = this.getCycleById(cycleId);
    if (!cycleDetails?.archived_at) return;
    await this.cycleArchiveService
      .restoreCycle(workspaceSlug, projectId, cycleId)
      .then(() => {
        runInAction(() => {
          set(this.cycleMap, [cycleId, "archived_at"], null);
        });
        return;
      })
      .catch((error) => {
        console.error("Failed to restore cycle in cycle store", error);
      });
  };
}
