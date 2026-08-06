"use client";

import type {
  AdminGenerationTaskDetail,
  AdminGenerationTaskListResponse,
  GenerationTaskStatus,
  ModerationStatus,
} from "@dream-space/contracts";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi, type AdminTaskFilters } from "../lib/admin-api";
import { notifyAdminSessionChanged } from "../lib/use-admin-session";

const emptyResponse: AdminGenerationTaskListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};

const statusLabels: Record<GenerationTaskStatus, string> = {
  queued: "排队中",
  generating: "生成中",
  succeeded: "已完成",
  partially_succeeded: "部分完成",
  failed: "失败",
  cancelled: "已取消",
};

const moderationLabels: Record<ModerationStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

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

export function AdminTasks() {
  const [data, setData] = useState(emptyResponse);
  const [draft, setDraft] = useState<AdminTaskFilters>({ pageSize: 20 });
  const [activeFilters, setActiveFilters] = useState<AdminTaskFilters>({ pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AdminGenerationTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (filters: AdminTaskFilters) => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi.tasks(filters));
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        notifyAdminSessionChanged();
      }
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeFilters);
  }, [activeFilters, load]);

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setActiveFilters({ ...draft, page: 1, pageSize: 20 });
  };

  const resetFilters = () => {
    const next = { page: 1, pageSize: 20 };
    setDraft(next);
    setActiveFilters(next);
  };

  const changePage = (page: number) => {
    if (page < 1 || page > Math.max(1, data.pageCount)) return;
    setActiveFilters((current) => ({ ...current, page }));
  };

  const openDetail = async (taskId: string) => {
    setDetailLoading(true);
    setError("");
    try {
      setDetail(await adminApi.task(taskId));
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        notifyAdminSessionChanged();
      }
      setError((requestError as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">生成运营</p>
          <h1>生成任务</h1>
          <p>跟踪任务状态、生成参数、消耗和结果。</p>
        </div>
        <button
          className="admin-icon-button bordered"
          type="button"
          aria-label="刷新任务"
          title="刷新任务"
          disabled={loading}
          onClick={() => void load(activeFilters)}
        >
          <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
        </button>
      </header>

      <form className="admin-filters" onSubmit={submitFilters}>
        <label className="admin-search-field">
          <Search aria-hidden="true" />
          <input
            aria-label="搜索任务"
            placeholder="提示词、会话或手机号"
            value={draft.query ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
          />
        </label>
        <label>
          <span>状态</span>
          <select
            value={draft.status ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>模型</span>
          <select
            value={draft.model ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
          >
            <option value="">全部模型</option>
            <option value="image-4.7">通用模型</option>
            <option value="image-realistic">写实模型</option>
            <option value="image-anime">动漫模型</option>
          </select>
        </label>
        <label>
          <span>开始日期</span>
          <input
            type="date"
            value={draft.createdFrom ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, createdFrom: event.target.value }))
            }
          />
        </label>
        <label>
          <span>结束日期</span>
          <input
            type="date"
            value={draft.createdTo ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, createdTo: event.target.value }))
            }
          />
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
        <span>共 {data.total} 条任务</span>
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

      <section className="admin-table-region" aria-busy={loading} aria-label="生成任务列表">
        <table className="admin-table">
          <thead>
            <tr>
              <th>任务 / 会话</th>
              <th>用户</th>
              <th>状态</th>
              <th>模型</th>
              <th>产出</th>
              <th>消耗</th>
              <th>创建时间</th>
              <th className="admin-table-action-heading">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((task) => (
              <tr key={task.id}>
                <td>
                  <strong className="admin-task-prompt">{task.prompt}</strong>
                  <small>{task.sessionTitle}</small>
                </td>
                <td>{task.userPhoneMasked}</td>
                <td>
                  <span className={`admin-status ${task.status}`}>{statusLabels[task.status]}</span>
                </td>
                <td>
                  <span>{task.model}</span>
                  <small>
                    {task.ratio} · {task.resolution}
                  </small>
                </td>
                <td>
                  {task.resultCount} / {task.imageCount}
                </td>
                <td>{task.totalCost} 点</td>
                <td>{formatDate(task.createdAt)}</td>
                <td className="admin-table-action-cell">
                  <button
                    className="admin-icon-button"
                    type="button"
                    aria-label={`查看任务 ${task.id}`}
                    title="查看详情"
                    disabled={detailLoading}
                    onClick={() => void openDetail(task.id)}
                  >
                    <Eye aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.items.length === 0 ? (
          <div className="admin-empty-state">
            <Search aria-hidden="true" />
            <strong>没有符合条件的任务</strong>
            <span>调整筛选条件后重新查询。</span>
          </div>
        ) : null}
        {loading && data.items.length === 0 ? (
          <div className="admin-empty-state">
            <LoaderCircle className="spin" aria-hidden="true" />
            <strong>正在加载任务</strong>
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

      {detail ? (
        <div
          className="admin-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <aside
            className="admin-task-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="taskDetailTitle"
          >
            <header>
              <div>
                <p>任务详情</p>
                <h2 id="taskDetailTitle">{detail.sessionTitle}</h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭详情"
                onClick={() => setDetail(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="admin-task-drawer-body">
              <div className="admin-detail-status-line">
                <span className={`admin-status ${detail.status}`}>
                  {statusLabels[detail.status]}
                </span>
                <span>{detail.userPhoneMasked}</span>
                <span>{formatDate(detail.createdAt)}</span>
              </div>
              <section>
                <h3>提示词</h3>
                <p className="admin-detail-prompt">{detail.prompt}</p>
              </section>
              <dl className="admin-detail-grid">
                <div>
                  <dt>模型</dt>
                  <dd>{detail.model}</dd>
                </div>
                <div>
                  <dt>规格</dt>
                  <dd>
                    {detail.ratio} · {detail.resolution}
                  </dd>
                </div>
                <div>
                  <dt>生成数量</dt>
                  <dd>{detail.imageCount} 张</dd>
                </div>
                <div>
                  <dt>额度消耗</dt>
                  <dd>{detail.totalCost} 点</dd>
                </div>
                <div>
                  <dt>执行次数</dt>
                  <dd>{detail.attempts} 次</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{formatDate(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>{formatDate(detail.completedAt)}</dd>
                </div>
                <div>
                  <dt>输入审核</dt>
                  <dd>{moderationLabels[detail.inputModerationStatus]}</dd>
                </div>
                <div>
                  <dt>输出审核</dt>
                  <dd>{moderationLabels[detail.outputModerationStatus]}</dd>
                </div>
              </dl>
              {detail.errorMessage ? (
                <section className="admin-detail-error">
                  <h3>失败信息</h3>
                  <p>{detail.errorMessage}</p>
                </section>
              ) : null}
              {detail.deadLetter ? (
                <section className="admin-detail-error">
                  <h3>死信记录</h3>
                  <p>
                    {detail.deadLetter.errorCode} · {detail.deadLetter.attempts} 次尝试
                  </p>
                </section>
              ) : null}
              <section>
                <h3>生成结果</h3>
                {detail.results.length ? (
                  <div className="admin-result-grid">
                    {detail.results.map((result) => (
                      <img
                        key={result.id}
                        src={result.imageUrl}
                        alt={`生成结果 ${result.index + 1}`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="admin-muted">暂无生成结果。</p>
                )}
              </section>
              <section>
                <h3>任务 ID</h3>
                <code>{detail.id}</code>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
