"use client";

import { CircleAlert, Inbox, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

type AdminStateKind = "loading" | "error" | "empty" | "forbidden";

const stateCopy: Record<AdminStateKind, { title: string; description: string }> = {
  loading: { title: "正在加载", description: "正在从管理 API 获取最新数据。" },
  error: { title: "加载失败", description: "暂时无法获取数据，请重试。" },
  empty: { title: "暂无数据", description: "当前筛选条件下没有可展示内容。" },
  forbidden: { title: "无权访问", description: "当前管理员没有访问此模块的权限。" },
};

const stateIcons = {
  loading: LoaderCircle,
  error: CircleAlert,
  empty: Inbox,
  forbidden: ShieldAlert,
} as const;

export function AdminState({
  kind,
  title,
  description,
  onRetry,
  action,
  children,
}: {
  kind: AdminStateKind;
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = stateIcons[kind];
  const copy = stateCopy[kind];

  return (
    <div
      className={`admin-state admin-state-${kind}`}
      role={kind === "error" ? "alert" : undefined}
    >
      <Icon className={kind === "loading" ? "spin" : undefined} aria-hidden="true" />
      <h2>{title ?? copy.title}</h2>
      <span>{description ?? copy.description}</span>
      {children}
      {onRetry ? (
        <button className="admin-button secondary" type="button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          重试
        </button>
      ) : null}
      {action}
    </div>
  );
}
