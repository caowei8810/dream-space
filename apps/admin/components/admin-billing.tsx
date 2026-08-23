"use client";

import type { AdminBillingRuleListResponse } from "@dream-space/contracts";
import { CircleAlert, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const empty: AdminBillingRuleListResponse = { items: [], total: 0 };

export function AdminBilling() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "billing:write");
  const canPublish = hasAdminPermission(session, "billing:publish");
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unitCents, setUnitCents] = useState("10");
  const [reason, setReason] = useState("维护标准计费规则");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await adminApi.billingRules()); }
    catch (requestError) { setError(requestError instanceof AdminApiError ? requestError.message : "无法加载计费规则"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setSaving(true); setError("");
    try { await adminApi.createBillingRule({ standardUnitCents: Number(unitCents), reason }); setUnitCents("10"); await load(); }
    catch (requestError) { setError((requestError as Error).message); }
    finally { setSaving(false); }
  };
  const publish = async (id: string) => {
    setSaving(true); setError("");
    try { await adminApi.publishBillingRule(id, "发布计费规则版本"); await load(); }
    catch (requestError) { setError((requestError as Error).message); }
    finally { setSaving(false); }
  };

  return <main className="admin-page">
    <header className="admin-page-header"><div><p className="admin-page-kicker">业务运营 / 计费</p><h1>计费规则</h1><p>价格以整数分保存，草稿发布后报价接口才会读取；历史版本不会被改写。</p></div><div className="admin-page-header-actions"><button className="admin-icon-button bordered" type="button" title="刷新计费规则" aria-label="刷新计费规则" onClick={() => void load()}><RefreshCw className={loading ? "spin" : ""} aria-hidden="true" /></button>{!canWrite ? <span className="admin-readonly-badge">只读权限</span> : null}</div></header>
    {error ? <section className="admin-inline-error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span></section> : null}
    {canWrite ? <section className="admin-form-strip"><label><span>标准单价（分/张）</span><input type="number" min="1" max="100000" value={unitCents} onChange={(event) => setUnitCents(event.target.value)} /></label><label><span>操作原因</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="admin-button primary" type="button" disabled={saving} onClick={() => void create()}><Plus aria-hidden="true" />保存草稿</button></section> : null}
    <section className="admin-table-region" aria-busy={loading} aria-label="计费规则列表">{loading ? <AdminState kind="loading" title="正在加载计费规则" /> : !data.items.length ? <AdminState kind="empty" title="暂无计费规则" /> : <table className="admin-table"><thead><tr><th>版本</th><th>标准单价</th><th>状态</th><th>活动</th><th>发布时间</th><th>操作</th></tr></thead><tbody>{data.items.map((rule) => <tr key={rule.id}><td>v{rule.version}</td><td>{(rule.standardUnitCents / 100).toFixed(2)} 元/张</td><td>{rule.status === "published" ? "已发布" : rule.status === "draft" ? "草稿" : "已归档"}</td><td>{rule.promotions.length} 个</td><td>{rule.publishedAt ? new Date(rule.publishedAt).toLocaleString("zh-CN") : "-"}</td><td>{canPublish && rule.status === "draft" ? <button className="admin-button secondary" type="button" disabled={saving} onClick={() => void publish(rule.id)}>发布</button> : null}</td></tr>)}</tbody></table>}</section>
  </main>;
}
