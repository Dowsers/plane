# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .analytic import urlpatterns as analytic_urls
from .api import urlpatterns as api_urls
from .asset import urlpatterns as asset_urls
from .cycle import urlpatterns as cycle_urls
from .dashboard import urlpatterns as dashboard_urls
from .estimate import urlpatterns as estimate_urls
from .external import urlpatterns as external_urls
from .initiative import urlpatterns as initiative_urls
from .intake import urlpatterns as intake_urls
from .issue import urlpatterns as issue_urls
from .issue_worklog import urlpatterns as issue_worklog_urls
from .milestone import urlpatterns as milestone_urls
from .module import urlpatterns as module_urls
from .project_template import urlpatterns as project_template_urls
from .customer import urlpatterns as customer_urls
from .project_update import urlpatterns as project_update_urls
from .notification import urlpatterns as notification_urls
from .page import urlpatterns as page_urls
from .project import urlpatterns as project_urls
from .search import urlpatterns as search_urls
from .state import urlpatterns as state_urls
from .sync import urlpatterns as sync_urls
from .team import urlpatterns as team_urls
from .teamspace import urlpatterns as teamspace_urls
from .user import urlpatterns as user_urls
from .views import urlpatterns as view_urls
from .webhook import urlpatterns as webhook_urls
from .workflow_rule import urlpatterns as workflow_rule_urls
from .recurring_issue_template import urlpatterns as recurring_issue_template_urls
from .workspace import urlpatterns as workspace_urls
from .timezone import urlpatterns as timezone_urls
from .exporter import urlpatterns as exporter_urls
from .sla import urlpatterns as sla_urls
from .workflow_transition import urlpatterns as workflow_transition_urls
from .flexible_query import urlpatterns as flexible_query_settings_urls
from .rate_limit import urlpatterns as rate_limit_override_urls
from .api_explorer import urlpatterns as api_explorer_settings_urls
from .integrations import urlpatterns as integrations_urls
from .github_integration import urlpatterns as github_integration_urls
from .gitlab_integration import urlpatterns as gitlab_integration_urls
from .agent import urlpatterns as agent_urls
from .workspace_ai_config import urlpatterns as workspace_ai_config_urls
from .ai_triage_config import urlpatterns as ai_triage_config_urls
from .duplicate_detection_config import urlpatterns as duplicate_detection_config_urls
from .digest import urlpatterns as digest_urls
from .ai_chat import urlpatterns as ai_chat_urls

urlpatterns = [
    *analytic_urls,
    *asset_urls,
    *cycle_urls,
    *dashboard_urls,
    *estimate_urls,
    *external_urls,
    *initiative_urls,
    *intake_urls,
    *issue_urls,
    *issue_worklog_urls,
    *milestone_urls,
    *module_urls,
    *notification_urls,
    *page_urls,
    *project_urls,
    *project_template_urls,
    *customer_urls,
    *project_update_urls,
    *search_urls,
    *state_urls,
    *sync_urls,
    *team_urls,
    *teamspace_urls,
    *user_urls,
    *view_urls,
    *workspace_urls,
    *api_urls,
    *webhook_urls,
    *workflow_rule_urls,
    *recurring_issue_template_urls,
    *timezone_urls,
    *exporter_urls,
    *sla_urls,
    *workflow_transition_urls,
    *flexible_query_settings_urls,
    *rate_limit_override_urls,
    *api_explorer_settings_urls,
    *integrations_urls,
    *github_integration_urls,
    *gitlab_integration_urls,
    *agent_urls,
    *workspace_ai_config_urls,
    *ai_triage_config_urls,
    *duplicate_detection_config_urls,
    *digest_urls,
    *ai_chat_urls,
]
