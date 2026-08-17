"use client";

import {
  adminAccountStatuses,
  type AdminAccountCreateInput,
  type AdminAccountListResponse,
  type AdminAccountRecord,
  type AdminAccountUpdateInput,
} from "@dream-space/contracts";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi, type AdminAccountFilters } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { notifyAdminSessionChanged, useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const emptyResponse: AdminAccountListResponse = {
  items: [],
  roles: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};

const emptyForm: AdminAccountCreateInput = {
  employeeNo: "",
  displayName: "",
  phone: "",
  roleIds: [],
  reason: "",
};

const statusLabels = {
  invited: "待激活",
  active: "已启用",
  suspended: "已停用",
  revoked: "已撤销",
} as const;

function formatDate(value: string | null) {
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

export function AdminAccounts() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "admin-accounts:write");
  const canRevokeSessions = hasAdminPermission(session, "admin-sessions:revoke");
  const [data, setData] = useState(emptyResponse);
  const [draftFilters, setDraftFilters] = useState<AdminAccountFilters>({ pageSize: 20 });
  const [activeFilters, setActiveFilters] = useState<AdminAccountFilters>({ pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AdminAccountRecord | "create" | null>(null);
  const [form, setForm] = useState<AdminAccountCreateInput>(emptyForm);
  const [action, setAction] = useState<{
    account: AdminAccountRecord;
    kind: "activate" | "suspend" | "revoke" | "sessions";
  } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const handleError = useCallback((requestError: unknown) => {
    if (requestError instanceof AdminApiError && requestError.status === 401) {
      notifyAdminSessionChanged();
    }
    setError((requestError as Error).message);
  }, []);

  const load = useCallback(
    async (filters: AdminAccountFilters) => {
      setLoading(true);
      setError("");
      try {
        setData(await adminApi.adminAccounts(filters));
      } catch (requestError) {
        handleError(requestError);
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  useEffect(() => {
    void load(activeFilters);
  }, [activeFilters, load]);

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setActiveFilters({ ...draftFilters, page: 1, pageSize: 20 });
  };

  const openCreate = () => {
    setForm({ ...emptyForm, roleIds: data.roles[0] ? [data.roles[0].id] : [] });
    setEditing("create");
  };

  const openEdit = (account: AdminAccountRecord) => {
    setForm({
      employeeNo: account.employeeNo,
      displayName: account.displayName,
      phone: "",
      roleIds: account.roles.map((role) => role.id),
      reason: "",
    });
    setEditing(account);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || !editing) return;
    setSaving(true);
    setError("");
    try {
      if (editing === "create") {
        await adminApi.createAdminAccount(form);
      } else {
        const input: AdminAccountUpdateInput = {
          displayName: form.displayName,
          roleIds: form.roleIds,
          reason: form.reason,
          ...(form.phone.trim() ? { phone: form.phone } : {}),
        };
        await adminApi.updateAdminAccount(editing.id, input);
      }
      setEditing(null);
      await load(activeFilters);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;
    setSaving(true);
    setError("");
    try {
      const input = { reason: actionReason };
      if (action.kind === "activate") await adminApi.activateAdminAccount(action.account.id, input);
      if (action.kind === "suspend") await adminApi.suspendAdminAccount(action.account.id, input);
      if (action.kind === "revoke") await adminApi.revokeAdminAccount(action.account.id, input);
      if (action.kind === "sessions") await adminApi.revokeAdminSessions(action.account.id, input);
      setAction(null);
      setActionReason("");
      await load(activeFilters);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setForm((current) => ({
      ...current,
      roleIds: current.roleIds.includes(roleId)
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId],
    }));
  };

  const openAction = (
    account: AdminAccountRecord,
    kind: "activate" | "suspend" | "revoke" | "sessions",
  ) => {
    setActionReason("");
    setAction({ account, kind });
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">基础管理</p>
          <h1>管理员账号</h1>
          <p>管理工号、账号状态、角色分配和登录会话。</p>
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="刷新管理员账号"
            title="刷新"
            disabled={loading}
            onClick={() => void load(activeFilters)}
          >
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {canWrite ? (
            <button className="admin-button primary" type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              新建账号
            </button>
          ) : (
            <span className="admin-readonly-badge">只读权限</span>
          )}
        </div>
      </header>

      <form className="admin-filters admin-account-filters" onSubmit={submitFilters}>
        <label className="admin-search-field">
          <Search aria-hidden="true" />
          <input
            aria-label="搜索管理员"
            placeholder="工号、姓名或手机号"
            value={draftFilters.query ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, query: event.target.value }))
            }
          />
        </label>
        <label>
          <span>账号状态</span>
          <select
            value={draftFilters.status ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="">全部状态</option>
            {adminAccountStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>角色</span>
          <select
            value={draftFilters.roleId ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, roleId: event.target.value }))
            }
          >
            <option value="">全部角色</option>
            {data.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
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
              setActiveFilters(next);
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
        <span>共 {data.total} 个管理员账号</span>
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

      <section className="admin-table-region" aria-busy={loading} aria-label="管理员账号列表">
        <table className="admin-table admin-account-table">
          <thead>
            <tr>
              <th>管理员</th>
              <th>状态</th>
              <th>角色</th>
              <th>有效会话</th>
              <th>最近登录</th>
              <th className="admin-table-action-heading">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((account) => (
              <tr key={account.id}>
                <td>
                  <strong>{account.displayName}</strong>
                  <small>
                    {account.employeeNo} · {account.phoneMasked}
                  </small>
                </td>
                <td>
                  <span className={`admin-status account-${account.status}`}>
                    {statusLabels[account.status]}
                  </span>
                </td>
                <td>{account.roles.map((role) => role.name).join("、") || "-"}</td>
                <td>{account.sessionCount}</td>
                <td>{formatDate(account.lastLoginAt)}</td>
                <td className="admin-table-action-cell admin-account-actions">
                  {canWrite ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      title="编辑"
                      aria-label={`编辑管理员 ${account.displayName}`}
                      onClick={() => openEdit(account)}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                  ) : null}
                  {canWrite && account.status !== "revoked" ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      title={account.status === "active" ? "停用" : "激活"}
                      aria-label={`${account.status === "active" ? "停用" : "激活"}管理员 ${account.displayName}`}
                      onClick={() =>
                        openAction(account, account.status === "active" ? "suspend" : "activate")
                      }
                    >
                      {account.status === "active" ? (
                        <Ban aria-hidden="true" />
                      ) : (
                        <RotateCcw aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                  {canRevokeSessions && account.sessionCount > 0 ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      title="撤销会话"
                      aria-label={`撤销管理员 ${account.displayName} 的全部会话`}
                      onClick={() => openAction(account, "sessions")}
                    >
                      <KeyRound aria-hidden="true" />
                    </button>
                  ) : null}
                  {canWrite && account.status !== "revoked" ? (
                    <button
                      className="admin-icon-button admin-danger-action"
                      type="button"
                      title="撤销账号"
                      aria-label={`撤销管理员 ${account.displayName}`}
                      onClick={() => openAction(account, "revoke")}
                    >
                      <ShieldOff aria-hidden="true" />
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
            title="没有符合条件的管理员账号"
            description="调整筛选条件后重新查询。"
          />
        ) : null}
        {loading && data.items.length === 0 ? (
          <AdminState kind="loading" title="正在加载管理员账号" />
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
            onClick={() => setActiveFilters((current) => ({ ...current, page: data.page - 1 }))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="下一页"
            disabled={loading || data.page >= data.pageCount}
            onClick={() => setActiveFilters((current) => ({ ...current, page: data.page + 1 }))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </footer>

      {editing ? (
        <div className="admin-drawer-backdrop" role="presentation">
          <aside
            className="admin-task-drawer admin-account-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adminAccountEditorTitle"
          >
            <header>
              <div>
                <p>{editing === "create" ? "创建邀请" : "编辑账号"}</p>
                <h2 id="adminAccountEditorTitle">
                  {editing === "create" ? "新管理员" : editing.displayName}
                </h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭账号编辑"
                onClick={() => setEditing(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <form
              className="admin-inspiration-form admin-account-form"
              onSubmit={(event) => void save(event)}
            >
              <div className="admin-form-grid two-columns">
                <label>
                  <span>工号</span>
                  <input
                    value={form.employeeNo}
                    disabled={editing !== "create"}
                    placeholder="例如 ADM0003"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, employeeNo: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>姓名</span>
                  <input
                    value={form.displayName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, displayName: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>{editing === "create" ? "登录手机号" : "新手机号（留空保持不变）"}</span>
                <input
                  value={form.phone}
                  inputMode="numeric"
                  placeholder={editing === "create" ? "11 位手机号" : editing.phoneMasked}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
              <fieldset className="admin-role-fieldset">
                <legend>分配角色</legend>
                {data.roles.map((role) => (
                  <label key={role.id}>
                    <input
                      type="checkbox"
                      checked={form.roleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    <span>{role.name}</span>
                    <small>{role.code}</small>
                  </label>
                ))}
              </fieldset>
              <label>
                <span>操作原因</span>
                <textarea
                  value={form.reason}
                  placeholder="说明创建或修改原因"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reason: event.target.value }))
                  }
                />
              </label>
              <div className="admin-filter-actions admin-editor-actions">
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  取消
                </button>
                <button className="admin-button primary" type="submit" disabled={saving}>
                  {saving ? "保存中..." : editing === "create" ? "创建待激活账号" : "保存修改"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {action ? (
        <div className="admin-drawer-backdrop admin-dialog-backdrop" role="presentation">
          <form
            className="admin-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adminActionTitle"
            onSubmit={(event) => void runAction(event)}
          >
            <h2 id="adminActionTitle">
              {
                {
                  activate: "激活账号",
                  suspend: "停用账号",
                  revoke: "撤销账号",
                  sessions: "撤销全部会话",
                }[action.kind]
              }
            </h2>
            <p>
              {action.account.displayName}（{action.account.employeeNo}）
            </p>
            <label>
              <span>操作原因</span>
              <textarea
                autoFocus
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
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
