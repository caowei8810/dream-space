"use client";

import { LogOut, PanelLeftClose, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  adminNavigationItems,
  adminNavigationSections,
  requiredPermissionForPath,
} from "../lib/admin-navigation";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading, error, logout, refresh } = useAdminSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !error && (!session || !session.authenticated)) router.replace("/login");
  }, [error, loading, router, session]);

  if (loading) {
    return (
      <main className="admin-state-page">
        <AdminState kind="loading" title="正在验证管理员会话" />
      </main>
    );
  }
  if (error) {
    return (
      <main className="admin-state-page">
        <AdminState
          kind="error"
          title="无法连接管理 API"
          description="请检查服务状态后重试。"
          onRetry={() => void refresh()}
        />
      </main>
    );
  }
  if (!session?.authenticated) {
    return (
      <main className="admin-state-page">
        <AdminState kind="loading" title="正在进入登录页" />
      </main>
    );
  }

  const requiredPermission = requiredPermissionForPath(pathname);
  const canAccessPage = !requiredPermission || hasAdminPermission(session, requiredPermission);
  const navigationItems = adminNavigationItems.filter((item) =>
    hasAdminPermission(session, item.permission),
  );

  return (
    <div className={`admin-layout${collapsed ? " is-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-logo" aria-hidden="true">
            <ShieldCheck />
          </span>
          <span className="admin-brand-text">
            <strong>造梦空间</strong>
            <small>OPERATIONS</small>
          </span>
          <button
            className="admin-icon-button admin-sidebar-toggle"
            type="button"
            aria-label={collapsed ? "展开导航" : "收起导航"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <PanelLeftClose aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="管理端导航">
          {adminNavigationSections.map((section) => {
            const items = navigationItems.filter((item) => item.section === section);
            if (items.length === 0) return null;
            return (
              <div className="admin-nav-section" key={section}>
                <p>{section}</p>
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      className={active ? "active" : ""}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="admin-sidebar-account">
          <span className="admin-avatar">{session.user.displayName.slice(0, 1)}</span>
          <span className="admin-account-copy">
            <strong>{session.user.displayName}</strong>
            <small>{session.user.phoneMasked}</small>
          </span>
          <button
            className="admin-icon-button"
            type="button"
            aria-label="退出管理端"
            title="退出管理端"
            onClick={() => void logout().then(() => router.replace("/login"))}
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className="admin-main">
        {canAccessPage ? (
          children
        ) : (
          <main className="admin-state-page">
            <AdminState kind="forbidden" />
          </main>
        )}
      </div>
    </div>
  );
}
