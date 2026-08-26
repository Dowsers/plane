# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .asset import urlpatterns as asset_patterns
from .cycle import urlpatterns as cycle_patterns
from .intake import urlpatterns as intake_patterns
from .label import urlpatterns as label_patterns
from .member import urlpatterns as member_patterns
from .module import urlpatterns as module_patterns
from .project import urlpatterns as project_patterns
from .state import urlpatterns as state_patterns
from .team import urlpatterns as team_patterns
from .user import urlpatterns as user_patterns
from .work_item import urlpatterns as work_item_patterns
from .invite import urlpatterns as invite_patterns
from .sticky import urlpatterns as sticky_patterns
from .rate_limit import urlpatterns as rate_limit_patterns
from .flexible_query import urlpatterns as flexible_query_patterns
from .api_explorer import urlpatterns as api_explorer_patterns
from .figma import urlpatterns as figma_patterns

urlpatterns = [
    *asset_patterns,
    *cycle_patterns,
    *intake_patterns,
    *label_patterns,
    *member_patterns,
    *module_patterns,
    *project_patterns,
    *state_patterns,
    *team_patterns,
    *user_patterns,
    *work_item_patterns,
    *invite_patterns,
    *sticky_patterns,
    *rate_limit_patterns,
    *flexible_query_patterns,
    *api_explorer_patterns,
    *figma_patterns,
]
