"use client";

import type { InspirationDetail as InspirationDetailData } from "@dream-space/contracts";
import { ArrowLeft, Check, Copy, Heart, ImagePlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePreferences } from "../../lib/use-preferences";
import { InspirationShell } from "./inspiration-shell";

export function InspirationDetail({
  inspiration,
}: Readonly<{ inspiration: InspirationDetailData }>) {
  const { language } = usePreferences();
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(inspiration.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <InspirationShell>
      <div className="detail-layout">
        <section className="artwork-stage">
          <Link
            className="detail-back"
            href="/inspiration"
            aria-label={language === "zh" ? "返回灵感" : "Back to inspiration"}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
          <img
            src={inspiration.imageUrl}
            alt={inspiration.title}
            width={inspiration.width}
            height={inspiration.height}
          />
        </section>
        <aside className="detail-panel">
          <div className="detail-author">
            <span className="author-avatar">
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <strong>{inspiration.authorDisplayName}</strong>
              <span>{inspiration.sourceName}</span>
            </div>
          </div>
          <div className="detail-heading">
            <span className="ai-label">AI GENERATED</span>
            <h1>{inspiration.title}</h1>
          </div>
          <dl className="detail-metadata">
            <div>
              <dt>{language === "zh" ? "模型" : "Model"}</dt>
              <dd>{inspiration.modelName}</dd>
            </div>
            <div>
              <dt>{language === "zh" ? "比例" : "Ratio"}</dt>
              <dd>{inspiration.ratio}</dd>
            </div>
            <div>
              <dt>{language === "zh" ? "尺寸" : "Size"}</dt>
              <dd>{inspiration.resolutionLabel}</dd>
            </div>
            <div>
              <dt>{language === "zh" ? "喜欢" : "Likes"}</dt>
              <dd>
                <Heart aria-hidden="true" /> {inspiration.likeCount}
              </dd>
            </div>
          </dl>
          <section className="prompt-panel">
            <div className="prompt-heading">
              <h2>{language === "zh" ? "图片提示词" : "Image prompt"}</h2>
              <button type="button" onClick={() => void copyPrompt()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                <span>
                  {copied
                    ? language === "zh"
                      ? "已复制"
                      : "Copied"
                    : language === "zh"
                      ? "复制"
                      : "Copy"}
                </span>
              </button>
            </div>
            <p>{inspiration.prompt}</p>
          </section>
          <div className="detail-primary-actions">
            <button type="button" disabled>
              <Sparkles aria-hidden="true" />
              {language === "zh" ? "做同款" : "Recreate"}
            </button>
            <button type="button" disabled>
              <ImagePlus aria-hidden="true" />
              {language === "zh" ? "用作参考图" : "Use as reference"}
            </button>
          </div>
        </aside>
      </div>
    </InspirationShell>
  );
}
