import type { AdminPermission } from "@dream-space/contracts";
import {
  ClipboardList,
  Images,
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  Receipt,
  FileClock,
  UserRound,
  UserRoundCog,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavigationItem {
  href: string;
  label: string;
  section: "运营中心" | "业务运营" | "内容运营" | "系统管理";
  permission: AdminPermission;
  icon: LucideIcon;
}

export const adminNavigationItems: readonly AdminNavigationItem[] = [
  {
    href: "/dashboard",
    label: "运营总览",
    section: "运营中心",
    permission: "dashboard:read",
    icon: LayoutDashboard,
  },
  {
    href: "/users",
    label: "用户管理",
    section: "业务运营",
    permission: "users:read",
    icon: UserRound,
  },
  {
    href: "/privacy",
    label: "隐私请求",
    section: "业务运营",
    permission: "privacy:read",
    icon: UserRoundX,
  },
  {
    href: "/tasks",
    label: "生成任务",
    section: "业务运营",
    permission: "tasks:read",
    icon: ClipboardList,
  },
  {
    href: "/risk",
    label: "提示词风控",
    section: "业务运营",
    permission: "risk-rules:read",
    icon: ShieldAlert,
  },
  {
    href: "/moderation",
    label: "人工审核",
    section: "业务运营",
    permission: "moderation:read",
    icon: ShieldAlert,
  },
  {
    href: "/billing",
    label: "计费与订单",
    section: "业务运营",
    permission: "billing:read",
    icon: Receipt,
  },
  {
    href: "/models",
    label: "模型配置",
    section: "业务运营",
    permission: "models:read",
    icon: ShieldCheck,
  },
  {
    href: "/inspirations",
    label: "灵感精选",
    section: "内容运营",
    permission: "inspirations:read",
    icon: Images,
  },
  {
    href: "/admin-users",
    label: "管理员账号",
    section: "系统管理",
    permission: "admin-accounts:read",
    icon: UserRoundCog,
  },
  {
    href: "/roles",
    label: "角色与权限",
    section: "系统管理",
    permission: "roles:read",
    icon: ShieldCheck,
  },
  {
    href: "/audit",
    label: "操作审计",
    section: "系统管理",
    permission: "audit:read",
    icon: FileClock,
  },
];

export const adminNavigationSections = ["运营中心", "业务运营", "内容运营", "系统管理"] as const;

export function requiredPermissionForPath(pathname: string) {
  return adminNavigationItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )?.permission;
}
