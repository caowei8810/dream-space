"use client";

import type {
  AdminModerationReviewListResponse,
  AppealRecord,
  ModerationReviewStatus,
} from "@dream-space/contracts";
import { CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const empty: AdminModerationReviewListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};
const statusLabels: Record<ModerationReviewStatus, string> = {
  open: "待领取",
  claimed: "处理中",
  approved: "已通过",
  rejected: "已拒绝",
};

export function AdminModeration() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "moderation:write");
  const [status, setStatus] = useState<ModerationReviewStatus | "open">("open");
  const [view, setView] = useState<"reviews" | "appeals">("reviews");
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    if (view === "appeals") {
      setLoading(true);
      setError("");
      try {
        setAppeals((await adminApi.moderationAppeals()).items);
      } catch (requestError) {
        setError(requestError instanceof AdminApiError ? requestError.message : "无法加载申诉队列");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await adminApi.moderationReviews({ status, page: 1, pageSize: 20 }));
    } catch (requestError) {
      setError(requestError instanceof AdminApiError ? requestError.message : "无法加载审核队列");
    } finally {
      setLoading(false);
    }
  }, [status, view]);
  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      await adminApi.claimModerationReview(id);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const decide = async (id: string, decision: "approved" | "rejected") => {
    if (note.trim().length < 2) {
      setError("请填写至少 2 个字符的审核说明");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await adminApi.decideModerationReview(id, { decision, note });
      setNote("");
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const decideAppeal = async (id: string, decision: "approved" | "rejected") => {
    if (note.trim().length < 2) {
      setError("请填写至少 2 个字符的申诉说明");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await adminApi.decideModerationAppeal(id, { decision, note });
      setNote("");
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">业务运营 / 审核</p>
          <h1>人工审核</h1>
          <p>领取后才能处理审核，系统用原子状态更新保护并发领取。</p>
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-icon-button bordered"
            type="button"
            title="刷新审核队列"
            aria-label="刷新审核队列"
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {!canWrite ? <span className="admin-readonly-badge">只读权限</span> : null}
        </div>
      </header>
      <div className="admin-filter-bar">
        <div className="admin-segmented-control" role="tablist">
          <button
            type="button"
            className={view === "reviews" ? "active" : ""}
            onClick={() => setView("reviews")}
          >
            审核队列
          </button>
          <button
            type="button"
            className={view === "appeals" ? "active" : ""}
            onClick={() => setView("appeals")}
          >
            申诉队列
          </button>
        </div>
        {view === "reviews" ? (
          <label>
            <span>状态</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ModerationReviewStatus)}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="admin-list-summary">
          共 {view === "reviews" ? data.total : appeals.length} 条记录
        </span>
      </div>
      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </section>
      ) : null}
      <section
        className="admin-table-region"
        aria-busy={loading}
        aria-label={view === "reviews" ? "人工审核队列" : "申诉队列"}
      >
        {loading ? (
          <AdminState kind="loading" title="正在加载队列" />
        ) : view === "reviews" ? (
          !data.items.length ? (
            <AdminState kind="empty" title="暂无待处理审核" />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>对象</th>
                  <th>原因</th>
                  <th>状态</th>
                  <th>领取人</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.stage === "input" ? "输入" : "输出"}</td>
                    <td>
                      <strong>{item.taskId ?? item.resultId}</strong>
                      <small>{item.id}</small>
                    </td>
                    <td>
                      {item.reasonCode}
                      <small>{item.reason ?? "系统标记"}</small>
                    </td>
                    <td>
                      <span
                        className={`admin-status ${item.status === "approved" ? "user-active" : ""}`}
                      >
                        {statusLabels[item.status]}
                      </span>
                    </td>
                    <td>{item.assignedToName ?? "未领取"}</td>
                    <td className="admin-table-action-cell">
                      {canWrite && item.status === "open" ? (
                        <button
                          className="admin-button secondary"
                          type="button"
                          disabled={saving}
                          onClick={() => void claim(item.id)}
                        >
                          领取
                        </button>
                      ) : null}
                      {canWrite && item.status === "claimed" ? (
                        <div className="admin-inline-actions">
                          <input
                            aria-label="审核说明"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="审核说明"
                          />
                          <button
                            className="admin-button secondary"
                            type="button"
                            disabled={saving}
                            onClick={() => void decide(item.id, "approved")}
                          >
                            <ShieldCheck aria-hidden="true" />
                            通过
                          </button>
                          <button
                            className="admin-button danger"
                            type="button"
                            disabled={saving}
                            onClick={() => void decide(item.id, "rejected")}
                          >
                            拒绝
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : !appeals.length ? (
          <AdminState kind="empty" title="暂无申诉" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>关联对象</th>
                <th>申诉原因</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {appeals.map((appeal) => (
                <tr key={appeal.id}>
                  <td>
                    <strong>{appeal.taskId ?? appeal.resultId}</strong>
                    <small>{appeal.id}</small>
                  </td>
                  <td>{appeal.reason}</td>
                  <td>
                    {appeal.status === "open"
                      ? "待处理"
                      : appeal.status === "accepted"
                        ? "已接受"
                        : "已拒绝"}
                  </td>
                  <td>{new Date(appeal.createdAt).toLocaleString("zh-CN")}</td>
                  <td>
                    {canWrite && appeal.status === "open" ? (
                      <div className="admin-inline-actions">
                        <input
                          aria-label="申诉说明"
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="申诉说明"
                        />
                        <button
                          className="admin-button secondary"
                          type="button"
                          disabled={saving}
                          onClick={() => void decideAppeal(appeal.id, "approved")}
                        >
                          接受
                        </button>
                        <button
                          className="admin-button danger"
                          type="button"
                          disabled={saving}
                          onClick={() => void decideAppeal(appeal.id, "rejected")}
                        >
                          拒绝
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
