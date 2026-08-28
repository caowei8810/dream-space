"use client";

import type { PrivacyRequestListResponse, PrivacyRequestRecord } from "@dream-space/contracts";
import { Download, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/use-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function PrivacyCenter() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useAuth();
  const [items, setItems] = useState<PrivacyRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/privacy/requests`, { credentials: "include" });
      if (!response.ok) throw new Error("隐私请求加载失败");
      setItems(((await response.json()) as PrivacyRequestListResponse).items);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "隐私请求加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionLoading && !session?.authenticated) router.replace("/login");
    if (session?.authenticated) void load();
  }, [router, session, sessionLoading]);

  const create = async (type: "delete" | "export") => {
    if (
      type === "delete" &&
      !window.confirm("提交后需由平台完成核验。处理完成后账号将无法登录，是否继续？")
    )
      return;
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/privacy/requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          reason: type === "delete" ? "用户申请删除账户" : "用户申请导出个人数据",
        }),
      });
      if (!response.ok) throw new Error("提交失败，请稍后重试");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="privacy-center">
      <header className="privacy-center-header">
        <div>
          <p>账户设置</p>
          <h1>隐私与数据</h1>
          <span>管理个人数据导出和账户删除请求。</span>
        </div>
        <button
          className="privacy-icon-button"
          type="button"
          aria-label="刷新隐私请求"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </header>
      {error ? (
        <div className="privacy-error" role="alert">
          {error}
        </div>
      ) : null}
      <section className="privacy-actions">
        <div>
          <Download aria-hidden="true" />
          <span>
            <strong>导出个人数据</strong>
            <small>包含账号、生成、上传、订单、额度及审核相关记录。</small>
          </span>
          <button type="button" onClick={() => void create("export")} disabled={saving}>
            申请导出
          </button>
        </div>
        <div>
          <Trash2 aria-hidden="true" />
          <span>
            <strong>删除账户</strong>
            <small>账号和手机号将匿名化；法定账务与审计记录会按合规要求保留。</small>
          </span>
          <button
            className="danger"
            type="button"
            onClick={() => void create("delete")}
            disabled={saving}
          >
            申请删除
          </button>
        </div>
      </section>
      <section className="privacy-history">
        <h2>请求记录</h2>
        {loading ? (
          <div className="privacy-loading">
            <LoaderCircle className="spin" aria-hidden="true" />
            正在加载
          </div>
        ) : items.length === 0 ? (
          <p className="privacy-empty">暂无请求记录</p>
        ) : (
          <div className="privacy-request-list">
            {items.map((item) => (
              <article key={item.id}>
                <span>
                  <strong>{item.type === "export" ? "数据导出" : "账户删除"}</strong>
                  <small>{new Date(item.requestedAt).toLocaleString("zh-CN")}</small>
                </span>
                <span className={`privacy-status ${item.status}`}>
                  {item.status === "completed"
                    ? "已完成"
                    : item.status === "rejected"
                      ? "已拒绝"
                      : "处理中"}
                </span>
                {item.type === "export" && item.status === "completed" ? (
                  <a href={`${apiUrl}/privacy/requests/${item.id}/export`}>下载 JSON</a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
