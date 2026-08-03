"use client";

import type {
  AuthIntent,
  InspirationDetail as InspirationDetailData,
  InspirationListResponse,
} from "@dream-space/contracts";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Ellipsis,
  Heart,
  Image,
  ImagePlus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  consumeRestoredIntent,
  createRecreateIntent,
  savePendingIntent,
} from "../../lib/auth-intent";
import { useAuth } from "../../lib/use-auth";
import { usePreferences } from "../../lib/use-preferences";
import { InspirationShell } from "./inspiration-shell";

export function InspirationDetail({
  inspiration,
}: Readonly<{ inspiration: InspirationDetailData }>) {
  const { language } = usePreferences();
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [composer, setComposer] = useState<"same" | "reference" | null>(null);
  const [prompt, setPrompt] = useState(inspiration.prompt);
  const initializedPath = useRef<string | null>(null);
  const [neighbors, setNeighbors] = useState<{ previous: string | null; next: string | null }>({
    previous: null,
    next: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/inspirations`, {
      signal: controller.signal,
    })
      .then((response) => response.json() as Promise<InspirationListResponse>)
      .then((response) => {
        const index = response.items.findIndex((item) => item.slug === inspiration.slug);
        setNeighbors({
          previous: index > 0 ? (response.items[index - 1]?.slug ?? null) : null,
          next:
            index >= 0 && index < response.items.length - 1
              ? (response.items[index + 1]?.slug ?? null)
              : null,
        });
      })
      .catch(() => setNeighbors({ previous: null, next: null }));
    return () => controller.abort();
  }, [inspiration.slug]);

  useEffect(() => {
    if (initializedPath.current === pathname) return;
    initializedPath.current = pathname;

    setPrompt(inspiration.prompt);
    setComposer(null);
    setLiked(false);
    setFollowing(false);

    const restored = consumeRestoredIntent(window.sessionStorage, pathname);
    if (restored?.draft) {
      setPrompt(restored.draft.prompt);
      setComposer(restored.draft.referenceImageUrl ? "reference" : "same");
    }
  }, [inspiration, pathname]);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(inspiration.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const intentFor = (withReference: boolean): AuthIntent => {
    const base = createRecreateIntent(inspiration, pathname);
    return {
      ...base,
      draft: base.draft
        ? { ...base.draft, prompt, referenceImageUrl: withReference ? inspiration.imageUrl : null }
        : null,
    };
  };

  const submit = () => {
    const intent = intentFor(composer === "reference");
    if (!session?.authenticated) {
      savePendingIntent(window.sessionStorage, intent);
      router.push("/login");
      return;
    }
    savePendingIntent(window.sessionStorage, intent);
  };

  const date = inspiration.publishedAt
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(inspiration.publishedAt))
    : "2026-07-31";
  const text =
    language === "zh"
      ? {
          close: "关闭详情",
          previous: "上一个作品",
          next: "下一个作品",
          follow: "+ 关注",
          followed: "已关注",
          like: "点赞",
          more: "更多",
          ai: "内容由 AI 生成",
          prompt: "图片提示词",
          same: "做同款",
          reference: "用作参考图",
          copy: "复制提示词",
          copied: "已复制",
          download: "下载图片",
          generate: "图片生成",
          submit: "提交生成",
        }
      : {
          close: "Close detail",
          previous: "Previous work",
          next: "Next work",
          follow: "+ Follow",
          followed: "Following",
          like: "Like",
          more: "More",
          ai: "AI-generated content",
          prompt: "Image prompt",
          same: "Recreate",
          reference: "Use as reference",
          copy: "Copy prompt",
          copied: "Copied",
          download: "Download image",
          generate: "Image generation",
          submit: "Submit generation",
        };

  return (
    <InspirationShell>
      <div className={`detail-layout${composer ? " has-detail-composer" : ""}`}>
        <section
          className="detail-stage"
          aria-label={language === "zh" ? "作品大图" : "Artwork image"}
        >
          <img
            className="detail-image"
            src={inspiration.imageUrl}
            alt={inspiration.title}
            width={inspiration.width}
            height={inspiration.height}
          />
          <Link className="icon-btn detail-close" href="/inspiration" aria-label={text.close}>
            <X aria-hidden="true" />
          </Link>
          <div className="pager">
            <button
              className="icon-btn"
              type="button"
              disabled={!neighbors.previous}
              aria-label={text.previous}
              onClick={() =>
                neighbors.previous && router.push(`/inspiration/${neighbors.previous}`)
              }
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button
              className="icon-btn"
              type="button"
              disabled={!neighbors.next}
              aria-label={text.next}
              onClick={() => neighbors.next && router.push(`/inspiration/${neighbors.next}`)}
            >
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
        </section>
        <aside className="detail-panel">
          <div className="author-line">
            <div className="avatar">{inspiration.authorDisplayName.slice(0, 1).toUpperCase()}</div>
            <strong>{inspiration.authorDisplayName}</strong>
            <button
              className={`follow-btn${following ? " active" : ""}`}
              type="button"
              onClick={() => setFollowing((value) => !value)}
            >
              {following ? text.followed : text.follow}
            </button>
            <div className="panel-actions">
              <button
                className={`icon-btn${liked ? " active" : ""}`}
                type="button"
                aria-label={text.like}
                onClick={() => setLiked((value) => !value)}
              >
                <Heart fill={liked ? "currentColor" : "none"} aria-hidden="true" />
              </button>
              <span>{inspiration.likeCount + (liked ? 1 : 0)}</span>
              <button className="icon-btn" type="button" aria-label={text.more}>
                <Ellipsis aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="detail-copy">{inspiration.title}</p>
          <p className="detail-date">
            {date} · {text.ai}
          </p>
          <div className="prompt-label">{text.prompt}</div>
          <p className="prompt-text">{inspiration.prompt}</p>
          <div className="param-line">
            <span>{inspiration.modelName}</span>
            <span>|</span>
            <span>{inspiration.ratio}</span>
            <span>|</span>
            <span>{inspiration.resolutionLabel}</span>
          </div>
          <div className="detail-actions">
            <button
              className="action-btn"
              type="button"
              onClick={() => {
                setPrompt(inspiration.prompt);
                setComposer("same");
              }}
            >
              <RefreshCw aria-hidden="true" />
              {text.same}
            </button>
            <button
              className="action-btn"
              type="button"
              onClick={() => {
                setPrompt(inspiration.prompt);
                setComposer("reference");
              }}
            >
              <ImagePlus aria-hidden="true" />
              {text.reference}
            </button>
            <button className="action-btn" type="button" onClick={() => void copyPrompt()}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? text.copied : text.copy}
            </button>
            <a className="action-btn" href={inspiration.imageUrl} download>
              <Download aria-hidden="true" />
              {text.download}
            </a>
          </div>
        </aside>
      </div>
      {composer ? (
        <section
          className="composer detail-composer"
          aria-label={language === "zh" ? "快捷生成器" : "Quick composer"}
        >
          {composer === "reference" ? (
            <div className="ref-strip">
              <span className="reference-thumb">
                <img src={inspiration.thumbnailUrl} alt="" />
                <button
                  type="button"
                  aria-label={language === "zh" ? "删除参考图" : "Remove reference"}
                  onClick={() => setComposer("same")}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            </div>
          ) : null}
          <div className="prompt-row">
            <button
              className="upload-btn"
              type="button"
              aria-label={language === "zh" ? "添加参考图" : "Add reference image"}
            >
              <Plus aria-hidden="true" />
            </button>
            <textarea
              aria-label={language === "zh" ? "提示词" : "Prompt"}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <div className="composer-footer">
            <button className="field-btn" type="button">
              <Image aria-hidden="true" />
              {text.generate}
            </button>
            <button className="field-btn" type="button">
              {inspiration.modelName}
            </button>
            <button className="field-btn" type="button">
              {inspiration.ratio}
            </button>
            <button className="field-btn" type="button">
              {inspiration.resolutionLabel}
            </button>
            <button
              className="submit-btn"
              type="button"
              disabled={!prompt.trim()}
              aria-label={text.submit}
              onClick={submit}
            >
              <ArrowUp aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}
    </InspirationShell>
  );
}
