"use client";

import {
  inspirationCategories,
  type InspirationCategory,
  type InspirationListResponse,
} from "@dream-space/contracts";
import { Heart, RefreshCw, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../../lib/use-preferences";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function InspirationGallery() {
  const { language } = usePreferences();
  const [category, setCategory] = useState<InspirationCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<InspirationListResponse | null>(null);
  const [error, setError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const firstSlug = useRef<string | null>(null);

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
        if (items.length > 1 && items[0]?.slug === firstSlug.current) {
          [items[0], items[1]] = [items[1]!, items[0]!];
        }
        firstSlug.current = items[0]?.slug ?? null;
        setResponse({ ...data, items });
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") setError(true);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [category, query, requestVersion]);

  const labels =
    language === "zh"
      ? {
          eyebrow: "DREAM SPACE · 灵感库",
          title: "今天，想创造什么？",
          subtitle: "从真实作品出发，找到画面、质感与表达的起点。",
          search: "搜索主题、风格或提示词",
          all: "推荐",
          empty: "没有找到相关灵感",
          emptyCopy: "尝试其他关键词，或切回推荐内容。",
          retry: "重新加载",
          recreate: "做同款",
          failed: "灵感暂时没有加载成功",
          works: "幅作品",
        }
      : {
          eyebrow: "DREAM SPACE · INSPIRATION",
          title: "What will you create today?",
          subtitle: "Start with a real work and discover a direction for mood, texture and form.",
          search: "Search themes, styles or prompts",
          all: "For you",
          empty: "No inspiration found",
          emptyCopy: "Try another keyword or return to the full collection.",
          retry: "Try again",
          recreate: "Recreate",
          failed: "Inspiration could not be loaded",
          works: "works",
        };

  return (
    <>
      <header className="inspiration-header">
        <div className="title-block">
          <span className="eyebrow">{labels.eyebrow}</span>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <label className="search-box">
          <Search aria-hidden="true" />
          <span className="sr-only">{labels.search}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.search}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={language === "zh" ? "清空搜索" : "Clear search"}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </header>

      <section
        className="catalog-toolbar"
        aria-label={language === "zh" ? "灵感分类" : "Inspiration categories"}
      >
        <div className="category-tabs" role="tablist">
          <button
            className={category === "all" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={category === "all"}
            onClick={() => setCategory("all")}
          >
            {labels.all}
          </button>
          {inspirationCategories.map((item) => (
            <button
              key={item.id}
              className={category === item.id ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {language === "zh" ? item.labelZh : item.labelEn}
            </button>
          ))}
        </div>
        <span className="result-count">{response ? `${response.total} ${labels.works}` : ""}</span>
      </section>

      {!response && !error ? (
        <section
          className="masonry-grid"
          aria-label={language === "zh" ? "正在加载灵感" : "Loading inspiration"}
        >
          {[0.72, 1.2, 0.82, 1, 0.68, 1.35, 0.9, 1.1].map((ratio, index) => (
            <div
              className="inspiration-skeleton"
              style={{ aspectRatio: ratio }}
              key={`${ratio}-${index}`}
            />
          ))}
        </section>
      ) : null}

      {error ? (
        <section className="catalog-state" role="alert">
          <Sparkles aria-hidden="true" />
          <h2>{labels.failed}</h2>
          <button type="button" onClick={() => setRequestVersion((value) => value + 1)}>
            <RefreshCw aria-hidden="true" />
            {labels.retry}
          </button>
        </section>
      ) : null}

      {response && response.items.length === 0 ? (
        <section className="catalog-state">
          <Search aria-hidden="true" />
          <h2>{labels.empty}</h2>
          <p>{labels.emptyCopy}</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            <X aria-hidden="true" />
            {labels.all}
          </button>
        </section>
      ) : null}

      {response && response.items.length > 0 ? (
        <section
          className="masonry-grid"
          aria-label={language === "zh" ? "灵感作品" : "Inspiration works"}
        >
          {response.items.map((item) => (
            <article className="inspiration-card" key={item.id}>
              <Link
                href={`/inspiration/${item.slug}`}
                aria-label={`${language === "zh" ? "打开作品" : "Open work"}: ${item.title}`}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  width={item.width}
                  height={item.height}
                  loading="lazy"
                />
                <span className="card-overlay">
                  <span className="card-copy">
                    <strong>{item.title}</strong>
                    <span>{item.authorDisplayName}</span>
                  </span>
                  <span className="card-actions">
                    <span>
                      <Heart aria-hidden="true" /> {item.likeCount}
                    </span>
                    <span className="recreate-action">{labels.recreate}</span>
                  </span>
                </span>
              </Link>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
