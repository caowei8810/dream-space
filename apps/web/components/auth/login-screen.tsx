"use client";

import {
  authAgreementVersion,
  type AuthSessionResponse,
  type SendCodeResponse,
} from "@dream-space/contracts";
import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { isSafeReturnTo, readPendingIntent, restorePendingIntent } from "../../lib/auth-intent";
import { notifyAuthChanged } from "../../lib/use-auth";
import { usePreferences } from "../../lib/use-preferences";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type LegalDocument = "terms" | "privacy" | "ai";

export function LoginScreen() {
  const router = useRouter();
  const { language } = usePreferences();
  const [phone, setPhone] = useState("13800138000");
  const [code, setCode] = useState("123456");
  const [challenge, setChallenge] = useState<SendCodeResponse | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [legal, setLegal] = useState<LegalDocument | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const text =
    language === "zh"
      ? {
          title: "注册 / 登录造梦空间",
          subtitle: "首次验证手机号将自动创建账号。",
          phone: "手机号",
          code: "验证码",
          send: "获取验证码",
          resend: "重新发送",
          agree: "我已阅读并同意",
          terms: "用户协议",
          privacy: "隐私政策",
          and: "和",
          ai: "AI 功能使用协议",
          submit: "注册 / 登录并继续",
          close: "关闭登录",
        }
      : {
          title: "Sign up / sign in to Dream Space",
          subtitle: "Your account is created after the first phone verification.",
          phone: "Mobile number",
          code: "Verification code",
          send: "Get code",
          resend: "Resend",
          agree: "I have read and agree to",
          terms: "Terms of Use",
          privacy: "Privacy Policy",
          and: "and",
          ai: "AI Terms",
          submit: "Sign up / sign in and continue",
          close: "Close sign in",
        };

  const returnTo = () => {
    const intent = readPendingIntent(window.sessionStorage);
    return intent && isSafeReturnTo(intent.returnTo) ? intent.returnTo : "/inspiration";
  };

  const sendCode = async () => {
    setError("");
    setSending(true);
    try {
      const response = await fetch(`${apiUrl}/auth/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = (await response.json()) as SendCodeResponse | { message?: string };
      if (!response.ok) throw new Error("message" in body ? body.message : undefined);
      setChallenge(body as SendCodeResponse);
      setCountdown((body as SendCodeResponse).retryAfterSeconds);
    } catch (requestError) {
      setError(
        (requestError as Error).message ||
          (language === "zh" ? "验证码发送失败" : "Unable to send code"),
      );
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge || !agreed) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          code,
          challengeId: challenge.challengeId,
          version: authAgreementVersion,
          termsAccepted: agreed,
          privacyAccepted: agreed,
          aiTermsAccepted: agreed,
        }),
      });
      const body = (await response.json()) as AuthSessionResponse | { message?: string };
      if (!response.ok) throw new Error("message" in body ? body.message : undefined);
      notifyAuthChanged();
      const restored = restorePendingIntent(window.sessionStorage);
      router.replace(restored ? `${restored.returnTo}?auth=resumed` : "/inspiration");
    } catch (requestError) {
      setError(
        (requestError as Error).message || (language === "zh" ? "登录失败" : "Sign-in failed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const legalTitle = {
    terms: language === "zh" ? "造梦空间用户协议" : "Dream Space Terms of Use",
    privacy: language === "zh" ? "造梦空间隐私政策" : "Dream Space Privacy Policy",
    ai: language === "zh" ? "AI 功能使用协议" : "AI Terms",
  };

  return (
    <main className="login-page">
      <section
        className="login-visual"
        aria-label={language === "zh" ? "造梦空间品牌视觉" : "Dream Space brand visual"}
      >
        <div className="login-scene" aria-hidden="true" />
        <div className="login-brand">
          <span className="brand-mark" />
          <span className="login-brand-copy">
            <strong>造梦空间 · Dream Space</strong>
            <small>AI IMAGE STUDIO</small>
          </span>
        </div>
        <div className="login-quote">
          <strong>
            {language === "zh"
              ? "让脑海里的画面，成为看得见的作品。"
              : "Make the images in your mind visible."}
          </strong>
          <span>CREATE BEYOND IMAGINATION · 2026</span>
        </div>
      </section>
      <section className="login-form-wrap">
        <button
          className="icon-btn login-close"
          type="button"
          aria-label={text.close}
          onClick={() => router.replace(returnTo())}
        >
          <X aria-hidden="true" />
        </button>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <h1>{text.title}</h1>
          <p className="login-subtitle">{text.subtitle}</p>
          <label className="form-label" htmlFor="phoneInput">
            {text.phone}
          </label>
          <input
            className="form-input"
            id="phoneInput"
            type="tel"
            value={phone}
            autoComplete="tel"
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
          />
          <label className="form-label" htmlFor="codeInput">
            {text.code}
          </label>
          <div className="code-row">
            <input
              className="form-input"
              id="codeInput"
              inputMode="numeric"
              value={code}
              autoComplete="one-time-code"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button
              className="action-btn"
              type="button"
              disabled={sending || countdown > 0 || !/^1[3-9]\d{9}$/.test(phone)}
              onClick={() => void sendCode()}
            >
              {sending ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : countdown > 0 ? (
                `${countdown}s`
              ) : challenge ? (
                text.resend
              ) : (
                text.send
              )}
            </button>
          </div>
          <label className="agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              {text.agree}{" "}
              <button className="agreement-link" type="button" onClick={() => setLegal("terms")}>
                {text.terms}
              </button>
              、
              <button className="agreement-link" type="button" onClick={() => setLegal("privacy")}>
                {text.privacy}
              </button>{" "}
              {text.and}{" "}
              <button className="agreement-link" type="button" onClick={() => setLegal("ai")}>
                {text.ai}
              </button>
              。
            </span>
          </label>
          <div className="login-error" role="alert">
            {error}
          </div>
          <button
            className="action-btn primary login-submit"
            type="submit"
            disabled={submitting || !challenge || code.length !== 6 || !agreed}
          >
            {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
            {text.submit}
          </button>
        </form>
      </section>
      {legal ? (
        <div
          className="legal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLegal(null);
          }}
        >
          <section
            className="legal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legalTitle"
          >
            <header className="legal-header">
              <h2 id="legalTitle">{legalTitle[legal]}</h2>
              <button
                className="icon-btn"
                type="button"
                aria-label={language === "zh" ? "关闭协议" : "Close terms"}
                onClick={() => setLegal(null)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="legal-content">
              <h3>一、协议范围</h3>
              <p>
                本协议适用于用户访问和使用造梦空间提供的 AI
                图片生成、灵感浏览及相关服务。用户使用服务前应完整阅读并理解本协议。
              </p>
              <h3>二、账号与使用规范</h3>
              <p>
                用户应提供真实、合法的注册信息并妥善保管账号。不得利用服务制作、上传或传播违法违规、侵权、欺诈、仇恨、色情或危害他人合法权益的内容。
              </p>
              <h3>三、输入与生成内容</h3>
              <p>
                用户应确保对上传的提示词、参考图片及其他素材拥有必要权利。AI
                生成结果具有不确定性，用户在公开发布或商业使用前应自行审核真实性、合法性和知识产权风险。
              </p>
              <h3>四、个人信息保护</h3>
              <p>
                平台仅在实现账号登录、任务处理、安全审计和服务改进所必要的范围内处理个人信息，并依据隐私政策提供访问、更正、删除和撤回授权渠道。
              </p>
              <h3>五、服务变更与责任</h3>
              <p>
                平台可能因模型升级、维护、安全风险或不可抗力调整服务。对可预见的重要变更将通过站内通知等合理方式告知用户。
              </p>
              <h3>六、联系我们</h3>
              <p>
                如对本协议、隐私保护或生成内容处理有疑问，可通过平台内反馈入口联系我们。协议版本：2026-07-31。
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
