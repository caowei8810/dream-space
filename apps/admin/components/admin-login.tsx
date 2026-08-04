"use client";

import {
  adminDemoPhone,
  type AdminSessionResponse,
  type SendCodeResponse,
} from "@dream-space/contracts";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { adminApi } from "../lib/admin-api";
import { notifyAdminSessionChanged } from "../lib/use-admin-session";

export function AdminLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState<string>(adminDemoPhone);
  const [code, setCode] = useState("123456");
  const [challenge, setChallenge] = useState<SendCodeResponse | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void adminApi
      .session()
      .then((session) => {
        if (session.authenticated) router.replace("/tasks");
      })
      .catch(() => setError("无法连接管理 API，请稍后重试。"))
      .finally(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const sendCode = async () => {
    setSending(true);
    setError("");
    try {
      const response = await adminApi.sendCode({ phone });
      setChallenge(response);
      setCountdown(response.retryAfterSeconds);
      if (response.demoCode) setCode(response.demoCode);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setError("");
    try {
      const session = (await adminApi.login({
        phone,
        challengeId: challenge.challengeId,
        code,
      })) as AdminSessionResponse;
      if (!session.authenticated) throw new Error("管理员会话创建失败");
      notifyAdminSessionChanged();
      router.replace("/tasks");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-intro">
        <div className="admin-brand-mark" aria-hidden="true">
          <ShieldCheck />
        </div>
        <p className="admin-kicker">DREAM SPACE OPERATIONS</p>
        <h1>造梦空间管理端</h1>
        <p>内容、生成任务与运营状态的独立工作台。</p>
      </section>
      <section className="admin-login-panel" aria-busy={checking}>
        <form onSubmit={(event) => void submit(event)}>
          <KeyRound className="admin-login-icon" aria-hidden="true" />
          <h2>管理员登录</h2>
          <p className="admin-login-copy">使用已授权的管理员手机号验证身份。</p>
          <label htmlFor="adminPhone">手机号</label>
          <input
            id="adminPhone"
            value={phone}
            inputMode="numeric"
            autoComplete="tel"
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
          <label htmlFor="adminCode">验证码</label>
          <div className="admin-code-row">
            <input
              id="adminCode"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button
              className="admin-button secondary"
              type="button"
              disabled={sending || countdown > 0 || !/^1[3-9]\d{9}$/.test(phone)}
              onClick={() => void sendCode()}
            >
              {sending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
              {countdown > 0 ? `${countdown}s` : challenge ? "重新获取" : "获取验证码"}
            </button>
          </div>
          <div className="admin-form-error" role="alert">
            {error}
          </div>
          <button
            className="admin-button primary"
            type="submit"
            disabled={checking || submitting || !challenge || code.length !== 6}
          >
            {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
            登录管理端
          </button>
          <p className="admin-demo-note">Mock 模式下使用本地演示账号与验证码。</p>
        </form>
      </section>
    </main>
  );
}
