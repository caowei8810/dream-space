"use client";

import type {
  AdminPermissionRecord,
  AdminRoleCreateInput,
  AdminRoleListResponse,
  AdminRoleRecord,
  AdminRoleUpdateInput,
} from "@dream-space/contracts";
import { CircleAlert, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { notifyAdminSessionChanged, useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const emptyData: AdminRoleListResponse = { items: [], permissions: [] };

interface RoleFormState {
  code: string;
  name: string;
  description: string;
  active: boolean;
  permissionIds: string[];
  reason: string;
}

function createForm(role?: AdminRoleRecord): RoleFormState {
  return {
    code: role?.code ?? "",
    name: role?.name ?? "",
    description: role?.description ?? "",
    active: role?.active ?? true,
    permissionIds: role?.permissions.map((permission) => permission.id) ?? [],
    reason: "",
  };
}

const riskLabels = { low: "低风险", medium: "中风险", high: "高风险" } as const;

export function AdminRoles() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "roles:write");
  const [data, setData] = useState(emptyData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"create" | "edit" | "delete" | null>(null);
  const [form, setForm] = useState<RoleFormState>(createForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => data.items.find((role) => role.id === selectedId) ?? null,
    [data.items, selectedId],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await adminApi.roles();
      setData(next);
      setSelectedId((current) =>
        current && next.items.some((role) => role.id === current)
          ? current
          : (next.items[0]?.id ?? null),
      );
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401)
        notifyAdminSessionChanged();
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (kind: "create" | "edit" | "delete") => {
    if (kind !== "create" && !selected) return;
    setForm(createForm(kind === "create" ? undefined : (selected ?? undefined)));
    setEditing(kind);
  };

  const togglePermission = (permission: AdminPermissionRecord) => {
    setForm((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permission.id)
        ? current.permissionIds.filter((id) => id !== permission.id)
        : [...current.permissionIds, permission.id],
    }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing === "create") {
        const input: AdminRoleCreateInput = {
          code: form.code,
          name: form.name,
          description: form.description,
          permissionIds: form.permissionIds,
          reason: form.reason,
        };
        const created = await adminApi.createRole(input);
        setSelectedId(created.id);
      } else if (editing === "edit" && selected) {
        const input: AdminRoleUpdateInput = {
          name: form.name,
          description: form.description,
          active: form.active,
          permissionIds: form.permissionIds,
          reason: form.reason,
        };
        await adminApi.updateRole(selected.id, input);
      } else if (editing === "delete" && selected) {
        await adminApi.deleteRole(selected.id, { reason: form.reason });
      }
      setEditing(null);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && data.items.length === 0)
    return (
      <main className="admin-state-page">
        <AdminState kind="loading" title="正在加载角色与权限" />
      </main>
    );
  if (error && data.items.length === 0)
    return (
      <main className="admin-state-page">
        <AdminState
          kind="error"
          title="无法加载角色与权限"
          description={error}
          onRetry={() => void load()}
        />
      </main>
    );

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">系统管理</p>
          <h1>角色与权限</h1>
          <p>角色授权由服务端即时生效；高风险权限和系统负责人角色受保护。</p>
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="刷新角色"
            title="刷新"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {canWrite ? (
            <button className="admin-button primary" type="button" onClick={() => open("create")}>
              <Plus aria-hidden="true" />
              新建角色
            </button>
          ) : (
            <span className="admin-readonly-badge">只读权限</span>
          )}
        </div>
      </header>
      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button className="admin-button secondary" type="button" onClick={() => setError("")}>
            关闭
          </button>
        </section>
      ) : null}
      <section className="admin-role-workspace">
        <div className="admin-role-list" aria-label="角色列表">
          {data.items.map((role) => (
            <button
              className={role.id === selectedId ? "active" : ""}
              type="button"
              key={role.id}
              onClick={() => setSelectedId(role.id)}
            >
              <span>
                <strong>{role.name}</strong>
                <small>{role.code}</small>
              </span>
              <span className={`admin-status ${role.active ? "role-active" : "role-inactive"}`}>
                {role.active ? "启用" : "停用"}
              </span>
            </button>
          ))}
        </div>
        {selected ? (
          <section className="admin-role-detail" aria-label="角色详情">
            <header>
              <div>
                <p className="admin-page-kicker">{selected.system ? "内置角色" : "自定义角色"}</p>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
              {canWrite && selected.code !== "owner" ? (
                <div className="admin-page-header-actions">
                  <button
                    className="admin-icon-button bordered"
                    type="button"
                    title="编辑角色"
                    aria-label="编辑角色"
                    onClick={() => open("edit")}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                  {!selected.system ? (
                    <button
                      className="admin-icon-button bordered admin-danger-action"
                      type="button"
                      title="删除角色"
                      aria-label="删除角色"
                      onClick={() => open("delete")}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </header>
            <div className="admin-role-meta">
              <span>{selected.userCount} 名管理员</span>
              <span>{selected.permissions.length} 个权限点</span>
              <span>{selected.active ? "当前启用" : "当前停用"}</span>
            </div>
            <div className="admin-permission-list">
              {selected.permissions.map((permission) => (
                <article key={permission.id}>
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>{permission.name}</strong>
                    <small>{permission.code}</small>
                  </span>
                  <em className={`risk-${permission.risk}`}>{riskLabels[permission.risk]}</em>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <AdminState kind="empty" title="没有角色" />
        )}
      </section>
      {editing ? (
        <div className="admin-drawer-backdrop admin-dialog-backdrop" role="presentation">
          <form
            className="admin-role-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="roleDialogTitle"
            onSubmit={(event) => void save(event)}
          >
            <header>
              <div>
                <p>
                  {editing === "create"
                    ? "新建自定义角色"
                    : editing === "delete"
                      ? "删除角色"
                      : "编辑角色"}
                </p>
                <h2 id="roleDialogTitle">{editing === "create" ? "角色与权限" : selected?.name}</h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setEditing(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            {editing === "delete" ? (
              <>
                <p>删除后无法恢复。请先确保该角色没有关联管理员账号。</p>
                <label>
                  <span>操作原因</span>
                  <textarea
                    autoFocus
                    value={form.reason}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, reason: event.target.value }))
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <div className="admin-role-form-grid">
                  {editing === "create" ? (
                    <label>
                      <span>角色编码</span>
                      <input
                        autoFocus
                        placeholder="例如 content-operator"
                        value={form.code}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, code: event.target.value }))
                        }
                      />
                    </label>
                  ) : null}
                  <label>
                    <span>角色名称</span>
                    <input
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="full">
                    <span>角色说明</span>
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, description: event.target.value }))
                      }
                    />
                  </label>
                  {editing === "edit" ? (
                    <label className="admin-checkbox-line full">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, active: event.target.checked }))
                        }
                      />
                      <span>启用该角色</span>
                    </label>
                  ) : null}
                </div>
                <fieldset className="admin-role-fieldset">
                  <legend>权限点</legend>
                  {data.permissions.map((permission) => (
                    <label key={permission.id}>
                      <input
                        type="checkbox"
                        checked={form.permissionIds.includes(permission.id)}
                        onChange={() => togglePermission(permission)}
                      />
                      <span>
                        <strong>{permission.name}</strong>
                        <small>
                          {permission.code} · {riskLabels[permission.risk]}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label>
                  <span>操作原因</span>
                  <textarea
                    value={form.reason}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, reason: event.target.value }))
                    }
                  />
                </label>
              </>
            )}
            <footer>
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button className="admin-button primary" type="submit" disabled={saving}>
                {saving ? "正在保存..." : editing === "delete" ? "确认删除" : "保存角色"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
