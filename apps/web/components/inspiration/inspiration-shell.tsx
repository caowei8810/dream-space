"use client";

import type { ReactNode } from "react";
import { Compass, Monitor, Moon, Plus, Settings, Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import { usePreferences, type Theme } from "../../lib/use-preferences";

const themeOrder: Theme[] = ["system", "light", "dark"];

export function InspirationShell({ children }: Readonly<{ children: ReactNode }>) {
  const { language, setLanguage, theme, setTheme } = usePreferences();
  const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length] ?? "system";
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const themeLabel =
    language === "zh"
      ? { system: "跟随系统", light: "浅色", dark: "深色" }[theme]
      : { system: "System theme", light: "Light theme", dark: "Dark theme" }[theme];

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
            disabled
            aria-label={language === "zh" ? "设置" : "Settings"}
          >
            <Settings aria-hidden="true" />
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
        <button className="mobile-nav-action" type="button" disabled>
          <Settings aria-hidden="true" />
          <span>{language === "zh" ? "我的" : "Account"}</span>
        </button>
      </nav>
    </div>
  );
}
