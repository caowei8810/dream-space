"use client";

import { ClipboardList, Images, LogOut, PanelLeftClose, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useAdminSession } from "../lib/use-admin-session";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading, error, logout } = useAdminSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && (!session || !session.authenticated)) router.replace("/login");
  }, [loading, router, session]);

  if (loading) {
    return <main className="admin-state-page">正在验证管理员会话…</main>;
  }
  if (error) {
    return <main className="admin-state-page">无法连接管理 API，请检查服务状态。</main>;
  }
  if (!session?.authenticated) return <main className="admin-state-page">正在进入登录页…</main>;

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
          <Link className={pathname.startsWith("/tasks") ? "active" : ""} href="/tasks">
            <ClipboardList aria-hidden="true" />
            <span>生成任务</span>
          </Link>
          <Link
            className={pathname.startsWith("/inspirations") ? "active" : ""}
            href="/inspirations"
          >
            <Images aria-hidden="true" />
            <span>灵感管理</span>
          </Link>
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
      <div className="admin-main">{children}</div>
    </div>
  );
}
