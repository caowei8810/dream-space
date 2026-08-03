"use client";

import {
  authAgreementVersion,
  type AuthSessionResponse,
  type SendCodeResponse,
} from "@dream-space/contracts";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
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
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<SendCodeResponse | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [legal, setLegal] = useState<LegalDocument | null>(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const labels =
    language === "zh"
      ? {
          title: "登录造梦空间",
          subtitle: "登录后继续你的图片创作，草稿和来源会为你保留。",
          phone: "手机号",
          phonePlaceholder: "请输入 11 位手机号",
          code: "验证码",
          codePlaceholder: "请输入 6 位验证码",
          send: "获取验证码",
          resend: "重新发送",
          demo: "演示验证码",
          agree: "我已阅读并同意",
          terms: "用户协议",
          privacy: "隐私政策",
          ai: "AI 功能使用协议",
          submit: "登录并继续",
          back: "返回",
          secure: "安全会话由服务器签发，登录不会自动提交任务。",
        }
      : {
          title: "Sign in to Dream Space",
          subtitle: "Continue creating with your source and draft preserved.",
          phone: "Mobile number",
          phonePlaceholder: "Enter an 11-digit number",
          code: "Verification code",
          codePlaceholder: "Enter the 6-digit code",
          send: "Get code",
          resend: "Resend",
          demo: "Demo code",
          agree: "I have read and agree to the",
          terms: "Terms of Use",
          privacy: "Privacy Policy",
          ai: "AI Terms",
          submit: "Sign in and continue",
          back: "Back",
          secure: "The server issues a secure session. Signing in never submits a task.",
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

  const legalCopy = {
    terms: language === "zh" ? "用户协议" : "Terms of Use",
    privacy: language === "zh" ? "隐私政策" : "Privacy Policy",
    ai: language === "zh" ? "AI 功能使用协议" : "AI Terms",
  };

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <img src="/inspiration/photography-08.webp" alt="" />
        <div className="login-brand">
          <Sparkles />
          <strong>DREAM SPACE</strong>
          <span>
            {language === "zh"
              ? "让每一个想象，都有清晰的起点。"
              : "Give every idea a clear beginning."}
          </span>
        </div>
      </section>
      <section className="login-form-area">
        <button
          className="login-back"
          type="button"
          onClick={() => router.replace(returnTo())}
          aria-label={labels.back}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <div className="login-logo">
            <Sparkles aria-hidden="true" />
          </div>
          <h1>{labels.title}</h1>
          <p className="login-subtitle">{labels.subtitle}</p>

          <label className="auth-field">
            <span>{labels.phone}</span>
            <div className="phone-field">
              <strong>+86</strong>
              <input
                value={phone}
                inputMode="numeric"
                autoComplete="tel"
                maxLength={13}
                placeholder={labels.phonePlaceholder}
                onChange={(event) => setPhone(event.target.value.replace(/[^\d\s]/g, ""))}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>{labels.code}</span>
            <div className="code-field">
              <input
                value={code}
                type={showCode ? "text" : "password"}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder={labels.codePlaceholder}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
              <button
                type="button"
                className="code-visibility"
                onClick={() => setShowCode((value) => !value)}
                aria-label={showCode ? "Hide code" : "Show code"}
              >
                {showCode ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="send-code"
                disabled={sending || countdown > 0 || !/^1[3-9]\d(?:\s?\d){8}$/.test(phone)}
                onClick={() => void sendCode()}
              >
                {sending ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : countdown > 0 ? (
                  `${countdown}s`
                ) : challenge ? (
                  labels.resend
                ) : (
                  labels.send
                )}
              </button>
            </div>
          </label>

          {challenge ? (
            <p className="demo-code">
              <Check aria-hidden="true" /> {labels.demo}: <strong>{challenge.demoCode}</strong>
            </p>
          ) : null}

          <label className="agreement-row">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              {labels.agree}{" "}
              <button type="button" onClick={() => setLegal("terms")}>
                {labels.terms}
              </button>
              、
              <button type="button" onClick={() => setLegal("privacy")}>
                {labels.privacy}
              </button>{" "}
              {language === "zh" ? "和" : "and"}{" "}
              <button type="button" onClick={() => setLegal("ai")}>
                {labels.ai}
              </button>
            </span>
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="login-submit"
            type="submit"
            disabled={submitting || !challenge || code.length !== 6 || !agreed}
          >
            {submitting ? (
              <LoaderCircle className="spin" aria-hidden="true" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            {labels.submit}
          </button>
          <p className="security-note">
            <ShieldCheck aria-hidden="true" /> {labels.secure}
          </p>
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
            aria-labelledby="legal-title"
          >
            <header>
              <h2 id="legal-title">{legalCopy[legal]}</h2>
              <button
                type="button"
                onClick={() => setLegal(null)}
                aria-label={language === "zh" ? "关闭" : "Close"}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="legal-content">
              <p>
                {language === "zh"
                  ? "本演示环境仅用于验证造梦空间的登录与创作流程。请勿输入真实敏感信息。"
                  : "This demo environment validates Dream Space sign-in and creation flows. Do not enter sensitive personal information."}
              </p>
              <h3>{language === "zh" ? "使用原则" : "Usage principles"}</h3>
              <p>
                {language === "zh"
                  ? "你应确保上传内容和提示词具有合法来源，不侵犯他人权益，不用于违法、有害或欺骗性用途。"
                  : "You must have lawful rights to submitted content and prompts, and must not use the service for illegal, harmful, or deceptive purposes."}
              </p>
              <h3>{language === "zh" ? "数据与 AI 说明" : "Data and AI notice"}</h3>
              <p>
                {language === "zh"
                  ? "正式环境将按隐私政策处理账户、草稿和生成记录，并对 AI 生成内容进行必要标识。当前阶段使用固定演示验证码，不发送短信。"
                  : "The production service will process account, draft, and generation records under the privacy policy and label AI-generated content as required. This stage uses a fixed demo code and sends no SMS."}
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
