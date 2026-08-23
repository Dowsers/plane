/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AxiosInstance, AxiosRequestConfig } from "axios";
import axios from "axios";

export abstract class APIService {
  protected baseURL: string;
  private axiosInstance: AxiosInstance;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.axiosInstance = axios.create({
      baseURL,
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        // Category 11 (docs/feature-specs/11-admin-security-sso.md in
        // plane-selfhost), feature 6 ("Politiques de securite
        // configurables"), exigence 8 - `POST .../reauth/`'s own guard
        // (`plane.utils.reauth.guard_sensitive_action`) deliberately
        // returns a 401 for a STILL-VALID session that merely needs to
        // re-prove identity before a sensitive action (workspace
        // deletion, full data export, security-policy modification, API
        // token revocation) - not a real "your session died" 401 like
        // `plane.utils.session_activity`'s own idle-timeout gate
        // (`error_code: "WORKSPACE_SESSION_EXPIRED"`). Only THIS specific
        // `error_code` is excluded from the hard redirect-to-login below,
        // so a caller (see `@/hooks/use-sensitive-action-guard`) can catch
        // it and show the reauth modal in place instead of losing the
        // in-progress form/action to a full navigation.
        const errorCode = error?.response?.data?.error_code;
        if (error.response && error.response.status === 401 && errorCode !== "REAUTH_REQUIRED") {
          const currentPath = window.location.pathname;
          window.location.replace(`/${currentPath ? `?next_path=${currentPath}` : ``}`);
        }
        return Promise.reject(error);
      }
    );
  }

  get(url: string, params = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.get(url, {
      ...params,
      ...config,
    });
  }

  post(url: string, data = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.post(url, data, config);
  }

  put(url: string, data = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.put(url, data, config);
  }

  patch(url: string, data = {}, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.patch(url, data, config);
  }

  delete(url: string, data?: any, config: AxiosRequestConfig = {}) {
    return this.axiosInstance.delete(url, { data, ...config });
  }

  request(config = {}) {
    return this.axiosInstance(config);
  }
}
