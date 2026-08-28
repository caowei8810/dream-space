"use client";

import {
  userStatuses,
  type AdminUserListResponse,
  type AdminUserRecord,
} from "@dream-space/contracts";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  KeyRound,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi, type AdminUserFilters } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { notifyAdminSessionChanged, useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const emptyResponse: AdminUserListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};

const statusLabels = {
  active: "正常",
  restricted: "限制生成",
  banned: "已封禁",
  deleted: "已删除",
} as const;

function dateLabel(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function AdminUsers() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "users:write");
  const canRevokeSessions = hasAdminPermission(session, "user-sessions:revoke");
  const [data, setData] = useState(emptyResponse);
  const [filters, setFilters] = useState<AdminUserFilters>({ pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<AdminUserFilters>({ pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<{
    user: AdminUserRecord;
    kind: "restrict" | "ban" | "activate" | "sessions";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleError = useCallback((requestError: unknown) => {
    if (requestError instanceof AdminApiError && requestError.status === 401) {
      notifyAdminSessionChanged();
    }
    setError((requestError as Error).message);
  }, []);

  const load = useCallback(
    async (nextFilters: AdminUserFilters) => {
      setLoading(true);
      setError("");
      try {
        setData(await adminApi.users(nextFilters));
      } catch (requestError) {
        handleError(requestError);
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ ...draftFilters, page: 1, pageSize: 20 });
  };

  const runAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;
    setSaving(true);
    setError("");
    try {
      const input = { reason };
      if (action.kind === "restrict") await adminApi.restrictUser(action.user.id, input);
      if (action.kind === "ban") await adminApi.banUser(action.user.id, input);
      if (action.kind === "activate") await adminApi.activateUser(action.user.id, input);
      if (action.kind === "sessions") await adminApi.revokeUserSessions(action.user.id, input);
      setAction(null);
      setReason("");
      await load(filters);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const openAction = (
    user: AdminUserRecord,
    kind: "restrict" | "ban" | "activate" | "sessions",
  ) => {
    setReason("");
    setAction({ user, kind });
  };

  const actionLabels = {
    restrict: "限制生成",
    ban: "封禁用户",
    activate: "解除处置",
    sessions: "撤销全部会话",
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">业务运营</p>
          <h1>用户管理</h1>
          <p>查看前台注册用户，处理生成限制、封禁和登录会话。</p>
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="刷新用户"
            title="刷新"
            disabled={loading}
            onClick={() => void load(filters)}
          >
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {!canWrite ? <span className="admin-readonly-badge">只读权限</span> : null}
        </div>
      </header>

      <form className="admin-filters admin-user-filters" onSubmit={submitFilters}>
        <label className="admin-search-field">
          <Search aria-hidden="true" />
          <input
            aria-label="搜索用户"
            placeholder="手机号"
            value={draftFilters.query ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, query: event.target.value }))
            }
          />
        </label>
        <label>
          <span>状态</span>
          <select
            aria-label="用户状态"
            value={draftFilters.status ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="">全部状态</option>
            {userStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-filter-actions">
          <button
            className="admin-button secondary"
            type="button"
            onClick={() => {
              const next = { page: 1, pageSize: 20 };
              setDraftFilters(next);
              setFilters(next);
            }}
          >
            重置
          </button>
          <button className="admin-button primary" type="submit">
            查询
          </button>
        </div>
      </form>

      <div className="admin-list-summary">
        <span>共 {data.total} 个注册用户</span>
        {loading ? <span>正在更新...</span> : null}
      </div>
      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button className="admin-button secondary" type="button" onClick={() => setError("")}>
            关闭
          </button>
        </section>
      ) : null}

      <section className="admin-table-region" aria-busy={loading} aria-label="用户列表">
        <table className="admin-table admin-user-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>生成任务</th>
              <th>会话</th>
              <th>参考图</th>
              <th className="admin-table-action-heading">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.phoneMasked}</strong>
                  <small>{user.id}</small>
                </td>
                <td>
                  <span className={`admin-status user-${user.status}`}>
                    {statusLabels[user.status]}
                  </span>
                  {user.statusReason ? <small>{user.statusReason}</small> : null}
                </td>
                <td>{dateLabel(user.createdAt)}</td>
                <td>{user.generationTaskCount}</td>
                <td>{user.activeSessionCount}</td>
                <td>{user.referenceUploadCount}</td>
                <td className="admin-table-action-cell admin-user-actions">
                  {canWrite && user.status === "active" ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      title="限制生成"
                      aria-label={`限制生成用户 ${user.phoneMasked}`}
                      onClick={() => openAction(user, "restrict")}
                    >
                      <ShieldAlert aria-hidden="true" />
                    </button>
                  ) : null}
                  {canWrite && user.status !== "banned" ? (
                    <button
                      className="admin-icon-button admin-danger-action"
                      type="button"
                      title="封禁"
                      aria-label={`封禁用户 ${user.phoneMasked}`}
                      onClick={() => openAction(user, "ban")}
                    >
                      <Ban aria-hidden="true" />
                    </button>
                  ) : null}
                  {canWrite && user.status !== "active" ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      title="解除处置"
                      aria-label={`解除用户处置 ${user.phoneMasked}`}
                      onClick={() => openAction(user, "activate")}
                    >
                      <ShieldCheck aria-hidden="true" />
                    </button>
                  ) : null}
                  {canRevokeSessions && user.activeSessionCount > 0 ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      title="撤销会话"
                      aria-label={`撤销用户会话 ${user.phoneMasked}`}
                      onClick={() => openAction(user, "sessions")}
                    >
                      <KeyRound aria-hidden="true" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.items.length === 0 ? (
          <AdminState
            kind="empty"
            title="没有符合条件的用户"
            description="前台用户注册后会出现在这里。"
          />
        ) : null}
        {loading && data.items.length === 0 ? (
          <AdminState kind="loading" title="正在加载用户" />
        ) : null}
      </section>

      <footer className="admin-pagination">
        <span>
          第 {data.page} / {Math.max(1, data.pageCount)} 页
        </span>
        <div>
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="上一页"
            disabled={loading || data.page <= 1}
            onClick={() => setFilters((current) => ({ ...current, page: data.page - 1 }))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="下一页"
            disabled={loading || data.page >= data.pageCount}
            onClick={() => setFilters((current) => ({ ...current, page: data.page + 1 }))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </footer>

      {action ? (
        <div className="admin-drawer-backdrop admin-dialog-backdrop" role="presentation">
          <form
            className="admin-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="userActionTitle"
            onSubmit={(event) => void runAction(event)}
          >
            <h2 id="userActionTitle">{actionLabels[action.kind]}</h2>
            <p>{action.user.phoneMasked}</p>
            <label>
              <span>操作原因</span>
              <textarea
                aria-label="操作原因"
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="admin-filter-actions">
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => setAction(null)}
              >
                取消
              </button>
              <button className="admin-button primary" type="submit" disabled={saving}>
                {saving ? "处理中..." : "确认"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
