import AppsPage from "./pages/Apps";
import AnalyticsPage from "./pages/Analytics";
import EventsPage from "./pages/Events";
import ExperimentsPage from "./pages/Experiments";
import PackagesPage from "./pages/Packages";
import PlacementsPage from "./pages/Placements";
import RulesPage from "./pages/Rules";
import VariantsPage from "./pages/Variants";

export type RouteConfig = {
  path: string;
  label: string;
  description: string;
  nav_group: string;
  component: () => JSX.Element;
};

export const routes: RouteConfig[] = [
  {
    path: "/apps",
    label: "App",
    description: "Create, manage, and secure SDK applications.",
    nav_group: "Build",
    component: AppsPage
  },
  {
    path: "/placements",
    label: "Placement",
    description: "Control placements, defaults, and live packages.",
    nav_group: "Build",
    component: PlacementsPage
  },
  {
    path: "/variants",
    label: "Variant",
    description: "Bind packages and configure offering order.",
    nav_group: "Build",
    component: VariantsPage
  },
  {
    path: "/rules",
    label: "Rules",
    description: "Design rulesets and traffic targeting logic.",
    nav_group: "Targeting",
    component: RulesPage
  },
  {
    path: "/experiments",
    label: "Experiments",
    description: "Plan experiments, split traffic, and track lift.",
    nav_group: "Targeting",
    component: ExperimentsPage
  },
  {
    path: "/packages",
    label: "Packages",
    description: "Upload packages and manage versions.",
    nav_group: "Release",
    component: PackagesPage
  },
  {
    path: "/events",
    label: "Events",
    description: "Query events by time, placement, and name.",
    nav_group: "Insights",
    component: EventsPage
  },
  {
    path: "/analytics",
    label: "Analytics",
    description: "Review funnels and forwarding status.",
    nav_group: "Insights",
    component: AnalyticsPage
  }
];
