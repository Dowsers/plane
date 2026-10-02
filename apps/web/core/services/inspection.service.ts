/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TInspectionCompliance,
  TInspectionDocumentKind,
  TInspectionReviewPayload,
  TInspectionSignPayload,
  TInspectionSignResponse,
  TInspectionSignature,
  TInspectionTemplate,
  TInspectionTemplateVersion,
  TMyInspectionSignature,
  TProjectInspectionConfig,
  TProjectInspectionConfigPayload,
  TProjectInspectionMe,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Inspection compliance (ISO/IEC 17020 §4.1/§4.2). Backend:
 * `plane.app.views.inspection`, routes in `plane.app.urls.inspection`.
 *
 * Every project-scoped route wrapped here is on the enforcement gate's
 * exemption list (`plane.utils.inspection_compliance.EXEMPT_URL_NAMES`), so
 * these calls keep working for a member who is otherwise blocked - which is
 * precisely what lets the UI show them the signing screen instead of an error.
 */
export class InspectionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // --- Per-project configuration (Admin only, both verbs)

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<TProjectInspectionConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProjectConfig(
    workspaceSlug: string,
    projectId: string,
    data: TProjectInspectionConfigPayload
  ): Promise<TProjectInspectionConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- Workspace-default document templates (workspace Admin only)

  async listWorkspaceTemplates(workspaceSlug: string): Promise<TInspectionTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/inspection-templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceTemplate(
    workspaceSlug: string,
    data: { kind: TInspectionDocumentKind; name?: string; body?: string }
  ): Promise<TInspectionTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/inspection-templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceTemplate(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/inspection-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- Versions. A published version is immutable: there is no update path for
  // one, by design - revising means creating a new version and publishing it.

  async createVersion(
    workspaceSlug: string,
    templateId: string,
    data: Partial<Pick<TInspectionTemplateVersion, "body" | "questionnaire_schema" | "requires_resignature">>
  ): Promise<TInspectionTemplateVersion> {
    return this.post(`/api/workspaces/${workspaceSlug}/inspection-templates/${templateId}/versions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateDraftVersion(
    workspaceSlug: string,
    templateId: string,
    versionId: string,
    data: Partial<Pick<TInspectionTemplateVersion, "body" | "questionnaire_schema" | "requires_resignature">>
  ): Promise<TInspectionTemplateVersion> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/inspection-templates/${templateId}/versions/${versionId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Freezes the version AND resets every affected member's grace clock when it
   * requires re-signature - see `InspectionTemplateVersionPublishEndpoint`. */
  async publishVersion(
    workspaceSlug: string,
    templateId: string,
    versionId: string
  ): Promise<TInspectionTemplateVersion> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/inspection-templates/${templateId}/versions/${versionId}/publish/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- Per-project document override

  async listProjectTemplates(workspaceSlug: string, projectId: string): Promise<TInspectionTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection-template/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProjectTemplate(
    workspaceSlug: string,
    projectId: string,
    data: { kind: TInspectionDocumentKind; name?: string; body?: string }
  ): Promise<TInspectionTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection-template/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProjectTemplate(workspaceSlug: string, projectId: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection-template/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- Member facing

  async getMyObligations(workspaceSlug: string, projectId: string): Promise<TProjectInspectionMe> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection/me/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async sign(workspaceSlug: string, projectId: string, data: TInspectionSignPayload): Promise<TInspectionSignResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection/sign/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- Review (§4.1) and the admin dashboard

  async reviewDeclaration(
    workspaceSlug: string,
    projectId: string,
    signatureId: string,
    data: TInspectionReviewPayload
  ): Promise<TInspectionSignature> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection/declarations/${signatureId}/review/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getDeclaration(workspaceSlug: string, projectId: string, signatureId: string): Promise<TInspectionSignature> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection/declarations/${signatureId}/review/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCompliance(workspaceSlug: string, projectId: string): Promise<TInspectionCompliance> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection/compliance/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- The evidentiary PDF and the signer's own record

  /** Fetches the PDF as a blob and hands the browser a download.
   *
   * Done here rather than with a plain `<a href>` because the endpoint is
   * session-authenticated and returns `Content-Disposition` - an anchor would
   * work, but it bypasses this service's error handling, so a 403 would silently
   * navigate to a JSON error page instead of surfacing as a rejected promise.
   */
  async downloadSignaturePdf(
    workspaceSlug: string,
    projectId: string,
    signatureId: string,
    fallbackFilename = "document.pdf"
  ): Promise<void> {
    const response = await this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/inspection/declarations/${signatureId}/pdf/`,
      { responseType: "blob" }
    ).catch((error) => {
      throw error?.response?.data;
    });

    // Prefer the server's own filename: it encodes project, kind, version and
    // date, so a folder of downloads stays sortable.
    const disposition: string = response?.headers?.["content-disposition"] ?? "";
    const matched = /filename="?([^";]+)"?/.exec(disposition);
    const filename = matched?.[1] ?? fallbackFilename;

    const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  async listMySignatures(): Promise<TMyInspectionSignature[]> {
    return this.get("/api/users/me/inspection-signatures/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
