"use client";

import type {
  AdminBillingOrderListResponse,
  AdminBillingOrderRecord,
  AdminBillingRuleListResponse,
  AdminPlanListResponse,
  AdminRedemptionCodeListResponse,
} from "@dream-space/contracts";
import { CircleAlert, KeyRound, Plus, ReceiptText, RefreshCw, Scale, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useAdminSession } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

const emptyRules: AdminBillingRuleListResponse = { items: [], total: 0 };
const emptyOrders: AdminBillingOrderListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
};
const emptyPlans: AdminPlanListResponse = { items: [], total: 0 };
const emptyCodes: AdminRedemptionCodeListResponse = { items: [], total: 0 };
const statusLabels: Record<AdminBillingOrderRecord["status"], string> = {
  pending: "待支付",
  paid: "已支付",
  failed: "支付失败",
  refunded: "已退款",
  partially_refunded: "部分退款",
};
function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value / 100);
}

export function AdminBilling() {
  const { session } = useAdminSession();
  const canWrite = hasAdminPermission(session, "billing:write");
  const canPublish = hasAdminPermission(session, "billing:publish");
  const canRefund = hasAdminPermission(session, "refunds:create");
  const [view, setView] = useState<"rules" | "orders" | "codes">("rules");
  const [rules, setRules] = useState(emptyRules);
  const [orders, setOrders] = useState(emptyOrders);
  const [plans, setPlans] = useState(emptyPlans);
  const [codes, setCodes] = useState(emptyCodes);
  const [planVersionId, setPlanVersionId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unitCents, setUnitCents] = useState("10");
  const [reason, setReason] = useState("维护标准计费规则");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refundOrder, setRefundOrder] = useState<AdminBillingOrderRecord | null>(null);
  const [refundReason, setRefundReason] = useState("用户申请套餐退款");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (view === "rules") setRules(await adminApi.billingRules());
      else if (view === "orders")
        setOrders(await adminApi.billingOrders({ page, pageSize: 20, status, query }));
      else {
        const [nextPlans, nextCodes] = await Promise.all([
          adminApi.plans(),
          adminApi.redemptionCodes({ page, pageSize: 50 }),
        ]);
        setPlans(nextPlans);
        setCodes(nextCodes);
        if (!planVersionId)
          setPlanVersionId(
            nextPlans.items.find((item) => item.status === "published")?.versionId ?? "",
          );
      }
    } catch (requestError) {
      setError(requestError instanceof AdminApiError ? requestError.message : "无法加载计费数据");
    } finally {
      setLoading(false);
    }
  }, [page, query, status, view]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    setError("");
    try {
      await adminApi.createBillingRule({ standardUnitCents: Number(unitCents), reason });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const createCodes = async () => {
    setSaving(true);
    setError("");
    try {
      await adminApi.createRedemptionCodes({
        planVersionId,
        quantity: Number(quantity),
        reason: "后台生成兑换码",
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const publish = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      await adminApi.publishBillingRule(id, "发布计费规则版本");
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const submitRefund = async () => {
    if (!refundOrder) return;
    setSaving(true);
    setError("");
    try {
      await adminApi.refundBillingOrder(refundOrder.id, {
        amountCents: refundOrder.amountCents - refundOrder.refundedCents,
        reason: refundReason,
        idempotencyKey: `admin-refund-${crypto.randomUUID()}`,
      });
      setRefundOrder(null);
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
          <p className="admin-page-kicker">业务运营 / 套餐</p>
          <h1>套餐与兑换码</h1>
          <p>套餐关联兑换码发放；兑换码只展示一次明文，列表仅显示掩码。</p>
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-icon-button bordered"
            type="button"
            title="刷新计费数据"
            aria-label="刷新计费数据"
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
          {!canWrite ? <span className="admin-readonly-badge">只读权限</span> : null}
        </div>
      </header>
      <div className="admin-segmented" role="tablist" aria-label="计费运营视图">
        <button
          type="button"
          role="tab"
          aria-selected={view === "rules"}
          className={view === "rules" ? "active" : ""}
          onClick={() => setView("rules")}
        >
          <Scale aria-hidden="true" />
          计费规则
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "codes"}
          className={view === "codes" ? "active" : ""}
          onClick={() => setView("codes")}
        >
          <KeyRound aria-hidden="true" />
          兑换码
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "orders"}
          className={view === "orders" ? "active" : ""}
          onClick={() => setView("orders")}
        >
          <ReceiptText aria-hidden="true" />
          订单与退款
        </button>
      </div>
      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </section>
      ) : null}
      {view === "rules" ? (
        <>
          {canWrite ? (
            <section className="admin-form-strip">
              <label>
                <span>标准单价（分/张）</span>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={unitCents}
                  onChange={(event) => setUnitCents(event.target.value)}
                />
              </label>
              <label>
                <span>操作原因</span>
                <input value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button
                className="admin-button primary"
                type="button"
                disabled={saving}
                onClick={() => void create()}
              >
                <Plus aria-hidden="true" />
                保存草稿
              </button>
            </section>
          ) : null}
          <section className="admin-table-region" aria-busy={loading} aria-label="计费规则列表">
            {loading ? (
              <AdminState kind="loading" title="正在加载计费规则" />
            ) : !rules.items.length ? (
              <AdminState kind="empty" title="暂无计费规则" />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>版本</th>
                    <th>标准单价</th>
                    <th>状态</th>
                    <th>活动</th>
                    <th>发布时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.items.map((rule) => (
                    <tr key={rule.id}>
                      <td>v{rule.version}</td>
                      <td>{money(rule.standardUnitCents)} / 张</td>
                      <td>
                        {rule.status === "published"
                          ? "已发布"
                          : rule.status === "draft"
                            ? "草稿"
                            : "已归档"}
                      </td>
                      <td>{rule.promotions.length} 个</td>
                      <td>
                        {rule.publishedAt
                          ? new Date(rule.publishedAt).toLocaleString("zh-CN")
                          : "-"}
                      </td>
                      <td>
                        {canPublish && rule.status === "draft" ? (
                          <button
                            className="admin-button secondary"
                            type="button"
                            disabled={saving}
                            onClick={() => void publish(rule.id)}
                          >
                            发布
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : view === "codes" ? (
        <>
          {canWrite ? (
            <section className="admin-form-strip">
              <label>
                <span>关联套餐</span>
                <select
                  value={planVersionId}
                  onChange={(event) => setPlanVersionId(event.target.value)}
                >
                  <option value="">请选择已发布套餐</option>
                  {plans.items
                    .filter((item) => item.status === "published")
                    .map((item) => (
                      <option key={item.versionId} value={item.versionId}>
                        {item.name} · {item.imageCount} 点 · ¥{(item.priceCents / 100).toFixed(2)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>生成数量</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <button
                className="admin-button primary"
                type="button"
                disabled={saving || !planVersionId}
                onClick={() => void createCodes()}
              >
                <Plus aria-hidden="true" />
                生成兑换码
              </button>
            </section>
          ) : null}
          <section className="admin-table-region" aria-busy={loading} aria-label="兑换码列表">
            {loading ? (
              <AdminState kind="loading" title="正在加载兑换码" />
            ) : !codes.items.length ? (
              <AdminState kind="empty" title="暂无兑换码" />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>兑换码</th>
                    <th>套餐</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.code}</strong>
                      </td>
                      <td>
                        {item.planName}
                        <small>
                          {item.imageCount} 点 / {item.validDays} 天
                        </small>
                      </td>
                      <td>
                        {item.status === "active"
                          ? "可兑换"
                          : item.status === "redeemed"
                            ? "已兑换"
                            : "已禁用"}
                      </td>
                      <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                      <td>
                        {canWrite && item.status === "active" ? (
                          <button
                            className="admin-button danger"
                            type="button"
                            onClick={() =>
                              void adminApi
                                .disableRedemptionCode(item.id, { reason: "后台禁用兑换码" })
                                .then(load)
                            }
                          >
                            禁用
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
        </>
      ) : (
        <>
          <section className="admin-form-strip admin-billing-order-filters">
            <label>
              <span>订单 / 手机号 / 套餐</span>
              <input
                value={query}
                placeholder="输入关键词"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              <span>订单状态</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部状态</option>
                <option value="paid">已支付</option>
                <option value="pending">待支付</option>
                <option value="refunded">已退款</option>
                <option value="partially_refunded">部分退款</option>
                <option value="failed">支付失败</option>
              </select>
            </label>
          </section>
          <section className="admin-table-region" aria-busy={loading} aria-label="订单列表">
            {loading ? (
              <AdminState kind="loading" title="正在加载订单" />
            ) : !orders.items.length ? (
              <AdminState kind="empty" title="暂无符合条件的订单" />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>用户</th>
                    <th>套餐</th>
                    <th>金额</th>
                    <th>状态</th>
                    <th>权益</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.items.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.id}</strong>
                        <small>{new Date(order.createdAt).toLocaleString("zh-CN")}</small>
                      </td>
                      <td>
                        {order.userPhoneMasked}
                        <small>{order.userId}</small>
                      </td>
                      <td>
                        {order.planName}
                        <small>{order.planCode}</small>
                      </td>
                      <td>
                        {money(order.amountCents)}
                        <small>已退 {money(order.refundedCents)}</small>
                      </td>
                      <td>
                        <span className="admin-status">{statusLabels[order.status]}</span>
                      </td>
                      <td>
                        {order.entitlementAvailable === null
                          ? "-"
                          : `${order.entitlementAvailable} 可用 / ${order.entitlementReserved} 预留`}
                      </td>
                      <td>
                        {canRefund && order.canRefund ? (
                          <button
                            className="admin-button danger"
                            type="button"
                            onClick={() => setRefundOrder(order)}
                          >
                            退款
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
          <div className="admin-pagination" aria-label="订单分页">
            <span>共 {orders.total} 笔</span>
            <button
              className="admin-button secondary"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页
            </button>
            <span>
              {orders.page} / {orders.pageCount}
            </span>
            <button
              className="admin-button secondary"
              type="button"
              disabled={page >= orders.pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
      {refundOrder ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal admin-model-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="refund-title"
          >
            <header className="admin-modal-header">
              <div>
                <p className="admin-page-kicker">高风险操作</p>
                <h2 id="refund-title">确认订单退款</h2>
              </div>
              <button
                className="admin-icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setRefundOrder(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <p className="admin-form-help">
              退款将撤销未使用套餐权益，并写入不可抵赖审计日志。已消费或存在预留额度时服务端会拒绝操作。
            </p>
            <dl className="admin-provider-details">
              <div>
                <dt>订单</dt>
                <dd>{refundOrder.id}</dd>
              </div>
              <div>
                <dt>用户</dt>
                <dd>{refundOrder.userPhoneMasked}</dd>
              </div>
              <div>
                <dt>退款金额</dt>
                <dd>{money(refundOrder.amountCents - refundOrder.refundedCents)}</dd>
              </div>
            </dl>
            <div className="admin-form-grid">
              <label>
                <span>退款原因</span>
                <input
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                />
              </label>
            </div>
            <div className="admin-modal-actions">
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => setRefundOrder(null)}
              >
                取消
              </button>
              <button
                className="admin-button danger"
                type="button"
                disabled={saving || refundReason.trim().length < 2}
                onClick={() => void submitRefund()}
              >
                {saving ? "处理中..." : "确认退款"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
