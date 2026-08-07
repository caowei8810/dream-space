"use client";

import {
  adminInspirationSourceTypes,
  adminInspirationStatuses,
  inspirationCategories,
  type AdminInspirationInput,
  type AdminInspirationListResponse,
  type AdminInspirationRecord,
} from "@dream-space/contracts";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminApi,
  type AdminInspirationFilters,
  resolveAdminAssetUrl,
} from "../lib/admin-api";
import { notifyAdminSessionChanged, useAdminSession } from "../lib/use-admin-session";

const emptyResponse: AdminInspirationListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};

const emptyDraft: AdminInspirationInput = {
  slug: "",
  title: "",
  prompt: "",
  category: "portrait",
  imageUrl: "/inspiration/portrait-01.webp",
  thumbnailUrl: "/inspiration/portrait-01.webp",
  width: 1350,
  height: 2400,
  modelName: "image-4.7",
  ratio: "9:16",
  resolutionLabel: "1350 × 2400",
  authorDisplayName: "运营精选",
  sourceType: "internal",
  sourceName: "造梦空间",
  sourceUrl: null,
  licenseBasis: "内部生成素材",
  isAiGenerated: true,
  likeCount: 0,
  sortOrder: 0,
};

const statusLabels = {
  draft: "草稿",
  published: "已发布",
  archived: "已下架",
} as const;

const sourceLabels = {
  ai_public_gallery: "AI 公开灵感",
  licensed: "授权素材",
  internal: "内部素材",
} as const;

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function toDraft(item: AdminInspirationRecord): AdminInspirationInput {
  return {
    slug: item.slug,
    title: item.title,
    prompt: item.prompt,
    category: item.category,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    width: item.width,
    height: item.height,
    modelName: item.modelName,
    ratio: item.ratio,
    resolutionLabel: item.resolutionLabel,
    authorDisplayName: item.authorDisplayName,
    sourceType: item.sourceType,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    licenseBasis: item.licenseBasis,
    isAiGenerated: item.isAiGenerated,
    likeCount: item.likeCount,
    sortOrder: item.sortOrder,
  };
}

export function AdminInspirations() {
  const { session } = useAdminSession();
  const canWrite =
    session?.authenticated === true && session.user.permissions.includes("inspirations:write");
  const [data, setData] = useState(emptyResponse);
  const [draftFilters, setDraftFilters] = useState<AdminInspirationFilters>({ pageSize: 20 });
  const [activeFilters, setActiveFilters] = useState<AdminInspirationFilters>({ pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AdminInspirationRecord | "create" | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AdminInspirationInput>(emptyDraft);

  const handleError = useCallback((requestError: unknown) => {
    if (requestError instanceof AdminApiError && requestError.status === 401) {
      notifyAdminSessionChanged();
    }
    setError((requestError as Error).message);
  }, []);

  const load = useCallback(
    async (filters: AdminInspirationFilters) => {
      setLoading(true);
      setError("");
      try {
        setData(await adminApi.inspirations(filters));
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

  const resetFilters = () => {
    const next = { page: 1, pageSize: 20 };
    setDraftFilters(next);
    setActiveFilters(next);
  };

  const openCreate = () => {
    setError("");
    setForm({ ...emptyDraft });
    setEditing("create");
  };

  const openEditor = async (id: string) => {
    setEditorLoading(true);
    setError("");
    try {
      const item = await adminApi.inspiration(id);
      setForm(toDraft(item));
      setEditing(item);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setEditorLoading(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || !editing) return;
    setSaving(true);
    setError("");
    try {
      if (editing === "create") await adminApi.createInspiration(form);
      else await adminApi.updateInspiration(editing.id, form);
      setEditing(null);
      await load(activeFilters);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item: AdminInspirationRecord) => {
    if (!canWrite) return;
    setSaving(true);
    setError("");
    try {
      if (item.status === "published") await adminApi.unpublishInspiration(item.id);
      else await adminApi.publishInspiration(item.id);
      await load(activeFilters);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const changePage = (page: number) => {
    if (page < 1 || page > Math.max(1, data.pageCount)) return;
    setActiveFilters((current) => ({ ...current, page }));
  };

  const numeric = (field: "width" | "height" | "likeCount" | "sortOrder", value: string) => {
    setForm((current) => ({ ...current, [field]: Number(value) }));
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">内容运营</p>
          <h1>灵感管理</h1>
          <p>维护灵感素材、来源授权与公开发布状态。</p>
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="刷新灵感"
            title="刷新灵感"
            disabled={loading}
            onClick={() => void load(activeFilters)}
          >
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {canWrite ? (
            <button className="admin-button primary" type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              新建灵感
            </button>
          ) : (
            <span className="admin-readonly-badge">只读权限</span>
          )}
        </div>
      </header>

      <form className="admin-filters admin-inspiration-filters" onSubmit={submitFilters}>
        <label className="admin-search-field">
          <Search aria-hidden="true" />
          <input
            aria-label="搜索灵感"
            placeholder="标题、slug、提示词或来源"
            value={draftFilters.query ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, query: event.target.value }))
            }
          />
        </label>
        <label>
          <span>状态</span>
          <select
            value={draftFilters.status ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="">全部状态</option>
            {adminInspirationStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>分类</span>
          <select
            value={draftFilters.category ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, category: event.target.value }))
            }
          >
            <option value="">全部分类</option>
            {inspirationCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.labelZh}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-filter-actions">
          <button className="admin-button secondary" type="button" onClick={resetFilters}>
            重置
          </button>
          <button className="admin-button primary" type="submit">
            查询
          </button>
        </div>
      </form>

      <div className="admin-list-summary">
        <span>共 {data.total} 条灵感</span>
        {loading ? <span>正在更新…</span> : null}
      </div>

      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button
            className="admin-button secondary"
            type="button"
            onClick={() => void load(activeFilters)}
          >
            重试
          </button>
        </section>
      ) : null}

      <section className="admin-table-region" aria-busy={loading} aria-label="灵感列表">
        <table className="admin-table admin-inspiration-table">
          <thead>
            <tr>
              <th>灵感</th>
              <th>分类</th>
              <th>状态</th>
              <th>来源</th>
              <th>排序</th>
              <th>更新时间</th>
              <th className="admin-table-action-heading">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="admin-inspiration-identity">
                    <img src={resolveAdminAssetUrl(item.thumbnailUrl)} alt="" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.slug}</small>
                    </span>
                  </div>
                </td>
                <td>
                  {inspirationCategories.find((category) => category.id === item.category)?.labelZh}
                </td>
                <td>
                  <span className={`admin-status inspiration-${item.status}`}>
                    {statusLabels[item.status]}
                  </span>
                </td>
                <td>
                  <span>{sourceLabels[item.sourceType]}</span>
                  <small>{item.sourceName}</small>
                </td>
                <td>{item.sortOrder}</td>
                <td>{formatDate(item.updatedAt)}</td>
                <td className="admin-table-action-cell">
                  <button
                    className="admin-icon-button"
                    type="button"
                    aria-label={`${canWrite ? "编辑" : "查看"}灵感 ${item.title}`}
                    title={canWrite ? "编辑" : "查看"}
                    disabled={editorLoading}
                    onClick={() => void openEditor(item.id)}
                  >
                    {canWrite ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                  {canWrite ? (
                    <button
                      className="admin-icon-button"
                      type="button"
                      aria-label={`${item.status === "published" ? "下架" : "发布"}灵感 ${item.title}`}
                      title={item.status === "published" ? "下架" : "发布"}
                      disabled={saving}
                      onClick={() => void changeStatus(item)}
                    >
                      {item.status === "published" ? (
                        <Archive aria-hidden="true" />
                      ) : (
                        <Upload aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.items.length === 0 ? (
          <div className="admin-empty-state">
            <Search aria-hidden="true" />
            <strong>没有符合条件的灵感</strong>
            <span>调整筛选条件后重新查询。</span>
          </div>
        ) : null}
        {loading && data.items.length === 0 ? (
          <div className="admin-empty-state">
            <LoaderCircle className="spin" aria-hidden="true" />
            <strong>正在加载灵感</strong>
          </div>
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
            onClick={() => changePage(data.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            className="admin-icon-button bordered"
            type="button"
            aria-label="下一页"
            disabled={loading || data.page >= data.pageCount}
            onClick={() => changePage(data.page + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </footer>

      {editing ? (
        <div className="admin-drawer-backdrop" role="presentation">
          <aside
            className="admin-task-drawer admin-inspiration-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspirationEditorTitle"
          >
            <header>
              <div>
                <p>{editing === "create" ? "新建草稿" : canWrite ? "编辑灵感" : "查看灵感"}</p>
                <h2 id="inspirationEditorTitle">
                  {editing === "create" ? "新灵感" : editing.title}
                </h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭灵感编辑"
                onClick={() => setEditing(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <form className="admin-inspiration-form" onSubmit={(event) => void save(event)}>
              <div className="admin-inspiration-preview">
                <img src={resolveAdminAssetUrl(form.imageUrl)} alt="灵感预览" />
                {editing !== "create" ? (
                  <span className={`admin-status inspiration-${editing.status}`}>
                    {statusLabels[editing.status]}
                  </span>
                ) : null}
              </div>
              <div className="admin-form-grid two-columns">
                <label>
                  <span>标题</span>
                  <input
                    value={form.title}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Slug</span>
                  <input
                    value={form.slug}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, slug: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>分类</span>
                  <select
                    value={form.category}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value as AdminInspirationInput["category"],
                      }))
                    }
                  >
                    {inspirationCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.labelZh}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>模型</span>
                  <input
                    value={form.modelName}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, modelName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>原图地址</span>
                  <input
                    value={form.imageUrl}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, imageUrl: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>缩略图地址</span>
                  <input
                    value={form.thumbnailUrl}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, thumbnailUrl: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>宽度</span>
                  <input
                    type="number"
                    min="1"
                    value={form.width}
                    disabled={!canWrite}
                    onChange={(event) => numeric("width", event.target.value)}
                  />
                </label>
                <label>
                  <span>高度</span>
                  <input
                    type="number"
                    min="1"
                    value={form.height}
                    disabled={!canWrite}
                    onChange={(event) => numeric("height", event.target.value)}
                  />
                </label>
                <label>
                  <span>比例</span>
                  <input
                    value={form.ratio}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, ratio: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>分辨率</span>
                  <input
                    value={form.resolutionLabel}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, resolutionLabel: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>提示词</span>
                <textarea
                  value={form.prompt}
                  disabled={!canWrite}
                  rows={5}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, prompt: event.target.value }))
                  }
                />
              </label>
              <div className="admin-form-grid two-columns">
                <label>
                  <span>作者名称</span>
                  <input
                    value={form.authorDisplayName}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, authorDisplayName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>来源类型</span>
                  <select
                    value={form.sourceType}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sourceType: event.target.value as AdminInspirationInput["sourceType"],
                      }))
                    }
                  >
                    {adminInspirationSourceTypes.map((sourceType) => (
                      <option key={sourceType} value={sourceType}>
                        {sourceLabels[sourceType]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>来源名称</span>
                  <input
                    value={form.sourceName}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, sourceName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>来源链接</span>
                  <input
                    value={form.sourceUrl ?? ""}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, sourceUrl: event.target.value || null }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>授权依据</span>
                <textarea
                  value={form.licenseBasis}
                  disabled={!canWrite}
                  rows={3}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, licenseBasis: event.target.value }))
                  }
                />
              </label>
              <div className="admin-form-grid three-columns">
                <label>
                  <span>点赞数</span>
                  <input
                    type="number"
                    min="0"
                    value={form.likeCount}
                    disabled={!canWrite}
                    onChange={(event) => numeric("likeCount", event.target.value)}
                  />
                </label>
                <label>
                  <span>排序值</span>
                  <input
                    type="number"
                    min="0"
                    value={form.sortOrder}
                    disabled={!canWrite}
                    onChange={(event) => numeric("sortOrder", event.target.value)}
                  />
                </label>
                <label className="admin-checkbox-field">
                  <input
                    type="checkbox"
                    checked={form.isAiGenerated}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, isAiGenerated: event.target.checked }))
                    }
                  />
                  <span>AI 生成内容</span>
                </label>
              </div>
              {canWrite ? (
                <footer className="admin-editor-actions">
                  <button
                    className="admin-button secondary"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    取消
                  </button>
                  <button className="admin-button primary" type="submit" disabled={saving}>
                    {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
                    保存草稿
                  </button>
                </footer>
              ) : null}
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
