"use client";

import {
  riskActions,
  riskRuleMatchTypes,
  type AdminRiskRuleListResponse,
  type RiskAction,
  type RiskRuleMatchType,
} from "@dream-space/contracts";
import { CircleAlert, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const empty: AdminRiskRuleListResponse = { items: [], total: 0 };
const actionLabels: Record<RiskAction, string> = {
  reject: "拒绝生成",
  restrict: "限制用户",
  ban: "封禁用户",
  manual_review: "转人工审核",
};

export function AdminRisk() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "risk-rules:write");
  const canPublish = hasAdminPermission(session, "risk-rules:publish");
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    matchType: "keyword" as RiskRuleMatchType,
    pattern: "",
    category: "",
    action: "reject" as RiskAction,
    priority: "100",
    reason: "上线提示词风控规则",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi.riskRules());
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        setError("管理员会话已失效，请重新登录");
      } else setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRule = async (id: string, operation: "publish" | "archive") => {
    setSaving(true);
    setError("");
    try {
      const input = { reason: operation === "publish" ? "发布新版本风控规则" : "下线风控规则" };
      if (operation === "publish") await adminApi.publishRiskRule(id, input);
      else await adminApi.archiveRiskRule(id, input);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adminApi.createRiskRule({
        ...form,
        priority: Number(form.priority),
        reason: form.reason,
      });
      setShowCreate(false);
      setForm((current) => ({ ...current, code: "", name: "", pattern: "", category: "" }));
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
          <p className="admin-page-kicker">业务运营 / 风控</p>
          <h1>提示词风控</h1>
          <p>规则采用草稿、发布、归档版本流转；生成请求只读取已发布规则。</p>
        </div>
        <div className="admin-page-header-actions">
          <button className="admin-icon-button bordered" type="button" title="刷新规则" aria-label="刷新规则" onClick={() => void load()}>
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {canWrite ? (
            <button className="admin-button primary" type="button" onClick={() => setShowCreate(true)}>
              <Plus aria-hidden="true" /> 新建规则
            </button>
          ) : <span className="admin-readonly-badge">只读权限</span>}
        </div>
      </header>
      {error ? <section className="admin-inline-error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span></section> : null}
      <div className="admin-list-summary"><span>共 {data.total} 个规则版本</span><span>已发布规则才会拦截生成</span></div>
      <section className="admin-table-region" aria-busy={loading} aria-label="提示词风控规则">
        {loading ? <AdminState kind="loading" title="正在加载风控规则" /> : data.items.length === 0 ? <AdminState kind="empty" title="暂无风控规则" /> : (
          <table className="admin-table">
            <thead><tr><th>规则</th><th>匹配</th><th>处置</th><th>优先级</th><th>状态</th><th>命中</th><th>操作</th></tr></thead>
            <tbody>{data.items.map((rule) => <tr key={rule.id}>
              <td><strong>{rule.name}</strong><small>{rule.code} · v{rule.version} · {rule.category}</small></td>
              <td><span className="admin-status">{rule.matchType === "keyword" ? "关键词" : "正则"}</span><small className="admin-risk-pattern">{rule.pattern}</small></td>
              <td>{actionLabels[rule.action]}</td><td>{rule.priority}</td>
              <td><span className={`admin-status ${rule.status === "published" ? "user-active" : ""}`}>{rule.status === "published" ? "已发布" : rule.status === "draft" ? "草稿" : "已归档"}</span></td>
              <td>{rule.hitCount}</td>
              <td className="admin-table-action-cell">{canPublish && rule.status === "draft" ? <button className="admin-button secondary" type="button" disabled={saving} onClick={() => void updateRule(rule.id, "publish")}>发布</button> : null}{canPublish && rule.status === "published" ? <button className="admin-button secondary" type="button" disabled={saving} onClick={() => void updateRule(rule.id, "archive")}>下线</button> : null}</td>
            </tr>)}</tbody>
          </table>
        )}
      </section>
      {showCreate ? <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="risk-create-title">
        <header className="admin-modal-header"><div><p className="admin-page-kicker">规则版本</p><h2 id="risk-create-title">新建风控规则</h2></div><button className="admin-icon-button" type="button" aria-label="关闭" onClick={() => setShowCreate(false)}><X aria-hidden="true" /></button></header>
        <form className="admin-form-grid" onSubmit={create}>
          <label><span>规则编码</span><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="prompt-sensitive" /></label>
          <label><span>规则名称</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label><span>匹配类型</span><select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value as RiskRuleMatchType })}>{riskRuleMatchTypes.map((value) => <option key={value} value={value}>{value === "keyword" ? "关键词" : "正则"}</option>)}</select></label>
          <label><span>处置动作</span><select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as RiskAction })}>{riskActions.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label>
          <label><span>风险分类</span><input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="涉敏 / 涉黄 / 暴恐" /></label>
          <label><span>优先级</span><input type="number" min="0" max="10000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></label>
          <label className="admin-form-full"><span>匹配内容</span><textarea required rows={4} value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="关键词每行一个；正则仅允许安全表达式" /></label>
          <label className="admin-form-full"><span>操作原因</span><input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          <div className="admin-modal-actions"><button className="admin-button secondary" type="button" onClick={() => setShowCreate(false)}>取消</button><button className="admin-button primary" type="submit" disabled={saving}>{saving ? "保存中..." : "保存草稿"}</button></div>
        </form>
      </section></div> : null}
      <div className="admin-risk-note"><ShieldAlert aria-hidden="true" /><span>命中记录仅保留输入哈希、长度、规则版本和处置结果；原始提示词不写入风控命中表。</span></div>
    </main>
  );
}
