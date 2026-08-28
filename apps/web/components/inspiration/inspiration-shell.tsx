"use client";

import {
  BadgeCheck,
  Bell,
  ChevronRight,
  FileText,
  House,
  LoaderCircle,
  LogIn,
  LogOut,
  ScrollText,
  ShieldCheck,
  Settings,
  Sparkles,
  SunMoon,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/use-auth";
import { useQuota } from "../../lib/use-quota";
import { usePreferences, type Theme } from "../../lib/use-preferences";

const themeLabels: Record<Theme, { zh: string; en: string }> = {
  system: { zh: "跟随系统", en: "System" },
  light: { zh: "浅色", en: "Light" },
  dark: { zh: "深色", en: "Dark" },
};

export function InspirationShell({
  children,
  activePage = "inspiration",
}: Readonly<{ children: ReactNode; activePage?: "inspiration" | "generate" }>) {
  const { language, theme, setTheme } = usePreferences();
  const { session, loading, logout } = useAuth();
  const quota = useQuota(session?.authenticated === true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && menuRef.current?.contains(event.target as Node)) return;
      setAccountOpen(false);
      setThemeOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setAccountOpen(false);
    } finally {
      setLoggingOut(false);
    }
  };

  const text =
    language === "zh"
      ? {
          inspiration: "灵感",
          generate: "生成",
          mine: "我的",
          notification: "通知",
          settings: "设置",
          legal: "平台协议",
          privacy: "隐私与数据",
          changelog: "更新日志",
          appearance: "外观",
          watermark: "AI 水印",
          login: "登录",
          logout: "退出登录",
          quota: "创作额度",
          cycle: "本周期剩余",
          remaining: `剩余 ${quota.remainingPercent}%`,
          cost: "每张预计 1 点",
        }
      : {
          inspiration: "Explore",
          generate: "Create",
          mine: "Account",
          notification: "Notifications",
          settings: "Settings",
          legal: "Platform terms",
          privacy: "Privacy and data",
          changelog: "Changelog",
          appearance: "Appearance",
          watermark: "AI watermark",
          login: "Sign in",
          logout: "Sign out",
          quota: "Creation quota",
          cycle: "Remaining this cycle",
          remaining: `${quota.remainingPercent}% remaining`,
          cost: "About 1 credit per image",
        };

  return (
    <div className="app" data-language={language}>
      <nav className="primary-nav" aria-label={language === "zh" ? "主导航" : "Primary navigation"}>
        <Link className="brand-mark" href="/inspiration" aria-label="返回灵感" />
        <div className="nav-stack">
          <Link
            className={`nav-btn${activePage === "inspiration" ? " active" : ""}`}
            href="/inspiration"
          >
            <House aria-hidden="true" />
            <span>{text.inspiration}</span>
          </Link>
          <Link className={`nav-btn${activePage === "generate" ? " active" : ""}`} href="/generate">
            <Sparkles aria-hidden="true" />
            <span>{text.generate}</span>
          </Link>
          <Link className="nav-btn mobile-only" href="/login">
            <UserRound aria-hidden="true" />
            <span>{text.mine}</span>
          </Link>
        </div>
        <div className="nav-spacer" />
        <div className="desktop-dock">
          <button
            className="dock-icon dock-tooltip"
            type="button"
            aria-label={text.notification}
            data-tooltip={text.notification}
          >
            <Bell aria-hidden="true" />
          </button>
          <div className="dock-divider" />
          <button
            className={`account-avatar dock-tooltip${session?.authenticated ? " logged-in" : ""}`}
            type="button"
            aria-label={text.settings}
            aria-expanded={accountOpen}
            data-tooltip={text.settings}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setAccountOpen((value) => !value)}
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
      </nav>

      {accountOpen ? (
        <section
          className="account-menu"
          ref={menuRef}
          aria-label={language === "zh" ? "账户与设置" : "Account and settings"}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button className="menu-row" type="button" onClick={() => setLegalOpen(true)}>
            <FileText aria-hidden="true" />
            {text.legal}
            <ChevronRight className="menu-end" aria-hidden="true" />
          </button>
          {session?.authenticated ? (
            <Link
              className="menu-row"
              href="/account/privacy"
              onClick={() => setAccountOpen(false)}
            >
              <ShieldCheck aria-hidden="true" />
              {text.privacy}
              <ChevronRight className="menu-end" aria-hidden="true" />
            </Link>
          ) : null}
          <button className="menu-row" type="button">
            <ScrollText aria-hidden="true" />
            {text.changelog}
            <span className="menu-end">v0.1</span>
          </button>
          <button
            className="menu-row"
            type="button"
            aria-expanded={themeOpen}
            onClick={() => setThemeOpen((value) => !value)}
          >
            <SunMoon aria-hidden="true" />
            {text.appearance}
            <span className="menu-end">{themeLabels[theme][language]}</span>
          </button>
          {themeOpen ? (
            <div className="theme-options">
              {(["system", "light", "dark"] as Theme[]).map((item) => (
                <button
                  className={`menu-row${theme === item ? " active" : ""}`}
                  type="button"
                  key={item}
                  onClick={() => setTheme(item)}
                >
                  {themeLabels[item][language]}
                </button>
              ))}
            </div>
          ) : null}
          <label className="menu-row">
            <BadgeCheck aria-hidden="true" />
            {text.watermark}
            <input
              className="menu-switch"
              type="checkbox"
              checked={watermark}
              onChange={(event) => setWatermark(event.target.checked)}
            />
          </label>
          {session?.authenticated ? (
            <section
              className={`quota-panel${quota.remainingPercent <= 10 ? " is-critical" : quota.remainingPercent <= 30 ? " is-low" : ""}`}
              aria-label={
                language === "zh"
                  ? `剩余 ${quota.available} / ${quota.total} 点额度`
                  : `${quota.available} of ${quota.total} credits remaining`
              }
            >
              <div className="quota-heading">
                <Sparkles aria-hidden="true" />
                <span className="quota-title">
                  <strong>{text.quota}</strong>
                  <small>{text.cycle}</small>
                </span>
                <strong className="quota-value">
                  {quota.available} / {quota.total}
                </strong>
              </div>
              <div className="quota-track" aria-hidden="true">
                <span style={{ width: `${quota.remainingPercent}%` }} />
              </div>
              <div className="quota-meta">
                <span>{text.remaining}</span>
                <span>{text.cost}</span>
              </div>
            </section>
          ) : null}
          {session?.authenticated ? (
            <button
              className="menu-row"
              type="button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
            >
              {loggingOut ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              <span>{text.logout}</span>
            </button>
          ) : (
            <Link className="menu-row" href="/login">
              <LogIn aria-hidden="true" />
              <span>{loading ? "..." : text.login}</span>
            </Link>
          )}
          <div className="menu-footer">
            造梦空间 Dream Space
            <br />
            让每一次生成都可控、可追溯。
          </div>
        </section>
      ) : null}
      {legalOpen ? (
        <div
          className="legal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLegalOpen(false);
          }}
        >
          <section
            className="legal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="platformLegalTitle"
          >
            <header className="legal-header">
              <h2 id="platformLegalTitle">造梦空间用户协议</h2>
              <button
                className="icon-btn"
                type="button"
                aria-label="关闭协议"
                onClick={() => setLegalOpen(false)}
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
      <main className="page">{children}</main>
    </div>
  );
}
