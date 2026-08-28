"use client";

import { useEffect, useState } from "react";
import type {
  AdminPrivacyCleanupResponse,
  AdminPrivacyRequestListResponse,
} from "@dream-space/contracts";
import { Check, Database, RefreshCw, Search } from "lucide-react";
import { adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const empty: AdminPrivacyRequestListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 0,
};
const labels = {
  requested: "待处理",
  processing: "处理中",
  completed: "已完成",
  rejected: "已拒绝",
} as const;
export function AdminPrivacy() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "privacy:write");
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleanup, setCleanup] = useState<AdminPrivacyCleanupResponse | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setData(await adminApi.privacyRequests());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const complete = async (id: string, type: "delete" | "export") => {
    const reason = window
      .prompt("请填写处理原因", type === "delete" ? "完成账户删除请求" : "完成数据导出请求")
      ?.trim();
    if (!reason) return;
    try {
      await adminApi.completePrivacyRequest(id, { reason });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败");
    }
  };
  const runCleanup = async (dryRun: boolean) => {
    if (!dryRun && !window.confirm(`确认物理删除已软删除超过 ${retentionDays} 天的上传文件？`))
      return;
    setCleaning(true);
    try {
      setCleanup(
        await adminApi.cleanupPrivacyUploads({
          retentionDays,
          dryRun,
          reason: dryRun ? "预览隐私数据清理" : "执行隐私数据清理",
        }),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "清理失败");
    } finally {
      setCleaning(false);
    }
  };
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">业务运营</p>
          <h1>隐私请求</h1>
          <p>处理账户删除和数据导出请求，保留必要的账务与审计记录。</p>
        </div>
        <button
          className="admin-icon-button bordered"
          type="button"
          aria-label="刷新隐私请求"
          title="刷新"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </header>
      {error ? (
        <div className="admin-form-error" role="alert">
          {error}
        </div>
      ) : null}
      {canWrite ? (
        <section className="admin-privacy-cleanup" aria-label="数据留存清理">
          <div className="admin-privacy-cleanup-heading">
            <Database aria-hidden="true" />
            <div>
              <strong>上传数据留存清理</strong>
              <small>仅处理已软删除且超过留存期限的上传文件。</small>
            </div>
          </div>
          <label>
            <span>留存天数</span>
            <input
              type="number"
              min="1"
              max="3650"
              value={retentionDays}
              onChange={(event) => setRetentionDays(Number(event.target.value))}
            />
          </label>
          <div className="admin-page-header-actions">
            <button
              className="admin-button secondary"
              type="button"
              disabled={cleaning}
              onClick={() => void runCleanup(true)}
            >
              <Search aria-hidden="true" />
              预览清理
            </button>
            <button
              className="admin-button danger"
              type="button"
              disabled={cleaning || !cleanup || cleanup.retentionDays !== retentionDays}
              onClick={() => void runCleanup(false)}
            >
              <Database aria-hidden="true" />
              执行清理
            </button>
          </div>
          {cleanup ? (
            <p className="admin-privacy-cleanup-result" role="status">
              候选 {cleanup.candidates} 个，已删除 {cleanup.deleted} 个，失败 {cleanup.failed} 个
            </p>
          ) : null}
        </section>
      ) : null}
      <section className="admin-table-region" aria-busy={loading}>
        {loading ? (
          <AdminState kind="loading" title="正在加载隐私请求" />
        ) : !data.items.length ? (
          <AdminState kind="empty" title="暂无隐私请求" />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>类型</th>
                <th>原因</th>
                <th>状态</th>
                <th>申请时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.phoneMasked}
                    <small>{item.userId}</small>
                  </td>
                  <td>{item.type === "delete" ? "账户删除" : "数据导出"}</td>
                  <td>{item.reason}</td>
                  <td>
                    <span className="admin-status">{labels[item.status]}</span>
                  </td>
                  <td>{new Date(item.requestedAt).toLocaleString("zh-CN")}</td>
                  <td>
                    {canWrite && item.status !== "completed" ? (
                      <button
                        className="admin-button secondary"
                        type="button"
                        onClick={() => void complete(item.id, item.type)}
                      >
                        <Check aria-hidden="true" />
                        {item.type === "delete" ? "完成删除" : "准备导出"}
                      </button>
                    ) : (
                      "-"
                    )}
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
