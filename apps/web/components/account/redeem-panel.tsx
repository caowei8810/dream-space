"use client";

import { ArrowLeft, CheckCircle2, LoaderCircle, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function RedeemPanel() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ planName: string; imageCount: number; expiresAt: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/billing/redemptions`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const data = (await response.json().catch(() => ({}))) as { message?: string; planName?: string; imageCount?: number; expiresAt?: string };
      if (!response.ok) throw new Error(data.message ?? "兑换失败");
      setSuccess({ planName: data.planName ?? "套餐", imageCount: data.imageCount ?? 0, expiresAt: data.expiresAt ?? "" });
      setCode("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "兑换失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="account-page">
      <div className="account-page-header">
        <Link className="icon-btn" href="/inspiration" aria-label="返回"><ArrowLeft aria-hidden="true" /></Link>
        <div><p className="eyebrow">账户设置</p><h1>兑换点数</h1><p>输入后台生成的兑换码，到账后即可用于图片生成。</p></div>
      </div>
      <section className="account-panel redeem-panel">
        <div className="redeem-icon"><Ticket aria-hidden="true" /></div>
        <h2>兑换套餐</h2>
        <form onSubmit={submit}>
          <label htmlFor="redemption-code">兑换码</label>
          <input id="redemption-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="DS-XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" />
          <button className="primary-btn" type="submit" disabled={loading || !code.trim()}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{loading ? "兑换中..." : "立即兑换"}</button>
        </form>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {success ? <div className="form-success" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>{success.planName} 已到账</strong><span>获得 {success.imageCount} 点，有效期至 {new Date(success.expiresAt).toLocaleDateString("zh-CN")}</span></div></div> : null}
      </section>
    </main>
  );
}
