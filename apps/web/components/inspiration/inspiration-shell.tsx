"use client";

import {
  Compass,
  LoaderCircle,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "../../lib/use-auth";
import { usePreferences, type Theme } from "../../lib/use-preferences";

const themeOrder: Theme[] = ["system", "light", "dark"];

export function InspirationShell({ children }: Readonly<{ children: ReactNode }>) {
  const { language, setLanguage, theme, setTheme } = usePreferences();
  const { session, loading, error, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length] ?? "system";
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const themeLabel =
    language === "zh"
      ? { system: "跟随系统", light: "浅色", dark: "深色" }[theme]
      : { system: "System theme", light: "Light theme", dark: "Dark theme" }[theme];
  const accountLabel = language === "zh" ? "账户" : "Account";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
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

  return (
    <div className="app-shell" data-language={language}>
      <aside
        className="primary-nav"
        aria-label={language === "zh" ? "主要导航" : "Primary navigation"}
      >
        <Link className="brand-mark" href="/inspiration" aria-label="Dream Space">
          <Sparkles aria-hidden="true" />
        </Link>
        <nav>
          <Link
            className="nav-action active"
            href="/inspiration"
            title={language === "zh" ? "灵感" : "Explore"}
          >
            <Compass aria-hidden="true" />
            <span>{language === "zh" ? "灵感" : "Explore"}</span>
          </Link>
          <button className="nav-action" type="button" disabled>
            <Plus aria-hidden="true" />
            <span>{language === "zh" ? "生成" : "Create"}</span>
          </button>
        </nav>
        <div className="nav-footer">
          <button
            className="icon-button"
            type="button"
            title={`${themeLabel} · ${language === "zh" ? "点击切换" : "Click to change"}`}
            aria-label={themeLabel}
            onClick={() => setTheme(nextTheme)}
          >
            <ThemeIcon aria-hidden="true" />
          </button>
          <button
            className="language-button"
            type="button"
            aria-label={language === "zh" ? "切换为英文" : "Switch to Chinese"}
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          >
            {language === "zh" ? "EN" : "中"}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={accountLabel}
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((value) => !value)}
          >
            <UserRound aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="mobile-tools">
        <button
          className="icon-button"
          type="button"
          aria-label={themeLabel}
          onClick={() => setTheme(nextTheme)}
        >
          <ThemeIcon aria-hidden="true" />
        </button>
        <button
          className="language-button"
          type="button"
          aria-label={language === "zh" ? "切换为英文" : "Switch to Chinese"}
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
        >
          {language === "zh" ? "EN" : "中"}
        </button>
      </div>

      <main className="workspace">{children}</main>
      <nav className="mobile-nav" aria-label={language === "zh" ? "移动导航" : "Mobile navigation"}>
        <Link className="mobile-nav-action active" href="/inspiration">
          <Compass aria-hidden="true" />
          <span>{language === "zh" ? "灵感" : "Explore"}</span>
        </Link>
        <button className="mobile-nav-action" type="button" disabled>
          <Plus aria-hidden="true" />
          <span>{language === "zh" ? "生成" : "Create"}</span>
        </button>
        <button
          className={`mobile-nav-action${accountOpen ? " active" : ""}`}
          type="button"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((value) => !value)}
        >
          <UserRound aria-hidden="true" />
          <span>{language === "zh" ? "我的" : "Account"}</span>
        </button>
      </nav>

      {accountOpen ? (
        <aside className="account-menu" aria-label={accountLabel}>
          <header>
            <div>
              <span>{accountLabel}</span>
              <strong>
                {session?.authenticated
                  ? session.user.phoneMasked
                  : language === "zh"
                    ? "访客模式"
                    : "Guest mode"}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setAccountOpen(false)}
              aria-label={language === "zh" ? "关闭账户菜单" : "Close account menu"}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="account-session-state">
            {loading ? (
              <>
                <LoaderCircle className="spin" aria-hidden="true" />
                <span>{language === "zh" ? "正在确认登录状态" : "Checking session"}</span>
              </>
            ) : error ? (
              <>
                <ShieldCheck aria-hidden="true" />
                <span>{language === "zh" ? "暂时无法确认登录状态" : "Session unavailable"}</span>
              </>
            ) : session?.authenticated ? (
              <>
                <ShieldCheck aria-hidden="true" />
                <span>{language === "zh" ? "安全会话已启用" : "Secure session active"}</span>
              </>
            ) : (
              <>
                <ShieldCheck aria-hidden="true" />
                <span>
                  {language === "zh"
                    ? "登录后可保存草稿与创作记录"
                    : "Sign in to save drafts and creations"}
                </span>
              </>
            )}
          </div>
          {session?.authenticated ? (
            <button
              className="account-primary-action"
              type="button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
            >
              {loggingOut ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {language === "zh" ? "退出登录" : "Sign out"}
            </button>
          ) : (
            <Link
              className="account-primary-action"
              href="/login"
              onClick={() => setAccountOpen(false)}
            >
              <LogIn aria-hidden="true" />
              {language === "zh" ? "登录造梦空间" : "Sign in to Dream Space"}
            </Link>
          )}
        </aside>
      ) : null}
    </div>
  );
}
