"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  AdminModelCreateInput,
  AdminModelListResponse,
  AdminModelRecord,
  AdminProviderCreateInput,
  AdminProviderRecord,
} from "@dream-space/contracts";
import { adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const empty: AdminModelListResponse = { items: [], total: 0, providers: [] };
const defaultCapabilities = {
  ratios: ["smart", "16:9", "1:1", "9:16"],
  resolutions: ["2K", "4K"],
  maxImageCount: 4,
};

export function AdminModels() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "models:write");
  const canPublish = hasAdminPermission(session, "models:publish");
  const [view, setView] = useState<"providers" | "models">("providers");
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("模型配置运营操作");
  const [showCreate, setShowCreate] = useState(false);
  const [showProviderCreate, setShowProviderCreate] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AdminProviderRecord | null>(null);
  const [routeModel, setRouteModel] = useState<AdminModelRecord | null>(null);
  const [routeProviderId, setRouteProviderId] = useState("");
  const [routeForm, setRouteForm] = useState({
    providerModelId: "",
    enabled: false,
    weight: 100,
    priority: 0,
    reason: "更新模型路由",
  });
  const [versionModel, setVersionModel] = useState<AdminModelRecord | null>(null);
  const [versionConfig, setVersionConfig] = useState('{\n  "temperature": 0.7\n}');
  const [providerForm, setProviderForm] = useState({
    baseUrl: "",
    secretRef: "",
    timeoutMs: 30000,
    retryLimit: 2,
    reason: "更新供应商连接",
    status: "active" as "active" | "disabled",
  });
  const [providerCreateForm, setProviderCreateForm] = useState<AdminProviderCreateInput>({
    code: "",
    name: "",
    baseUrl: "",
    secretRef: "",
    timeoutMs: 30000,
    retryLimit: 2,
    reason: "新增供应商连接",
  });
  const [form, setForm] = useState<AdminModelCreateInput>({
    code: "",
    name: "",
    providerId: "",
    providerModelId: "",
    capabilities: defaultCapabilities,
    reason: "新增模型",
  });
  const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; name: string }>>([]);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const selectedRoute = routeModel?.routes.find((route) => route.providerId === routeProviderId);
  const selectedProvider = data.providers.find((provider) => provider.id === routeProviderId);

  const load = async () => {
    setLoading(true);
    try {
      setData(await adminApi.models());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const run = async (operation: () => Promise<unknown>, fallback: string) => {
    setSaving(true);
    try {
      await operation();
      setError(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setSaving(false);
    }
  };
  const openProvider = (item: AdminProviderRecord) => {
    setEditingProvider(item);
    setProviderForm({
      baseUrl: item.baseUrl ?? "",
      secretRef: "",
      timeoutMs: item.timeoutMs,
      retryLimit: item.retryLimit,
      reason: "更新供应商连接",
      status: item.status === "active" ? "active" : "disabled",
    });
  };
  const openRoute = (model: AdminModelRecord) => {
    const route = model.routes[0];
    if (!route) return;
    setRouteModel(model);
    setRouteProviderId(route.providerId);
    setRouteForm({
      providerModelId: route.providerModelId,
      enabled: route.enabled,
      weight: route.weight,
      priority: route.priority,
      reason: "更新模型路由",
    });
  };
  const saveRoute = async (event: FormEvent) => {
    event.preventDefault();
    if (!routeModel || !routeProviderId) return;
    await run(
      () => adminApi.updateModelRoute(routeModel.id, routeProviderId, routeForm),
      "路由配置保存失败",
    );
    setRouteModel(null);
  };
  const createProvider = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await adminApi.createProvider(providerCreateForm);
      setShowProviderCreate(false);
      setProviderCreateForm((value) => ({
        ...value,
        code: "",
        name: "",
        baseUrl: "",
        secretRef: "",
      }));
    }, "供应商创建失败");
  };
  const saveProvider = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingProvider) return;
    await run(
      () => adminApi.updateProvider(editingProvider.id, providerForm),
      "供应商配置保存失败",
    );
    setEditingProvider(null);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await adminApi.createModel(form);
      setShowCreate(false);
      setForm((value) => ({ ...value, code: "", name: "", providerModelId: "" }));
    }, "创建失败");
  };
  const discoverModels = async () => {
    if (!form.providerId) return;
    setDiscoveringModels(true);
    try { const result = await adminApi.providerModels(form.providerId); setDiscoveredModels(result.items); setError(result.items.length ? null : "供应商没有返回可用模型"); } catch (caught) { setError(caught instanceof Error ? caught.message : "获取模型失败"); } finally { setDiscoveringModels(false); }
  };
  const createVersion = async (event: FormEvent) => {
    event.preventDefault();
    if (!versionModel) return;
    let config: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(versionConfig);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      config = parsed as Record<string, unknown>;
    } catch {
      setError("版本配置必须是有效的 JSON 对象");
      return;
    }
    await run(async () => {
      await adminApi.createModelVersion(versionModel.id, { config, reason: note });
      setVersionModel(null);
    }, "创建版本失败");
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">系统配置</p>
          <h1>模型服务</h1>
          <p>管理供应商连接、凭据引用、模型目录和流量发布。</p>
        </div>
        <button
          className="admin-icon-button bordered"
          type="button"
          aria-label="刷新模型服务"
          title="刷新"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </header>
      <div className="admin-segmented" role="tablist" aria-label="模型服务视图">
        <button
          className={view === "providers" ? "active" : ""}
          role="tab"
          aria-selected={view === "providers"}
          type="button"
          onClick={() => setView("providers")}
        >
          <Server aria-hidden="true" />
          供应商连接
        </button>
        <button
          className={view === "models" ? "active" : ""}
          role="tab"
          aria-selected={view === "models"}
          type="button"
          onClick={() => setView("models")}
        >
          <Settings2 aria-hidden="true" />
          模型目录
        </button>
      </div>
      {error ? (
        <div className="admin-form-error" role="alert">
          {error}
        </div>
      ) : null}
      {view === "providers" ? (
        <>
          <div className="admin-list-toolbar">
            <span>共 {data.providers.length} 个供应商连接</span>
            {canWrite ? (
              <button
                className="admin-button primary"
                type="button"
                onClick={() => setShowProviderCreate((value) => !value)}
              >
                <Plus aria-hidden="true" />
                新增供应商
              </button>
            ) : null}
          </div>
          {showProviderCreate ? (
            <div className="admin-modal-backdrop" role="presentation">
              <section
                className="admin-modal admin-model-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="provider-create-title"
              >
                <header className="admin-modal-header">
                  <div>
                    <p className="admin-page-kicker">供应商连接</p>
                    <h2 id="provider-create-title">新增供应商</h2>
                  </div>
                  <button
                    className="admin-icon-button"
                    type="button"
                    aria-label="关闭"
                    onClick={() => setShowProviderCreate(false)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </header>
                <p className="admin-form-help">
                  连接信息与模型目录独立维护。凭据仅保存引用，保存后不回显原值。
                </p>
                <form className="admin-form-grid two-columns" onSubmit={createProvider}>
                  <label>
                    <span>供应商编码</span>
                    <input
                      required
                      value={providerCreateForm.code}
                      onChange={(event) =>
                        setProviderCreateForm({ ...providerCreateForm, code: event.target.value })
                      }
                      placeholder="openai"
                    />
                  </label>
                  <label>
                    <span>供应商名称</span>
                    <input
                      required
                      value={providerCreateForm.name}
                      onChange={(event) =>
                        setProviderCreateForm({ ...providerCreateForm, name: event.target.value })
                      }
                      placeholder="OpenAI"
                    />
                  </label>
                  <label className="admin-form-full">
                    <span>API 基础地址</span>
                    <input
                      required
                      type="url"
                      value={providerCreateForm.baseUrl}
                      onChange={(event) =>
                        setProviderCreateForm({
                          ...providerCreateForm,
                          baseUrl: event.target.value,
                        })
                      }
                      placeholder="https://api.example.com/v1"
                    />
                  </label>
                  <label className="admin-form-full">
                    <span>Secret 引用</span>
                    <input
                      required
                      value={providerCreateForm.secretRef ?? ""}
                      onChange={(event) =>
                        setProviderCreateForm({
                          ...providerCreateForm,
                          secretRef: event.target.value,
                        })
                      }
                      placeholder="env://PROVIDER_API_KEY"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    <span>超时（毫秒）</span>
                    <input
                      type="number"
                      min="1000"
                      max="120000"
                      value={providerCreateForm.timeoutMs}
                      onChange={(event) =>
                        setProviderCreateForm({
                          ...providerCreateForm,
                          timeoutMs: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>失败重试次数</span>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={providerCreateForm.retryLimit}
                      onChange={(event) =>
                        setProviderCreateForm({
                          ...providerCreateForm,
                          retryLimit: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="admin-form-full">
                    <span>操作原因</span>
                    <input
                      required
                      value={providerCreateForm.reason}
                      onChange={(event) =>
                        setProviderCreateForm({ ...providerCreateForm, reason: event.target.value })
                      }
                    />
                  </label>
                  <div className="admin-modal-actions">
                    <button
                      className="admin-button secondary"
                      type="button"
                      onClick={() => setShowProviderCreate(false)}
                    >
                      取消
                    </button>
                    <button className="admin-button primary" type="submit" disabled={saving}>
                      创建并启用
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}
          <section className="admin-provider-grid" aria-busy={loading}>
            {loading ? (
              <AdminState kind="loading" title="正在加载供应商连接" />
            ) : !data.providers.length ? (
              <AdminState
                kind="empty"
                title="暂无供应商连接"
                description={
                  canWrite ? "新增供应商并完成连接检查后，才能创建可用模型。" : undefined
                }
              />
            ) : (
              data.providers.map((item) => (
                <article className="admin-provider-card" key={item.id}>
                  <div className="admin-provider-heading">
                    <span className="admin-provider-icon">
                      <Server aria-hidden="true" />
                    </span>
                    <div>
                      <h2>{item.name}</h2>
                      <small>{item.code}</small>
                    </div>
                    <span
                      className={`admin-status ${item.status === "active" ? "user-active" : ""}`}
                    >
                      {item.code === "mock"
                        ? "本地模拟"
                        : item.status === "active"
                          ? "已启用"
                          : item.status === "disabled"
                            ? "已停用"
                            : "待配置"}
                    </span>
                  </div>
                  <dl className="admin-provider-details">
                    <div>
                      <dt>API 地址</dt>
                      <dd>{item.baseUrl ?? "未配置"}</dd>
                    </div>
                    <div>
                      <dt>凭据</dt>
                      <dd>
                        <KeyRound aria-hidden="true" />
                        {item.hasSecretRef
                          ? "已绑定 Secret"
                          : item.code === "mock"
                            ? "无需凭据"
                            : "未配置"}
                      </dd>
                    </div>
                    <div>
                      <dt>连接检查</dt>
                      <dd>
                        <span
                          className={`admin-status ${item.health === "healthy" ? "user-active" : ""}`}
                        >
                          {item.health === "healthy"
                            ? "健康"
                            : item.health === "unhealthy"
                              ? "异常"
                              : "未检查"}
                        </span>
                        {item.lastCheckedAt
                          ? ` · ${new Date(item.lastCheckedAt).toLocaleString("zh-CN")}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>请求策略</dt>
                      <dd>
                        {item.timeoutMs / 1000}s 超时 · 最多重试 {item.retryLimit} 次
                      </dd>
                    </div>
                    <div>
                      <dt>模型数量</dt>
                      <dd>{item.modelCount}</dd>
                    </div>
                  </dl>
                  {canWrite ? (
                    <div className="admin-inline-actions">
                      {item.code !== "mock" ? (
                        <button
                          className="admin-button secondary"
                          type="button"
                          onClick={() => openProvider(item)}
                        >
                          <Settings2 aria-hidden="true" />
                          配置连接
                        </button>
                      ) : null}
                      <button
                        className="admin-button secondary"
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void run(
                            () => adminApi.checkProviderHealth(item.id, "检查供应商连接"),
                            "连接检查失败",
                          )
                        }
                      >
                        <RefreshCw className={saving ? "spin" : ""} aria-hidden="true" />
                        检查连接
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </>
      ) : null}
      {editingProvider ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal admin-model-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-edit-title"
          >
            <header className="admin-modal-header">
              <div>
                <p className="admin-page-kicker">供应商连接</p>
                <h2 id="provider-edit-title">配置 {editingProvider.name}</h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setEditingProvider(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <form className="admin-form-grid two-columns" onSubmit={saveProvider}>
              <div className="admin-form-full">
                <p className="admin-form-help">
                  凭据填写服务端环境变量引用，例如 env://OPENAI_API_KEY。保存后不会回显原值；
                  当前仅支持 env:// 引用。
                </p>
              </div>
              <label className="admin-form-full">
                <span>API 基础地址</span>
                <input
                  required
                  type="url"
                  value={providerForm.baseUrl}
                  onChange={(event) =>
                    setProviderForm({ ...providerForm, baseUrl: event.target.value })
                  }
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label className="admin-form-full">
                <span>Secret 引用</span>
                <input
                  value={providerForm.secretRef}
                  onChange={(event) =>
                    setProviderForm({ ...providerForm, secretRef: event.target.value })
                  }
                  placeholder={
                    editingProvider.hasSecretRef ? "已配置，留空保持不变" : "env://PROVIDER_API_KEY"
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                <span>超时（毫秒）</span>
                <input
                  type="number"
                  min="1000"
                  max="120000"
                  value={providerForm.timeoutMs}
                  onChange={(event) =>
                    setProviderForm({ ...providerForm, timeoutMs: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>失败重试次数</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={providerForm.retryLimit}
                  onChange={(event) =>
                    setProviderForm({ ...providerForm, retryLimit: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>连接状态</span>
                <select
                  value={providerForm.status}
                  onChange={(event) =>
                    setProviderForm({
                      ...providerForm,
                      status: event.target.value as "active" | "disabled",
                    })
                  }
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </label>
              <label className="admin-form-full">
                <span>操作原因</span>
                <input
                  required
                  value={providerForm.reason}
                  onChange={(event) =>
                    setProviderForm({ ...providerForm, reason: event.target.value })
                  }
                />
              </label>
              <div className="admin-modal-actions">
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setEditingProvider(null)}
                >
                  取消
                </button>
                <button className="admin-button primary" type="submit" disabled={saving}>
                  保存连接
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {view === "models" ? (
        <>
          <div className="admin-list-toolbar">
            <span>共 {data.total} 个模型</span>
            {canWrite ? (
              <button
                className="admin-button primary"
                type="button"
                onClick={() => setShowCreate((value) => !value)}
              >
                <Plus aria-hidden="true" />
                新增模型
              </button>
            ) : null}
          </div>
          {showCreate ? (
            <div className="admin-modal-backdrop" role="presentation">
              <section
                className="admin-modal admin-model-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="model-create-title"
              >
                <header className="admin-modal-header">
                  <div>
                    <p className="admin-page-kicker">模型目录</p>
                    <h2 id="model-create-title">新增模型</h2>
                  </div>
                  <button
                    className="admin-icon-button"
                    type="button"
                    aria-label="关闭"
                    onClick={() => setShowCreate(false)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </header>
                <form className="admin-form-grid two-columns" onSubmit={create}>
                  <label>
                    <span>模型编码</span>
                    <input
                      required
                      value={form.code}
                      onChange={(event) => setForm({ ...form, code: event.target.value })}
                      placeholder="image-model"
                    />
                  </label>
                  <label>
                    <span>显示名称</span>
                    <input
                      required
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>供应商模型 ID</span>
                    <input
                      required
                      value={form.providerModelId}
                      onChange={(event) =>
                        setForm({ ...form, providerModelId: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>供应商连接</span>
                    <select
                      required
                      value={form.providerId}
                      onChange={(event) => {
                        setForm({
                          ...form,
                          providerId: event.target.value,
                        });
                        setDiscoveredModels([]);
                      }}
                    >
                      <option value="">请选择已配置供应商</option>
                      {data.providers
                        .filter((item) => item.status === "active")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="admin-form-full admin-model-discovery">
                    <button className="admin-button secondary" type="button" disabled={!form.providerId || discoveringModels} onClick={() => void discoverModels()}><RefreshCw className={discoveringModels ? "spin" : ""} aria-hidden="true" />{discoveringModels ? "获取中..." : "从供应商获取模型"}</button>
                    {discoveredModels.length ? <select value={form.providerModelId} onChange={(event) => setForm({ ...form, providerModelId: event.target.value })}><option value="">从列表选择模型</option>{discoveredModels.map((model) => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}</select> : <small className="admin-form-help">选择供应商后获取模型列表，也可以直接填写模型 ID。</small>}
                  </div>
                  <label>
                    <span>单次最大张数</span>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={form.capabilities.maxImageCount}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          capabilities: {
                            ...form.capabilities,
                            maxImageCount: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>操作原因</span>
                    <input
                      required
                      value={form.reason}
                      onChange={(event) => setForm({ ...form, reason: event.target.value })}
                    />
                  </label>
                  <div className="admin-modal-actions">
                    <button
                      className="admin-button secondary"
                      type="button"
                      onClick={() => setShowCreate(false)}
                    >
                      取消
                    </button>
                    <button className="admin-button primary" type="submit" disabled={saving}>
                      保存草稿
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}
          <section className="admin-form-strip">
            <label>
              <span>发布操作原因</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </section>
          {versionModel ? (
            <div className="admin-modal-backdrop" role="presentation">
              <section
                className="admin-modal admin-model-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="model-version-title"
              >
                <header className="admin-modal-header">
                  <div>
                    <p className="admin-page-kicker">推理参数</p>
                    <h2 id="model-version-title">{versionModel.name}</h2>
                  </div>
                  <button
                    className="admin-icon-button"
                    type="button"
                    aria-label="关闭"
                    onClick={() => setVersionModel(null)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </header>
                <form className="admin-form-grid" onSubmit={createVersion}>
                  <label className="admin-form-full">
                    <span>{versionModel.name} 推理参数（JSON）</span>
                    <textarea
                      rows={7}
                      value={versionConfig}
                      onChange={(event) => setVersionConfig(event.target.value)}
                    />
                  </label>
                  <div className="admin-modal-actions">
                    <button
                      className="admin-button secondary"
                      type="button"
                      onClick={() => setVersionModel(null)}
                    >
                      取消
                    </button>
                    <button className="admin-button primary" type="submit" disabled={saving}>
                      创建版本
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}
          <section className="admin-table-region">
            {loading ? (
              <AdminState kind="loading" title="正在加载模型目录" />
            ) : !data.items.length ? (
              <AdminState
                kind="empty"
                title="暂无模型"
                description={canWrite ? "先新增模型，再配置路由和参数版本。" : undefined}
              />
            ) : (
              <table className="admin-table admin-model-table">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>供应商路由</th>
                    <th>状态</th>
                    <th>能力</th>
                    <th>路由</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.code}</small>
                      </td>
                      <td>
                        {item.routes.length} 条路由
                        <small>
                          {item.routes
                            .map((route) => `${route.providerCode}: ${route.providerModelId}`)
                            .join(" · ")}
                        </small>
                      </td>
                      <td>
                        {item.status === "published" ? "已发布" : "草稿"}
                        <small>线上 v{item.currentVersion ?? "-"}</small>
                      </td>
                      <td>
                        {item.capabilities.resolutions.join(" / ")}
                        <small>最多 {item.capabilities.maxImageCount} 张</small>
                      </td>
                      <td>{item.routeHealth === "healthy" ? "健康" : "待检查"}</td>
                      <td>
                        <div className="admin-inline-actions">
                          {canWrite ? (
                            <button
                              className="admin-icon-button bordered"
                              title="新建参数版本"
                              aria-label={`为 ${item.name} 新建参数版本`}
                              type="button"
                              onClick={() => setVersionModel(item)}
                            >
                              <Plus aria-hidden="true" />
                            </button>
                          ) : null}
                          {canWrite ? (
                            <button
                              className="admin-icon-button bordered"
                              title="路由设置"
                              aria-label={`设置 ${item.name} 路由`}
                              type="button"
                              onClick={() => openRoute(item)}
                            >
                              <SlidersHorizontal aria-hidden="true" />
                            </button>
                          ) : null}
                          {canPublish &&
                          item.latestVersion &&
                          item.latestVersion !== item.currentVersion ? (
                            <button
                              className="admin-icon-button bordered"
                              title="发布"
                              aria-label={`发布 ${item.name}`}
                              type="button"
                              onClick={() =>
                                void run(
                                  () => adminApi.publishModel(item.id, item.latestVersion!, note),
                                  "发布失败",
                                )
                              }
                            >
                              <ShieldCheck aria-hidden="true" />
                            </button>
                          ) : null}
                          {canPublish && item.currentVersion && item.currentVersion > 1 ? (
                            <button
                              className="admin-icon-button bordered"
                              title="回滚"
                              aria-label={`回滚 ${item.name}`}
                              type="button"
                              onClick={() =>
                                void run(() => adminApi.rollbackModel(item.id, note), "回滚失败")
                              }
                            >
                              <RotateCcw aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
      {routeModel ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal admin-model-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-route-title"
          >
            <header className="admin-modal-header">
              <div>
                <p className="admin-page-kicker">路由与健康</p>
                <h2 id="model-route-title">{routeModel.name}</h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setRouteModel(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <p className="admin-form-help">
              启用路由前必须先在供应商连接页完成检查。权重用于同优先级路由的流量分配，优先级数值越小越优先。
            </p>
            <form className="admin-form-grid two-columns" onSubmit={saveRoute}>
              <label className="admin-form-full">
                <span>供应商</span>
                <select
                  value={routeProviderId}
                  onChange={(event) => {
                    const providerId = event.target.value;
                    const route = routeModel.routes.find((item) => item.providerId === providerId);
                    setRouteProviderId(providerId);
                    if (route) {
                      setRouteForm((current) => ({
                        ...current,
                        providerModelId: route.providerModelId,
                        enabled: route.enabled,
                        weight: route.weight,
                        priority: route.priority,
                      }));
                    } else {
                      setRouteForm((current) => ({
                        ...current,
                        providerModelId: "",
                        enabled: false,
                        weight: 100,
                        priority: 0,
                      }));
                    }
                  }}
                >
                  {data.providers
                    .filter((provider) => provider.status === "active")
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="admin-form-full">
                <span>供应商模型 ID</span>
                <input
                  required
                  value={routeForm.providerModelId}
                  onChange={(event) =>
                    setRouteForm({ ...routeForm, providerModelId: event.target.value })
                  }
                  placeholder="例如 gpt-image-1"
                />
              </label>
              <div className="admin-form-help admin-form-full">
                当前连接状态：
                {(selectedRoute?.health ?? selectedProvider?.health) === "healthy"
                  ? "健康"
                  : (selectedRoute?.health ?? selectedProvider?.health) === "unhealthy"
                    ? "异常"
                    : "未检查"}
                。健康状态由服务端请求 OpenAI 兼容的 /models 接口确定，不能手工修改。
              </div>
              <label className="admin-checkbox-field">
                <input
                  type="checkbox"
                  checked={routeForm.enabled}
                  disabled={(selectedRoute?.health ?? selectedProvider?.health) !== "healthy"}
                  onChange={(event) =>
                    setRouteForm({ ...routeForm, enabled: event.target.checked })
                  }
                />
                <span>启用路由</span>
              </label>
              <label>
                <span>流量权重</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={routeForm.weight}
                  onChange={(event) =>
                    setRouteForm({ ...routeForm, weight: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>优先级</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={routeForm.priority}
                  onChange={(event) =>
                    setRouteForm({ ...routeForm, priority: Number(event.target.value) })
                  }
                />
              </label>
              <label className="admin-form-full">
                <span>操作原因</span>
                <input
                  required
                  value={routeForm.reason}
                  onChange={(event) => setRouteForm({ ...routeForm, reason: event.target.value })}
                />
              </label>
              <div className="admin-modal-actions">
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setRouteModel(null)}
                >
                  取消
                </button>
                <button className="admin-button primary" type="submit" disabled={saving}>
                  保存路由
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
