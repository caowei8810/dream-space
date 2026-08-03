"use client";

import {
  inspirationCategories,
  type InspirationCategory,
  type InspirationListResponse,
} from "@dream-space/contracts";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CloudSun,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../../lib/use-preferences";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function InspirationGallery() {
  const { language, setLanguage } = usePreferences();
  const [category, setCategory] = useState<InspirationCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<InspirationListResponse | null>(null);
  const [error, setError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const firstSlug = useRef<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("dream-space-search-history");
    if (saved) setHistory(JSON.parse(saved) as string[]);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const parameters = new URLSearchParams();
      if (category !== "all") parameters.set("category", category);
      if (query.trim()) parameters.set("q", query.trim());
      setError(false);
      try {
        const result = await fetch(`${apiUrl}/inspirations?${parameters}`, {
          signal: controller.signal,
        });
        if (!result.ok) throw new Error(`Request failed with ${result.status}`);
        const data = (await result.json()) as InspirationListResponse;
        const items = [...data.items];
        for (let index = items.length - 1; index > 0; index -= 1) {
          const randomIndex = Math.floor(Math.random() * (index + 1));
          [items[index], items[randomIndex]] = [items[randomIndex]!, items[index]!];
        }
        if (items.length > 1 && items[0]?.slug === firstSlug.current)
          [items[0], items[1]] = [items[1]!, items[0]!];
        firstSlug.current = items[0]?.slug ?? null;
        setResponse({ ...data, items });
        if (query.trim()) {
          setHistory((current) => {
            const next = [query.trim(), ...current.filter((item) => item !== query.trim())].slice(
              0,
              8,
            );
            window.localStorage.setItem("dream-space-search-history", JSON.stringify(next));
            return next;
          });
        }
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") setError(true);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [category, query, requestVersion]);

  const text =
    language === "zh"
      ? {
          recommended: "推荐",
          search: "搜索主题、风格或提示词",
          history: "搜索历史",
          clear: "清空",
          empty: "没有找到相关灵感",
          emptyCopy: "尝试其他关键词，或返回推荐内容。",
          reset: "返回推荐",
          failed: "灵感暂时没有加载成功",
          retry: "重新加载",
          same: "做同款",
          focus: "把想象变成看得见的作品。",
        }
      : {
          recommended: "For you",
          search: "Search themes, styles or prompts",
          history: "Search history",
          clear: "Clear",
          empty: "No inspiration found",
          emptyCopy: "Try another keyword or return to recommended works.",
          reset: "Back to For you",
          failed: "Inspiration could not be loaded",
          retry: "Try again",
          same: "Recreate",
          focus: "Turn imagination into visible work.",
        };
  const date = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <>
      <header className="toolbar">
        <button
          className={`category-btn${category === "all" ? " active" : ""}`}
          type="button"
          onClick={() => setCategory("all")}
        >
          {text.recommended}
        </button>
        {inspirationCategories.map((item) => (
          <button
            className={`category-btn${category === item.id ? " active" : ""}`}
            type="button"
            key={item.id}
            onClick={() => setCategory(item.id)}
          >
            {language === "zh" ? item.labelZh : item.labelEn}
          </button>
        ))}
        <div className="search-wrap">
          <Search aria-hidden="true" />
          <input
            className="search-input"
            value={query}
            placeholder={text.search}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              className="icon-btn search-clear"
              type="button"
              aria-label={text.clear}
              onClick={() => setQuery("")}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
          {searchOpen ? (
            <section
              className="search-history-panel"
              aria-label={text.history}
              onMouseLeave={() => setSearchOpen(false)}
            >
              <div className="search-history-header">
                <strong>{text.history}</strong>
                <button
                  className="action-btn search-history-clear"
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    window.localStorage.removeItem("dream-space-search-history");
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  <span>{text.clear}</span>
                </button>
              </div>
              <div className="search-history-list">
                {history.length ? (
                  history.map((item) => (
                    <button
                      className="search-history-chip"
                      type="button"
                      key={item}
                      onClick={() => {
                        setQuery(item);
                        setSearchOpen(false);
                      }}
                    >
                      {item}
                    </button>
                  ))
                ) : (
                  <span className="search-history-empty">
                    {language === "zh" ? "暂无搜索历史" : "No search history"}
                  </span>
                )}
              </div>
            </section>
          ) : null}
        </div>
        <div className="toolbar-end">
          <div
            className="utility-bar"
            aria-label={language === "zh" ? "工作台快捷信息" : "Workspace information"}
          >
            <button className="utility-button motivation-button" type="button">
              <Sparkles aria-hidden="true" />
              <span className="motivation-window">
                <span className="motivation-text">{text.focus}</span>
              </span>
            </button>
            <span className="utility-divider" aria-hidden="true" />
            <div className="utility-meta date-meta">
              <CalendarDays aria-hidden="true" />
              <span>{date}</span>
            </div>
            <div className="utility-meta" title={language === "zh" ? "演示天气" : "Demo weather"}>
              <CloudSun aria-hidden="true" />
              <span>{language === "zh" ? "深圳 29°" : "Shenzhen 29°"}</span>
            </div>
            <span className="utility-divider" aria-hidden="true" />
            <div className="language-control">
              <button
                className="utility-button language-trigger"
                type="button"
                aria-expanded={languageOpen}
                onClick={() => setLanguageOpen((value) => !value)}
              >
                <span className="language-flag">{language === "zh" ? "🇨🇳" : "🇺🇸"}</span>
                <span>{language === "zh" ? "ZH" : "EN"}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {languageOpen ? (
                <div className="language-menu" role="menu">
                  <button
                    className={`language-option${language === "en" ? " active" : ""}`}
                    type="button"
                    onClick={() => {
                      setLanguage("en");
                      setLanguageOpen(false);
                    }}
                  >
                    <span className="language-flag">🇺🇸</span>
                    <span>English</span>
                    <Check aria-hidden="true" />
                  </button>
                  <button
                    className={`language-option${language === "zh" ? " active" : ""}`}
                    type="button"
                    onClick={() => {
                      setLanguage("zh");
                      setLanguageOpen(false);
                    }}
                  >
                    <span className="language-flag">🇨🇳</span>
                    <span>中文</span>
                    <Check aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      {!response && !error ? (
        <section
          className="masonry"
          aria-label={language === "zh" ? "正在加载灵感" : "Loading inspiration"}
        >
          {[0.72, 1.2, 0.82, 1, 0.68, 1.35, 0.9, 1.1].map((ratio, index) => (
            <div
              className="art-skeleton"
              style={{ aspectRatio: ratio }}
              key={`${ratio}-${index}`}
            />
          ))}
        </section>
      ) : null}
      {error ? (
        <section className="empty-state" role="alert">
          <div>
            <Sparkles aria-hidden="true" />
            <strong>{text.failed}</strong>
            <br />
            <button
              className="action-btn"
              type="button"
              onClick={() => setRequestVersion((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" />
              {text.retry}
            </button>
          </div>
        </section>
      ) : null}
      {response && response.items.length === 0 ? (
        <section className="empty-state">
          <div>
            <strong>{text.empty}</strong>
            <span>{text.emptyCopy}</span>
            <br />
            <br />
            <button
              className="action-btn"
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              {text.reset}
            </button>
          </div>
        </section>
      ) : null}
      {response?.items.length ? (
        <section
          className="masonry"
          aria-label={language === "zh" ? "灵感作品" : "Inspiration works"}
        >
          {response.items.map((item) => (
            <Link className="art-card" href={`/inspiration/${item.slug}`} key={item.id}>
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                width={item.width}
                height={item.height}
                loading="lazy"
              />
              <span className="art-overlay">
                <span className="art-meta">
                  <span className="art-title">{item.title}</span>
                  <span className="art-author">{item.authorDisplayName}</span>
                </span>
                <span className="same-chip">{text.same}</span>
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}
