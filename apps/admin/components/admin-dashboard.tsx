"use client";

import type { AdminDashboardSummary } from "@dream-space/contracts";
import {
  Activity,
  CircleAlert,
  Clock3,
  Image,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi } from "../lib/admin-api";
import { notifyAdminSessionChanged } from "../lib/use-admin-session";
import { AdminState } from "./admin-state";

function number(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function latency(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function updatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi.dashboardSummary());
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
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <main className="admin-state-page">
        <AdminState kind="loading" title="正在汇总运营数据" />
      </main>
    );
  }
  if (error && !data) {
    return (
      <main className="admin-state-page">
        <AdminState
          kind="error"
          title="无法加载运营总览"
          description={error}
          onRetry={() => void load()}
        />
      </main>
    );
  }
  if (!data) return null;

  const metrics = [
    {
      label: "今日生图任务",
      value: number(data.generation.total),
      note: `成功 ${number(data.generation.succeeded)}，失败 ${number(data.generation.failed)}`,
      icon: Image,
    },
    {
      label: "任务成功率",
      value: `${data.generation.successRate}%`,
      note: "按今日创建任务统计",
      icon: Activity,
    },
    {
      label: "平均处理时延",
      value: latency(data.generation.averageLatencyMs),
      note: "仅统计已完成任务",
      icon: Clock3,
    },
    {
      label: "待审核",
      value: number(data.generation.pendingReview),
      note: "输入或输出尚未审核",
      icon: ShieldAlert,
    },
    {
      label: "今日新增用户",
      value: number(data.users.newToday),
      note: `累计注册 ${number(data.users.total)}`,
      icon: Users,
    },
    {
      label: "正常用户",
      value: number(data.users.active),
      note: `限制 ${number(data.users.restricted)}，封禁 ${number(data.users.banned)}`,
      icon: UserCheck,
    },
  ];

  return (
    <main className="admin-page admin-dashboard-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-kicker">运营中心</p>
          <h1>运营总览</h1>
          <p>
            统计窗口为北京时间今日 00:00 至次日 00:00，数据更新时间 {updatedAt(data.generatedAt)}。
          </p>
        </div>
        <button
          className="admin-icon-button bordered"
          type="button"
          aria-label="刷新运营数据"
          title="刷新"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />
        </button>
      </header>

      {error ? (
        <section className="admin-inline-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          <button className="admin-button secondary" type="button" onClick={() => setError("")}>
            关闭
          </button>
        </section>
      ) : null}

      <section className="admin-metric-grid" aria-label="今日运营指标">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="admin-metric" key={metric.label}>
              <span className="admin-metric-icon">
                <Icon aria-hidden="true" />
              </span>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </article>
          );
        })}
      </section>

      <section className="admin-dashboard-band" aria-label="用户与收入状态">
        <div>
          <p className="admin-page-kicker">用户状态</p>
          <div className="admin-status-breakdown">
            <span>
              <b>{number(data.users.active)}</b>正常
            </span>
            <span>
              <b>{number(data.users.restricted)}</b>限制生成
            </span>
            <span>
              <b>{number(data.users.banned)}</b>已封禁
            </span>
          </div>
        </div>
        <div>
          <p className="admin-page-kicker">收入</p>
          <strong className="admin-data-pending">待计费引擎接入</strong>
          <small>{data.revenue.note}</small>
        </div>
      </section>
    </main>
  );
}
