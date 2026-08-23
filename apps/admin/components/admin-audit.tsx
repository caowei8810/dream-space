"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AdminAuditLogListResponse } from "@dream-space/contracts";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { AdminState } from "./admin-state";

const empty: AdminAuditLogListResponse = { items: [], total: 0, page: 1, pageSize: 50 };

export function AdminAudit() {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ action: "", resourceType: "", actor: "", requestId: "" });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await adminApi.auditLogs(filters)); }
    catch (requestError) { setError(requestError instanceof AdminApiError ? requestError.message : "无法加载审计日志"); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);
  return <main className="admin-page">
    <header className="admin-page-header"><div><p className="admin-page-kicker">系统管理 / 追溯</p><h1>操作审计</h1><p>记录高风险管理操作的操作者、请求、原因和状态变化；敏感原始数据不在此页面展示。</p></div><button className="admin-icon-button bordered" type="button" aria-label="刷新审计日志" title="刷新审计日志" onClick={() => void load()}><RefreshCw className={loading ? "spin" : ""} aria-hidden="true" /></button></header>
    {error ? <section className="admin-inline-error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span></section> : null}
    <section className="admin-form-strip"><label><span>动作</span><input value={filters.action} onChange={(event) => setFilters((v) => ({ ...v, action: event.target.value }))} placeholder="publish / ban" /></label><label><span>资源类型</span><input value={filters.resourceType} onChange={(event) => setFilters((v) => ({ ...v, resourceType: event.target.value }))} placeholder="RiskRule" /></label><label><span>操作者</span><input value={filters.actor} onChange={(event) => setFilters((v) => ({ ...v, actor: event.target.value }))} placeholder="姓名或工号" /></label><label><span>请求 ID</span><input value={filters.requestId} onChange={(event) => setFilters((v) => ({ ...v, requestId: event.target.value }))} /></label><button className="admin-button secondary" type="button" onClick={() => void load()}>筛选</button></section>
    <section className="admin-table-region" aria-busy={loading} aria-label="操作审计列表">{loading ? <AdminState kind="loading" title="正在加载审计日志" /> : !data.items.length ? <AdminState kind="empty" title="暂无匹配审计日志" /> : <table className="admin-table"><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>资源</th><th>原因</th><th>请求 ID</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td>{item.actor ? `${item.actor.displayName}（${item.actor.employeeNo}）` : "系统"}</td><td><code>{item.action}</code></td><td><code>{item.resourceType}/{item.resourceId}</code></td><td>{item.reason}</td><td><code>{item.requestId}</code></td></tr>)}</tbody></table>}</section>
  </main>;
}
