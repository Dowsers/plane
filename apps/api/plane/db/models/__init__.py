# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .agent import AgentProfile
from .analytic import AnalyticView
from .audit import AuditEventType, WorkspaceAuditLog
from .api import APIActivityLog, APIToken
from .api_explorer import WorkspaceAPIExplorerSettings
from .asset import FileAsset
from .base import BaseModel
from .cycle import Cycle, CycleIssue, CycleUserProperties, CycleAutoScheduleConfig
from .dashboard import Dashboard, DashboardWidget
from .deploy_board import DeployBoard
from .draft import (
    DraftIssue,
    DraftIssueAssignee,
    DraftIssueLabel,
    DraftIssueModule,
    DraftIssueCycle,
)
from .estimate import Estimate, EstimatePoint
from .exporter import ExporterHistory
from .idempotency import IdempotencyKey
from .importer import Importer
from .initiative import Initiative, InitiativeProject, InitiativeActivity
from .intake import Intake, IntakeIssue, IntakeResponsibilitySetting, IntakeRotationMember, IntakeForm
from .milestone import Milestone
from .project_update import ProjectUpdate, ProjectUpdateReminder, AIGenerationStatus
from .project_template import (
    ProjectTemplate,
    ProjectTemplateState,
    ProjectTemplateLabel,
    ProjectTemplateMember,
    ProjectTemplateIssue,
)
from .customer import Customer, CustomerRequest, CustomerRequestIssue
from .intake_channel import (
    IntakeChannel,
    InboundEmailAlias,
    SlackWorkspaceConnection,
    SlackChannelProjectMapping,
    SlackUserConnection,
    SlackIssueThread,
    SlackNotificationLog,
    IntakeMessageLog,
)
from .figma import FigmaWorkspaceConnection, FigmaFileLink, FigmaSyncLog
from .triage_rule import TriageRule, TriageRuleCondition, TriageRuleAction
from .workflow_rule import WorkflowRule, WorkflowAction, WorkflowRuleExecutionLog
from .recurring_issue_template import (
    RecurringIssueTemplate,
    RecurringIssueTemplateLabel,
    RecurringIssueTemplateAssignee,
)
# NOTE: the legacy `plane.db.models.integration` package (`Integration`,
# `WorkspaceIntegration`, `GithubRepository`/`GithubRepositorySync`/
# `GithubIssueSync`/`GithubCommentSync`, `SlackProjectSync`) that used to be
# imported here has been removed as part of
# docs/feature-specs/07-integrations-git.md ("1. GitHub natif", "2. GitLab
# natif") in plane-selfhost. Confirmed exhaustively (see
# plane_fork_cat7_research_findings.md) to be completely dead: zero
# views/serializers/URLs anywhere in the current backend referenced any of
# these models, and their base classes predate this fork's current
# conventions (`Integration` extends `AuditModel` directly instead of
# `TimeAuditModel`/`WorkspaceBaseModel`; `WorkspaceIntegration` is a plain
# `BaseModel`, not workspace-scoped via `WorkspaceBaseModel`; none of the
# soft-delete-aware partial-unique-constraint conventions used everywhere
# else in this file). Removing them was not optional, not just cleanup: the
# legacy `GithubRepository` class name directly collided with this
# feature's own new, spec-named `github_integration.GithubRepository`
# model, and Django refuses to boot with two models of the same name in
# the same app - keeping both under different names was rejected as
# needlessly confusing (a real `GithubRepository` and a dead one, both
# always present in every migration/shell session). See
# plane/db/migrations/0151_remove_legacy_integration_models.py
# for the corresponding `DeleteModel` operations - this removes the
# (always-empty in practice, zero write path ever existed) legacy tables.
from .issue import (
    BulkIssueOperation,
    CommentReaction,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueBlocker,
    IssueComment,
    IssueLabel,
    IssueLink,
    IssueMention,
    IssueReaction,
    IssueRelation,
    IssueRelationChoices,
    IssueSequence,
    IssueSubscriber,
    IssueVote,
    IssueVersion,
    IssueDescriptionVersion,
)
from .issue_worklog import IssueWorklog, TimesheetPeriod
from .module import Module, ModuleIssue, ModuleLink, ModuleMember, ModuleUserProperties
from .notification import EmailNotificationLog, Notification, UserNotificationPreference
from .page import Page, PageLabel, PageLog, ProjectPage, PageVersion
from .push_notification import PushNotificationSubscription
from .project import (
    Project,
    ProjectBaseModel,
    ProjectIdentifier,
    ProjectMember,
    ProjectMemberInvite,
    ProjectNetwork,
    ProjectPublicMember,
    ProjectUserProperty,
)
from .natural_language_filter_query import NaturalLanguageFilterQuery
from .session import Session
from .social_connection import SocialLoginConnection
from .state import State, StateGroup, DEFAULT_STATES
from .user import Account, Profile, User, BotTypeEnum
from .view import IssueView, ViewSubscription, TeamspaceView
from .webhook import Webhook, WebhookLog
from .workspace import (
    Workspace,
    WorkspaceBaseModel,
    WorkspaceMember,
    Team,
    TeamMember,
    TeamProject,
    Teamspace,
    TeamspaceMember,
    TeamspaceProject,
    TEAMSPACE_LEAD,
    TEAMSPACE_MEMBER,
    TEAMSPACE_ROLE_CHOICES,
    WorkspaceMemberInvite,
    WorkspaceTheme,
    WorkspaceUserProperties,
    WorkspaceUserLink,
    WorkspaceHomePreference,
    WorkspaceUserPreference,
    WorkspaceAIUpdateDataScope,
    DuplicateDetectionScope,
    WorkspaceSecurityPolicy,
    MemberInviteRestriction,
    AllowedAuthMethod,
    WorkspaceVerifiedDomain,
    DomainVerificationMethod,
)

from .favorite import UserFavorite

from .issue_type import IssueType

from .recent_visit import UserRecentVisit

from .label import Label

from .device import Device, DeviceSession

from .sticky import Sticky

from .description import Description, DescriptionVersion

from .sla import SLAPolicy, IssueSLA

from .workflow_transition import (
    WorkflowTransition,
    WorkflowTransitionApprover,
    WorkflowTransitionCondition,
    WorkflowTransitionAction,
    IssueTransitionApprovalRequest,
    IssueTransitionApproval,
    WorkflowTransitionAuditLog,
)

from .rate_limit import RateLimitTier

from .scim import SCIMToken

from .flexible_query import WorkspaceQuerySettings, FlexibleQueryLog

from .github_integration import (
    GithubWorkspaceConnection,
    GithubRepository,
    GithubRepositoryProjectSync,
    ProjectGithubStateMapping,
    GithubPullRequest,
    IssuePullRequestLink,
    GithubInstallationType,
    GithubAccountType,
    GithubPullRequestStatus,
    GithubStateMappingTrigger,
    GithubPullRequestLinkType,
)

from .gitlab_integration import (
    GitlabWorkspaceConnection,
    GitlabRepository,
    GitlabRepositoryProjectConnection,
    ProjectGitlabSyncSettings,
    GitlabMergeRequestIssueSync,
    GitlabTokenType,
    GitlabMergeRequestState,
)

from .integration_event_log import (
    IntegrationEventLog,
    IntegrationProvider,
    IntegrationEventDirection,
)

from .sentry_integration import (
    WorkspaceSentryConnection,
    SentryProjectSync,
    IssueSentryDetail,
    SentrySyncStatus,
)

from .support import (
    WorkspaceSupportConnector,
    IssueSupportTicket,
    SupportConnectorProvider,
    SupportNoteVisibility,
    SupportTicketSyncState,
)

from .ai_config import WorkspaceAIConfig, WorkspaceAIProvider

from .issue_comment_summary import IssueCommentSummary, IssueCommentSummaryStatus

from .ai_generation_log import AIGenerationLog

from .issue_embedding import IssueEmbedding

from .issue_triage_suggestion import IssueTriageSuggestion, IssueTriageSuggestionStatus

from .issue_duplicate_suggestion import IssueDuplicateSuggestion, IssueDuplicateSuggestionStatus

from .digest import (
    DigestPreference,
    DigestRun,
    DigestItem,
    DigestFrequency,
    DigestScope,
    DigestRunStatus,
    DigestGenerationMethod,
    DigestItemType,
)

from .ai_chat import (
    AIConversation,
    AIConversationContextType,
    AIConversationSource,
    AIMessage,
    AIMessageRole,
    AIMessageMode,
    AIMessageStatus,
    AIChangeProposal,
    AIChangeProposalTargetModel,
    AIChangeProposalStatus,
)

from .page_reaction import PageReaction
from .page_collection import PageCollection
from .page_comment import PageComment, PageCommentReaction
from .page_subscriber import PageSubscriber
from .page_activity import PageActivity
from .page_template import PageTemplate

from .rbac import (
    Permission,
    PermissionCategory,
    PermissionConditionType,
    PermissionScheme,
    PermissionSchemeItem,
    WorkspaceRole,
    WorkspaceRoleScheme,
)
