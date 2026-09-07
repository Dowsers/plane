/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  IFormattedInstanceConfiguration,
  IInstance,
  IInstanceAdmin,
  IInstanceConfiguration,
  IInstanceInfo,
  TGenerateVapidKeysResponse,
  TInstanceSAMLConfiguration,
  TInstanceSAMLConfigurationCreatePayload,
  TInstanceSAMLConfigurationUpdatePayload,
  TPage,
  TPaginatedResponse,
  TPushNotificationConfig,
  TPushNotificationConfigUpdatePayload,
  TPushNotificationTestResult,
  TSAMLTestConnectionResponse,
  TSAMLVerifiedDomain,
  TSAMLVerifiedDomainCreatePayload,
  TSAMLVerifiedDomainVerifyResponse,
  TUserPasswordResetLinkResponse,
  TWorkspaceAuditLogDetail,
} from "@plane/types";
// api service
import { APIService } from "../api.service";

/**
 * Service class for managing instance-related operations
 * Handles retrieval of instance information and changelog
 * @extends {APIService}
 */
export class InstanceService extends APIService {
  /**
   * Creates an instance of InstanceService
   * Initializes the service with the base API URL
   */
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Retrieves information about the current instance
   * @returns {Promise<IInstanceInfo>} Promise resolving to instance information
   * @throws {Error} If the API request fails
   * @remarks This method uses the validateStatus: null option to bypass interceptors for unauthorized errors.
   */
  async info(): Promise<IInstanceInfo> {
    return this.get("/api/instances/", { validateStatus: null })
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Fetches the changelog for the current instance
   * @returns {Promise<TPage>} Promise resolving to the changelog page data
   * @throws {Error} If the API request fails
   */
  async changelog(): Promise<TPage> {
    return this.get("/api/instances/changelog/")
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Fetches the list of instance admins
   * @returns {Promise<IInstanceAdmin[]>} Promise resolving to an array of instance admins
   * @throws {Error} If the API request fails
   * @remarks This method uses the validateStatus: null option to bypass interceptors for unauthorized errors.
   */
  async admins(): Promise<IInstanceAdmin[]> {
    return this.get("/api/instances/admins/", { validateStatus: null })
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Generates a password reset link for a user, for an instance admin to relay directly
   * (used when the instance has no SMTP configured, so the normal emailed forgot-password
   * flow is unavailable)
   * @param {string} email Email of the user to generate the reset link for
   * @returns {Promise<TUserPasswordResetLinkResponse>} Promise resolving to the generated reset link
   * @throws {Error} If the API request fails
   */
  async generateUserPasswordResetLink(email: string): Promise<TUserPasswordResetLinkResponse> {
    return this.post("/api/instances/admin/users/reset-password-link/", { email })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Updates the instance information
   * @param {Partial<IInstance>} data Data to update the instance with
   * @returns {Promise<IInstance>} Promise resolving to the updated instance information
   * @throws {Error} If the API request fails
   */
  async update(data: Partial<IInstance>): Promise<IInstance> {
    return this.patch("/api/instances/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Fetches the list of instance configurations
   * @returns {Promise<IInstanceConfiguration[]>} Promise resolving to an array of instance configurations
   * @throws {Error} If the API request fails
   */
  async configurations(): Promise<IInstanceConfiguration[]> {
    return this.get("/api/instances/configurations/")
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Updates the instance configurations
   * @param {Partial<IFormattedInstanceConfiguration>} data Data to update the instance configurations with
   * @returns {Promise<IInstanceConfiguration[]>} The updated instance configurations
   * @throws {Error} If the API request fails
   */
  async updateConfigurations(data: Partial<IFormattedInstanceConfiguration>): Promise<IInstanceConfiguration[]> {
    return this.patch("/api/instances/configurations/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Sends a test email to the specified receiver to test SMTP configuration
   * @param {string} receiverEmail Email address to send the test email to
   * @returns {Promise<void>} Promise resolving to void
   * @throws {Error} If the API request fails
   */
  async sendTestEmail(receiverEmail: string): Promise<void> {
    return this.post("/api/instances/email-credentials-check/", {
      receiver_email: receiverEmail,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Disables the email configuration
   * @returns {Promise<void>} Promise resolving to void
   * @throws {Error} If the API request fails
   */
  async disableEmail(): Promise<void> {
    return this.delete("/api/instances/configurations/disable-email-feature/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Category 11 (docs/feature-specs/11-admin-security-sso.md in
   * plane-selfhost), features 3+5 merged, exigence 10 - god-mode-only
   * instance-scoped audit log (`InstanceAuditLogEndpoint`,
   * apps/api/plane/license/api/views/audit_log.py). Never returns a
   * workspace-scoped entry - today this is effectively just
   * `OAUTH_CONFIG_UPDATED` events (`workspace=null`).
   * @param {{ cursor?: string; per_page?: number; event_type?: string }} params
   * @returns {Promise<TPaginatedResponse<TWorkspaceAuditLogDetail[]>>}
   * @throws {Error} If the API request fails
   */
  async auditLogs(params?: {
    cursor?: string;
    per_page?: number;
    event_type?: string;
  }): Promise<TPaginatedResponse<TWorkspaceAuditLogDetail[]>> {
    return this.get("/api/instances/audit-logs/", { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Category 11 (docs/feature-specs/11-admin-security-sso.md in
   * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - instance-admin
   * (god-mode) CRUD + domain verification + test-connection for
   * `InstanceSAMLConfiguration`
   * (apps/api/plane/license/api/views/saml.py). Folded onto this same
   * `InstanceService` rather than a new sibling class, matching this
   * class's own `auditLogs()` precedent (both are god-mode-only,
   * instance-scoped, same category) rather than feature 6's separate
   * `WorkspaceSecurityService` (a workspace-scoped, Admin/Owner-split
   * surface - a different shape of precedent).
   */
  async samlConfigurations(): Promise<TInstanceSAMLConfiguration[]> {
    return this.get("/api/instances/admin/saml-configurations/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getSamlConfiguration(configId: string): Promise<TInstanceSAMLConfiguration> {
    return this.get(`/api/instances/admin/saml-configurations/${configId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createSamlConfiguration(data: TInstanceSAMLConfigurationCreatePayload): Promise<TInstanceSAMLConfiguration> {
    return this.post("/api/instances/admin/saml-configurations/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSamlConfiguration(
    configId: string,
    data: TInstanceSAMLConfigurationUpdatePayload
  ): Promise<TInstanceSAMLConfiguration> {
    return this.patch(`/api/instances/admin/saml-configurations/${configId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteSamlConfiguration(configId: string): Promise<void> {
    return this.delete(`/api/instances/admin/saml-configurations/${configId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Creates a domain + generates its `verification_token`, does NOT verify. */
  async addSamlDomain(configId: string, data: TSAMLVerifiedDomainCreatePayload): Promise<TSAMLVerifiedDomain> {
    return this.post(`/api/instances/admin/saml-configurations/${configId}/domains/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** SYNCHRONOUS (DNS TXT only, bounded ~5s) - no polling needed, just a
   * loading state, matching feature 6's own verified-domain "verify now"
   * UX. */
  async verifySamlDomain(configId: string, domainId: string): Promise<TSAMLVerifiedDomainVerifyResponse> {
    return this.post(`/api/instances/admin/saml-configurations/${configId}/domains/${domainId}/verify/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Exigence 13 - `redirect_url` is a REAL browser navigation target
   * (the start of a genuine SAML round-trip against the IdP), never
   * something to `fetch()`. */
  async testSamlConnection(configId: string): Promise<TSAMLTestConnectionResponse> {
    return this.post(`/api/instances/admin/saml-configurations/${configId}/test-connection/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
   * plane-selfhost), feature 3 ("Notifications push en self-hosted") -
   * god-mode admin config for VAPID/FCM/APNs credentials
   * (`plane.license.api.views.push_notification`). Folded onto this same
   * `InstanceService` rather than a new sibling class, matching the SAML
   * methods' own precedent above (god-mode-only, instance-scoped, no
   * mobx store needed - see this fork's own `authentication/saml/page.tsx`
   * for the equivalent local-`useSWR` frontend pattern).
   *
   * Never returns `vapid_private_key`/`fcm_service_account_json`/
   * `apns_auth_key` - see `TPushNotificationConfig`'s own doc comment.
   */
  async getPushNotificationConfig(): Promise<TPushNotificationConfig> {
    return this.get("/api/instances/configurations/push/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Only send a secret key here when the admin actually typed a new
   * value - see `TPushNotificationConfigUpdatePayload`'s own doc comment
   * for why an omitted secret is NOT the same as an empty one. */
  async updatePushNotificationConfig(data: TPushNotificationConfigUpdatePayload): Promise<TPushNotificationConfig> {
    return this.patch("/api/instances/configurations/push/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Generates+stores a fresh VAPID keypair server-side (exigence 9) -
   * overwrites any previously configured VAPID keys, which silently
   * breaks push for every already-subscribed browser until it
   * re-subscribes (see `GenerateVapidKeysEndpoint`'s own docstring) - a
   * confirmation prompt before calling this is this method's caller's
   * responsibility. */
  async generateVapidKeys(): Promise<TGenerateVapidKeysResponse> {
    return this.post("/api/instances/configurations/push/generate-vapid-keys/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Sends a REAL test push, synchronously, to the calling admin's own
   * active Web Push subscriptions (exigence 9's "envoyer un test"). A
   * non-2xx response still carries the same `{success, results}` shape
   * (`PushNotificationTestEndpoint` returns 400 when every subscription
   * failed, or when there is no VAPID key/no active subscription at all)
   * - callers should read `error?.response?.data` (or catch and inspect
   * the thrown payload) rather than only trusting a resolved promise. */
  async sendTestPushNotification(): Promise<TPushNotificationTestResult> {
    return this.post("/api/instances/configurations/push/test/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
