import AppsPage from "./pages/Apps";
import AnalyticsPage from "./pages/Analytics";
import AnalyticsSinksPage from "./pages/AnalyticsSinks";
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
    label: "应用",
    description: "创建、管理并保护 SDK 应用。",
    nav_group: "构建",
    component: AppsPage
  },
  {
    path: "/placements",
    label: "投放位",
    description: "管理投放位、默认版本与上线包。",
    nav_group: "构建",
    component: PlacementsPage
  },
  {
    path: "/variants",
    label: "变体",
    description: "绑定包并配置产品顺序。",
    nav_group: "构建",
    component: VariantsPage
  },
  {
    path: "/rules",
    label: "规则",
    description: "配置规则集与流量定向逻辑。",
    nav_group: "定向",
    component: RulesPage
  },
  {
    path: "/experiments",
    label: "实验",
    description: "规划实验、分流并跟踪提升。",
    nav_group: "定向",
    component: ExperimentsPage
  },
  {
    path: "/packages",
    label: "包管理",
    description: "上传包并管理版本。",
    nav_group: "发布",
    component: PackagesPage
  },
  {
    path: "/events",
    label: "事件",
    description: "按时间、投放位与事件名查询。",
    nav_group: "洞察",
    component: EventsPage
  },
  {
    path: "/analytics-sinks",
    label: "分析转发",
    description: "管理 GA4 / Firebase 转发目的地。",
    nav_group: "洞察",
    component: AnalyticsSinksPage
  },
  {
    path: "/analytics",
    label: "统计分析",
    description: "查看漏斗与转发状态。",
    nav_group: "洞察",
    component: AnalyticsPage
  }
];
