# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .project.base import (
    ProjectViewSet,
    ProjectIdentifierEndpoint,
    ProjectUserViewsEndpoint,
    ProjectFavoritesViewSet,
    DeployBoardViewSet,
    ProjectArchiveUnarchiveEndpoint,
    ProjectRoadmapEndpoint,
)

from .project.progress import ProjectProgressEndpoint

from .project.invite import (
    UserProjectInvitationsViewset,
    ProjectInvitationsViewset,
    ProjectJoinEndpoint,
)

from .project.member import (
    ProjectMemberViewSet,
    ProjectMemberUserEndpoint,
    UserProjectRolesEndpoint,
    ProjectMemberPreferenceEndpoint,
)

from .user.base import (
    UserEndpoint,
    UpdateUserOnBoardedEndpoint,
    UpdateUserTourCompletedEndpoint,
    UserActivityEndpoint,
)


from .base import BaseAPIView, BaseViewSet

from .workspace.base import (
    WorkSpaceViewSet,
    UserWorkSpacesEndpoint,
    WorkSpaceAvailabilityCheckEndpoint,
    UserWorkspaceDashboardEndpoint,
    WorkspaceThemeViewSet,
    ExportWorkspaceUserActivityEndpoint,
)

from .workspace.draft import WorkspaceDraftIssueViewSet

from .workspace.home import WorkspaceHomePreferenceViewSet

from .workspace.favorite import (
    WorkspaceFavoriteEndpoint,
    WorkspaceFavoriteGroupEndpoint,
)
from .workspace.recent_visit import UserRecentVisitViewSet
from .workspace.user_preference import WorkspaceUserPreferenceViewSet

from .workspace.member import (
    WorkSpaceMemberViewSet,
    WorkspaceMemberUserEndpoint,
    WorkspaceProjectMemberEndpoint,
    WorkspaceMemberUserViewsEndpoint,
)
from .workspace.invite import (
    WorkspaceInvitationsViewset,
    WorkspaceJoinEndpoint,
    UserWorkspaceInvitationsViewSet,
)
from .workspace.label import WorkspaceLabelsEndpoint, LabelMergeEndpoint, LabelBulkRescopeEndpoint
from .workspace.state import WorkspaceStatesEndpoint
from .workspace.user import (
    UserLastProjectWithWorkspaceEndpoint,
    WorkspaceUserProfileIssuesEndpoint,
    WorkspaceUserPropertiesEndpoint,
    WorkspaceUserProfileEndpoint,
    WorkspaceUserActivityEndpoint,
    WorkspaceUserProfileStatsEndpoint,
    UserActivityGraphEndpoint,
    UserIssueCompletedGraphEndpoint,
)
from .workspace.estimate import WorkspaceEstimatesEndpoint
from .workspace.module import WorkspaceModulesEndpoint
from .workspace.cycle import WorkspaceCyclesEndpoint, WorkspaceActiveCyclesEndpoint
from .workspace.quick_link import QuickLinkViewSet
from .workspace.sticky import WorkspaceStickyViewSet

from .state.base import StateViewSet, IntakeStateEndpoint
from .view.base import (
    WorkspaceViewViewSet,
    WorkspaceViewIssuesViewSet,
    IssueViewViewSet,
    IssueViewFavoriteViewSet,
)
from .view.subscription import ViewSubscriptionViewSet, UserViewSubscriptionsEndpoint
from .view.nl_filter_assistant import (
    ProjectNLFilterAssistantEndpoint,
    WorkspaceNLFilterAssistantEndpoint,
    NLFilterAssistantRecentEndpoint,
)
from .cycle.base import (
    CycleViewSet,
    CycleDateCheckEndpoint,
    CycleStartStopEndpoint,
    CycleAutoScheduleConfigEndpoint,
    CycleAutoSchedulePreviewEndpoint,
    CycleFavoriteViewSet,
    TransferCycleIssueEndpoint,
    CycleUserPropertiesEndpoint,
    CycleAnalyticsEndpoint,
    CycleProgressEndpoint,
)
from .cycle.issue import CycleIssueViewSet
from .cycle.archive import CycleArchiveUnarchiveEndpoint

from .asset.base import FileAssetEndpoint, UserAssetsEndpoint, FileAssetViewSet
from .asset.v2 import (
    WorkspaceFileAssetEndpoint,
    UserAssetsV2Endpoint,
    StaticFileAssetEndpoint,
    AssetRestoreEndpoint,
    ProjectAssetEndpoint,
    ProjectBulkAssetEndpoint,
    AssetCheckEndpoint,
    DuplicateAssetEndpoint,
    WorkspaceAssetDownloadEndpoint,
    ProjectAssetDownloadEndpoint,
)
from .issue.base import (
    IssueListEndpoint,
    IssueViewSet,
    ProjectUserDisplayPropertyEndpoint,
    BulkDeleteIssuesEndpoint,
    BulkIssueOperationsEndpoint,
    DeletedIssuesListViewSet,
    IssuePaginatedViewSet,
    IssueDetailEndpoint,
    IssueBulkUpdateDateEndpoint,
    IssueMetaEndpoint,
    IssueDetailIdentifierEndpoint,
)

from .issue.activity import IssueActivityEndpoint

from .issue.archive import IssueArchiveViewSet, BulkArchiveIssuesEndpoint

from .issue.attachment import (
    IssueAttachmentEndpoint,
    # V2
    IssueAttachmentV2Endpoint,
)

from .issue.comment import IssueCommentViewSet, CommentReactionViewSet

from .issue.label import LabelViewSet, BulkCreateIssueLabelsEndpoint

from .issue.link import IssueLinkViewSet

from .issue.relation import IssueRelationViewSet, IssueGanttDependenciesEndpoint

from .issue.reaction import IssueReactionViewSet

from .issue.sub_issue import SubIssuesEndpoint

from .issue.subscriber import IssueSubscriberViewSet

from .issue.version import IssueVersionEndpoint, WorkItemDescriptionVersionEndpoint

from .module.base import (
    ModuleViewSet,
    ModuleLinkViewSet,
    ModuleFavoriteViewSet,
    ModuleUserPropertiesEndpoint,
)

from .module.issue import ModuleIssueViewSet

from .module.archive import ModuleArchiveUnarchiveEndpoint

from .api import ApiTokenEndpoint

from .agent import AgentProfileViewSet, AgentTokenListCreateEndpoint, AgentTokenRevokeEndpoint

from .page.base import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageDuplicateEndpoint,
)
from .page.version import PageVersionEndpoint

from .search.base import GlobalSearchEndpoint, SearchEndpoint
from .search.issue import IssueSearchEndpoint


from .external.base import (
    GPTIntegrationEndpoint,
    UnsplashEndpoint,
    WorkspaceGPTIntegrationEndpoint,
)
from .estimate.base import (
    ProjectEstimatePointEndpoint,
    BulkEstimatePointEndpoint,
    EstimatePointEndpoint,
)

from .intake.base import (
    IntakeViewSet,
    IntakeIssueViewSet,
    IntakeWorkItemDescriptionVersionEndpoint,
    IntakeResponsibilitySettingEndpoint,
    IntakeRotationMemberViewSet,
    IntakeRotationMemberReorderEndpoint,
    IntakeFormViewSet,
    IntakeFormRegenerateTokenEndpoint,
)
from .intake.triage_rule import (
    TriageRuleViewSet,
    TriageRuleReorderEndpoint,
    TriageRuleDryRunEndpoint,
    TriageRuleReapplyEndpoint,
)
from .intake.channel import (
    IntakeChannelViewSet,
    IntakeChannelEmailRegenerateEndpoint,
    SlackWorkspaceConnectionEndpoint,
    SlackWorkspaceConnectEndpoint,
    SlackChannelProjectMappingViewSet,
    SlackUserLinkVerifyEndpoint,
    SlackUserConnectionEndpoint,
)
from .figma import (
    FigmaWorkspaceConnectionEndpoint,
    FigmaOAuthAuthorizeEndpoint,
    FigmaOAuthCallbackEndpoint,
)

from .workflow_rule.base import (
    WorkflowRuleViewSet,
    WorkflowRuleToggleEndpoint,
    WorkflowRuleExecutionLogEndpoint,
    WorkflowRuleDuplicateEndpoint,
)
from .recurring_issue_template.base import (
    RecurringIssueTemplateViewSet,
    RecurringIssueTemplatePauseEndpoint,
    RecurringIssueTemplateResumeEndpoint,
    RecurringIssueTemplateGenerateNowEndpoint,
    RecurringIssueTemplateGeneratedIssuesEndpoint,
    IssueConvertToRecurringEndpoint,
)

from .initiative.base import InitiativeViewSet
from .initiative.project import InitiativeProjectViewSet
from .initiative.activity import InitiativeActivityEndpoint

from .milestone.base import MilestoneViewSet, MilestoneReorderEndpoint
from .milestone.issue import MilestoneIssueViewSet, MilestoneAvailableIssuesEndpoint

from .project_update.base import (
    ProjectUpdateViewSet,
    ProjectUpdateLatestEndpoint,
    ProjectUpdateGenerateSummaryEndpoint,
)

from .project_template.base import (
    ProjectTemplateViewSet,
    ProjectTemplateDuplicateEndpoint,
    ProjectTemplateCreateProjectEndpoint,
)

from .analytic.base import (
    AnalyticsEndpoint,
    AnalyticViewViewset,
    SavedAnalyticEndpoint,
    ExportAnalyticsEndpoint,
    DefaultAnalyticsEndpoint,
    ProjectStatsEndpoint,
)

from .analytic.advance import (
    AdvanceAnalyticsEndpoint,
    AdvanceAnalyticsStatsEndpoint,
    AdvanceAnalyticsChartEndpoint,
)

from .analytic.velocity import AdvanceAnalyticsVelocityEndpoint

from .analytic.duration import AdvanceAnalyticsDurationEndpoint

from .analytic.project_analytics import (
    ProjectAdvanceAnalyticsEndpoint,
    ProjectAdvanceAnalyticsStatsEndpoint,
    ProjectAdvanceAnalyticsChartEndpoint,
)

from .dashboard.base import (
    DashboardViewSet,
    DashboardWidgetViewSet,
    DashboardWidgetReorderEndpoint,
)
from .dashboard.publish import DashboardPublishEndpoint
from .dashboard.data import DashboardWidgetDataEndpoint

from .notification.base import (
    NotificationViewSet,
    UnreadNotificationEndpoint,
    UserNotificationPreferenceEndpoint,
)

from .exporter.base import ExportIssuesEndpoint


from .webhook.base import (
    WebhookEndpoint,
    WebhookLogsEndpoint,
    WebhookSecretRegenerateEndpoint,
    WebhookTestSendEndpoint,
)

from .error_404 import custom_404_view

from .notification.base import MarkAllReadNotificationViewSet
from .user.base import AccountEndpoint, ProfileEndpoint, UserSessionEndpoint

from .timezone.base import TimezoneEndpoint

from .sla.base import SLAPolicyViewSet, SLAPolicyDuplicateEndpoint
from .sla.issue import IssueSLAEndpoint
from .sla.report import SLAReportEndpoint

from .workflow_transition.base import (
    WorkflowTransitionViewSet,
    WorkflowTransitionApproverEndpoint,
    WorkflowTransitionConditionEndpoint,
    WorkflowTransitionActionEndpoint,
    WorkflowTransitionAuditLogEndpoint,
    IssueAllowedTransitionsEndpoint,
    IssueTransitionRequestApprovalEndpoint,
    IssueTransitionApprovalApproveEndpoint,
    IssueTransitionApprovalRejectEndpoint,
)

from .flexible_query import WorkspaceQuerySettingsEndpoint
from .api_explorer import WorkspaceAPIExplorerSettingsEndpoint

from .rate_limit import WorkspaceAPITokenRateLimitOverrideEndpoint

from .github_integration import (
    GithubConnectionEndpoint,
    GithubOAuthCallbackEndpoint,
    GithubRepositoryListEndpoint,
    GithubRepositoryProjectSyncViewSet,
    ProjectGithubStateMappingEndpoint,
    IssuePullRequestLinkViewSet,
)

from .gitlab_integration import (
    GitlabConnectionEndpoint,
    GitlabRepositoryListEndpoint,
    GitlabRepositoryProjectConnectionViewSet,
    ProjectGitlabSyncSettingsEndpoint,
    GitlabMergeRequestIssueSyncViewSet,
)

from .workspace_ai_config import WorkspaceAIConfigEndpoint, WorkspaceAIConfigTestEndpoint

from .issue_comment_summary import IssueCommentSummaryEndpoint
