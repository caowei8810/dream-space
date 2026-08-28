"use client";

import {
  inspirationCategories,
  type AdminInspirationCandidateListResponse,
  type AdminInspirationCandidateRecord,
  type AdminInspirationListResponse,
} from "@dream-space/contracts";
import { Archive, CircleAlert, Eye, ImageOff, RefreshCw, Search, Upload } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminApi,
  type AdminInspirationFilters,
  resolveAdminAssetUrl,
} from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { notifyAdminSessionChanged, useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

type View = "candidates" | "published";

const emptyCandidates: AdminInspirationCandidateListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};
const emptyPublished: AdminInspirationListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function categoryLabel(value: string) {
  return inspirationCategories.find((category) => category.id === value)?.labelZh ?? value;
}

function CurationImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="admin-curation-image-fallback" role="img" aria-label={`${alt}暂不可用`}>
        <ImageOff aria-hidden="true" />
        <span>图片暂不可用</span>
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function AdminInspirations() {
  const { session } = useAdminSession();
  const canPublish = hasAdminPermission(session, "inspirations:publish");
  const [view, setView] = useState<View>("candidates");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [candidates, setCandidates] = useState(emptyCandidates);
  const [published, setPublished] = useState(emptyPublished);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleError = useCallback((requestError: unknown) => {
    if (requestError instanceof AdminApiError && requestError.status === 401)
      notifyAdminSessionChanged();
    setError((requestError as Error).message);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filters: AdminInspirationFilters = { query: activeQuery, page: 1, pageSize: 20 };
      const [candidateResponse, publishedResponse] = await Promise.all([
        adminApi.inspirationCandidates(filters),
        adminApi.inspirations({ status: "published", query: activeQuery, page: 1, pageSize: 20 }),
      ]);
      setCandidates(candidateResponse);
      setPublished(publishedResponse);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setLoading(false);
    }
  }, [activeQuery, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setActiveQuery(query.trim());
  };

  const publish = async (candidate: AdminInspirationCandidateRecord) => {
    if (!canPublish) return;
    setSaving(true);
    setError("");
    try {
      await adminApi.publishCandidate(candidate.resultId);
      await load();
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const unpublish = async (id: string) => {
    if (!canPublish) return;
    setSaving(true);
    setError("");
    try {
      await adminApi.unpublishInspiration(id);
      await load();
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-page admin-inspiration-curation-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">内容运营</p>
          <h1>灵感精选</h1>
          <p>从用户生成且审核通过的图片中挑选优秀作品，发布到用户端灵感页。</p>
        </div>
        <button
          className="admin-icon-button bordered"
          type="button"
          aria-label="刷新灵感候选"
          title="刷新"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
        </button>
      </header>

      <div className="admin-curation-tabs" role="tablist" aria-label="灵感精选视图">
        <button
          className={view === "candidates" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={view === "candidates"}
          onClick={() => setView("candidates")}
        >
          待精选 <span>{candidates.total}</span>
        </button>
        <button
          className={view === "published" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={view === "published"}
          onClick={() => setView("published")}
        >
          已发布 <span>{published.total}</span>
        </button>
      </div>

      <form className="admin-filters admin-curation-filters" onSubmit={submitSearch}>
        <label className="admin-search-field">
          <Search aria-hidden="true" />
          <input
            aria-label="搜索用户生成图片"
            placeholder="搜索提示词、模型或用户"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="admin-filter-actions">
          <button
            className="admin-button secondary"
            type="button"
            onClick={() => {
              setQuery("");
              setActiveQuery("");
            }}
          >
            重置
          </button>
          <button className="admin-button primary" type="submit">
            查询
          </button>
        </div>
      </form>

      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button className="admin-button secondary" type="button" onClick={() => void load()}>
            重试
          </button>
        </section>
      ) : null}

      {loading &&
      (view === "candidates" ? candidates.items.length === 0 : published.items.length === 0) ? (
        <AdminState kind="loading" title="正在加载灵感精选" />
      ) : view === "candidates" ? (
        <section className="admin-curation-grid" aria-label="用户生成图片候选">
          {candidates.items.map((candidate) => (
            <article className="admin-curation-card" key={candidate.resultId}>
              <div className="admin-curation-image-wrap">
                <CurationImage
                  src={resolveAdminAssetUrl(candidate.thumbnailUrl)}
                  alt="用户生成候选"
                />
                <span className="admin-curation-badge">审核通过</span>
              </div>
              <div className="admin-curation-card-body">
                <p>{candidate.prompt}</p>
                <dl>
                  <div>
                    <dt>模型</dt>
                    <dd>{candidate.modelName}</dd>
                  </div>
                  <div>
                    <dt>用户</dt>
                    <dd>{candidate.userPhoneMasked}</dd>
                  </div>
                  <div>
                    <dt>生成</dt>
                    <dd>{formatDate(candidate.createdAt)}</dd>
                  </div>
                </dl>
                <div className="admin-curation-card-actions">
                  <a
                    className="admin-icon-button"
                    href={resolveAdminAssetUrl(candidate.imageUrl)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="查看原图"
                    title="查看原图"
                  >
                    <Eye aria-hidden="true" />
                  </a>
                  {canPublish ? (
                    <button
                      className="admin-button primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void publish(candidate)}
                    >
                      <Upload aria-hidden="true" />
                      发布灵感
                    </button>
                  ) : (
                    <span className="admin-readonly-badge">只读权限</span>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!candidates.items.length ? (
            <AdminState
              kind="empty"
              title="暂无可精选图片"
              description="只有生成成功且输入、输出审核通过的用户图片会出现在这里。"
            />
          ) : null}
        </section>
      ) : (
        <section className="admin-curation-grid" aria-label="已发布灵感">
          {published.items.map((item) => (
            <article className="admin-curation-card" key={item.id}>
              <div className="admin-curation-image-wrap">
                <CurationImage src={resolveAdminAssetUrl(item.thumbnailUrl)} alt={item.title} />
                <span className="admin-curation-badge">已发布</span>
              </div>
              <div className="admin-curation-card-body">
                <h2>{item.title}</h2>
                <p>{item.prompt}</p>
                <dl>
                  <div>
                    <dt>分类</dt>
                    <dd>{categoryLabel(item.category)}</dd>
                  </div>
                  <div>
                    <dt>来源</dt>
                    <dd>用户生成图片</dd>
                  </div>
                </dl>
                <div className="admin-curation-card-actions">
                  {canPublish ? (
                    <button
                      className="admin-button secondary"
                      type="button"
                      disabled={saving}
                      onClick={() => void unpublish(item.id)}
                    >
                      <Archive aria-hidden="true" />
                      下架
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {!published.items.length ? <AdminState kind="empty" title="暂无已发布灵感" /> : null}
        </section>
      )}
    </main>
  );
}
