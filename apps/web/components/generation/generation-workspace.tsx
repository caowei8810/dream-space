"use client";

import {
  generationEventTypes,
  type GenerationOptionsResponse,
  type GenerationRatio,
  type GenerationResolution,
  type GenerationSessionDraft,
  type GenerationSessionDetail,
  type GenerationSessionSummary,
  type GenerationTaskResponse,
  type QuotaResponse,
} from "@dream-space/contracts";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consumeRestoredIntent, savePendingIntent } from "../../lib/auth-intent";
import { generationApi, generationApiUrl } from "../../lib/generation-api";
import { useAuth } from "../../lib/use-auth";
import { notifyQuotaChanged } from "../../lib/use-quota";
import { usePreferences } from "../../lib/use-preferences";

type Draft = GenerationSessionDraft;

const defaultDraft: Draft = {
  prompt: "",
  model: "image-4.7",
  ratio: "1:1",
  resolution: "2K",
  imageCount: 2,
  referenceImageUrls: [],
};

const starterPrompts = [
  {
    image: "/inspiration/portrait-03.webp",
    zh: "电影感都市人像，雨后街道与霓虹倒影，自然抓拍",
    en: "Cinematic urban portrait with wet streets, neon reflections and a candid mood",
  },
  {
    image: "/inspiration/photography-08.webp",
    zh: "雪山湖泊的黄金时刻，真实风光摄影，安静而辽阔",
    en: "A quiet alpine lake at golden hour, expansive and photorealistic",
  },
  {
    image: "/inspiration/design-01.webp",
    zh: "极简产品海报，透明材质与青绿色光影，精致排版",
    en: "Minimal product poster with transparent materials and refined teal lighting",
  },
] as const;

const terminalStatuses = new Set(["succeeded", "partially_succeeded", "failed", "cancelled"]);

function dimensions(ratio: GenerationRatio, resolution: GenerationResolution) {
  const values: Record<Exclude<GenerationRatio, "smart">, [number, number]> = {
    "21:9": [21, 9],
    "16:9": [16, 9],
    "3:2": [3, 2],
    "4:3": [4, 3],
    "1:1": [1, 1],
    "3:4": [3, 4],
    "2:3": [2, 3],
    "9:16": [9, 16],
  };
  const edge = resolution === "4K" ? 4096 : 2048;
  const [widthRatio, heightRatio] = ratio === "smart" ? [1, 1] : values[ratio];
  return widthRatio >= heightRatio
    ? [edge, Math.round((edge * heightRatio) / widthRatio)]
    : [Math.round((edge * widthRatio) / heightRatio), edge];
}

function taskMatches(
  task: GenerationTaskResponse,
  query: string,
  time: string,
  model: string,
  status: string,
) {
  const isToday = new Date(task.createdAt).toDateString() === new Date().toDateString();
  return (
    (!query || task.prompt.toLowerCase().includes(query.toLowerCase())) &&
    (time === "all" || (time === "today" && isToday)) &&
    (model === "all" || task.model === model) &&
    (status === "all" || task.status === status)
  );
}

export function GenerationWorkspace({ initialSessionId }: { initialSessionId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { language } = usePreferences();
  const { session, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchControlRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const draftSessionIdRef = useRef<string | null>(null);
  const [options, setOptions] = useState<GenerationOptionsResponse | null>(null);
  const [sessions, setSessions] = useState<GenerationSessionSummary[]>([]);
  const [detail, setDetail] = useState<GenerationSessionDetail | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [parameterOpen, setParameterOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [timeFilter, setTimeFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GenerationSessionSummary | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const text =
    language === "zh"
      ? {
          create: "开启创作",
          newSession: "新对话",
          searchAction: "搜索",
          emptyTitle: "让脑海里的画面，成为看得见的作品。",
          emptyCopy: "描述画面、选择参数并发送。会话只会在第一次提交时创建。",
          search: "搜索当前会话",
          allTime: "全部时间",
          today: "今天",
          allModels: "全部模型",
          allStatuses: "全部状态",
          prompt: "输入你想生成的画面，或上传参考图",
          imageGeneration: "图片生成",
          expected: "预计",
          credits: "点",
          ratio: "画面比例",
          resolution: "分辨率",
          count: "生成数量",
          rename: "重命名会话",
          remove: "删除会话",
          cancel: "取消生成",
          edit: "修改提示词",
          rerun: "再次生成",
          download: "下载图片",
          close: "关闭预览",
          confirmDelete: "确认删除",
          deleteCopy: "删除后，会话及其任务记录将无法恢复。",
          cancelAction: "取消",
          uploading: "正在添加参考图",
          quotaInsufficient: "额度不足，请减少图片数量或选择 2K。",
        }
      : {
          create: "Create",
          newSession: "New conversation",
          searchAction: "Search",
          emptyTitle: "Make the images in your mind visible.",
          emptyCopy:
            "Describe an image, choose parameters and send. A session is created on submit.",
          search: "Search current conversation",
          allTime: "All time",
          today: "Today",
          allModels: "All models",
          allStatuses: "All statuses",
          prompt: "Describe an image or upload a reference",
          imageGeneration: "Image generation",
          expected: "Est.",
          credits: "credits",
          ratio: "Aspect ratio",
          resolution: "Resolution",
          count: "Images",
          rename: "Rename conversation",
          remove: "Delete conversation",
          cancel: "Cancel generation",
          edit: "Edit prompt",
          rerun: "Generate again",
          download: "Download image",
          close: "Close preview",
          confirmDelete: "Delete conversation",
          deleteCopy: "The conversation and task history cannot be recovered.",
          cancelAction: "Cancel",
          uploading: "Adding reference",
          quotaInsufficient: "Not enough credits. Reduce image count or choose 2K.",
        };

  const loadSessions = useCallback(async () => {
    const response = await generationApi.sessions();
    setSessions(response.items);
    return response.items;
  }, []);

  const loadDetail = useCallback(async (sessionId: string) => {
    const response = await generationApi.session(sessionId);
    setDetail(response);
    return response;
  }, []);

  const loadQuota = useCallback(async () => {
    const response = await fetch(`${generationApiUrl}/generation/quota`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(`额度请求失败（${response.status}）`);
    const value = (await response.json()) as QuotaResponse;
    setQuota(value);
    return value;
  }, []);

  const persistCurrentDraft = useCallback(async () => {
    const sessionId = draftSessionIdRef.current;
    if (!sessionId) return;
    await generationApi.updateSessionDraft(sessionId, draft);
  }, [draft]);

  useEffect(() => {
    if (loading) return;
    if (!session?.authenticated) {
      savePendingIntent(window.sessionStorage, {
        returnTo: pathname,
        action: "resume",
        draft: {
          prompt: draft.prompt,
          model: draft.model,
          ratio: draft.ratio,
          resolution: draft.resolution,
          referenceImageUrl: draft.referenceImageUrls[0] ?? null,
        },
      });
      router.replace("/login");
      return;
    }

    let active = true;
    draftSessionIdRef.current = null;
    void Promise.all([generationApi.options(), loadSessions(), loadQuota()])
      .then(async ([generationOptions]) => {
        if (!active) return;
        setOptions(generationOptions);
        let nextDraft: Draft = {
          ...defaultDraft,
          model: generationOptions.models[0]?.id ?? defaultDraft.model,
          referenceImageUrls: [],
        };
        if (initialSessionId) {
          const nextDetail = await loadDetail(initialSessionId);
          nextDraft = nextDetail.draft ?? nextDraft;
          draftSessionIdRef.current = nextDetail.id;
        } else {
          setDetail(null);
        }
        const restored = consumeRestoredIntent(window.sessionStorage, pathname);
        if (restored?.draft) {
          nextDraft = {
            ...nextDraft,
            prompt: restored.draft.prompt,
            model: generationOptions.models.some((model) => model.id === restored.draft?.model)
              ? restored.draft.model
              : nextDraft.model,
            ratio: generationOptions.ratios.includes(restored.draft?.ratio as GenerationRatio)
              ? (restored.draft?.ratio as GenerationRatio)
              : nextDraft.ratio,
            resolution: generationOptions.resolutions.includes(
              restored.draft?.resolution as GenerationResolution,
            )
              ? (restored.draft?.resolution as GenerationResolution)
              : nextDraft.resolution,
            referenceImageUrls: restored.draft?.referenceImageUrl
              ? [restored.draft.referenceImageUrl]
              : [],
          };
        }
        setDraft(nextDraft);
      })
      .catch((requestError: Error) => active && setError(requestError.message))
      .finally(() => active && setLoadingPage(false));
    return () => {
      active = false;
    };
  }, [
    initialSessionId,
    loadDetail,
    loadQuota,
    loadSessions,
    loading,
    pathname,
    router,
    session?.authenticated,
  ]);

  useEffect(() => {
    const sessionId = draftSessionIdRef.current;
    if (!sessionId || detail?.id !== sessionId || loadingPage) return;
    const timer = window.setTimeout(() => {
      void generationApi
        .updateSessionDraft(sessionId, draft)
        .catch((requestError: Error) => setError(requestError.message));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [detail?.id, draft, loadingPage]);

  const activeTaskIds = useMemo(
    () =>
      detail?.tasks
        .filter((task) => !terminalStatuses.has(task.status))
        .map((task) => task.id)
        .join(",") ?? "",
    [detail?.tasks],
  );

  useEffect(() => {
    if (!detail?.id || !activeTaskIds) return;
    const sources = activeTaskIds.split(",").map((taskId) => {
      const source = new EventSource(`${generationApiUrl}/generation/tasks/${taskId}/events`, {
        withCredentials: true,
      });
      const refresh = () => {
        void generationApi.task(taskId).then((nextTask) => {
          setDetail((current) =>
            current
              ? {
                  ...current,
                  tasks: current.tasks.map((item) => (item.id === nextTask.id ? nextTask : item)),
                }
              : current,
          );
          if (terminalStatuses.has(nextTask.status)) {
            source.close();
            void loadSessions();
            void loadQuota();
            notifyQuotaChanged();
          }
        });
      };
      generationEventTypes.forEach((eventType) => source.addEventListener(eventType, refresh));
      return source;
    });
    return () => sources.forEach((source) => source.close());
  }, [activeTaskIds, detail?.id, loadQuota, loadSessions]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPreview(null);
      setParameterOpen(false);
      setSearchExpanded(false);
      setSearch("");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    if (!searchExpanded) return;
    searchInputRef.current?.focus();
    const collapse = (event: MouseEvent) => {
      if (searchControlRef.current?.contains(event.target as Node)) return;
      setSearchExpanded(false);
      setSearch("");
    };
    document.addEventListener("mousedown", collapse);
    return () => document.removeEventListener("mousedown", collapse);
  }, [searchExpanded]);

  useEffect(() => {
    if (!parameterOpen) return;
    const collapse = (event: PointerEvent) => {
      if (composerRef.current?.contains(event.target as Node)) return;
      setParameterOpen(false);
    };
    document.addEventListener("pointerdown", collapse);
    return () => document.removeEventListener("pointerdown", collapse);
  }, [parameterOpen]);

  const estimatedCost = draft.imageCount * (draft.resolution === "4K" ? 2 : 1);
  const size = dimensions(draft.ratio, draft.resolution);
  const expanded =
    !detail ||
    composerFocused ||
    parameterOpen ||
    draft.prompt.length > 0 ||
    draft.referenceImageUrls.length > 0;
  const visibleTasks = useMemo(
    () =>
      detail?.tasks.filter((task) =>
        taskMatches(task, search, timeFilter, modelFilter, statusFilter),
      ) ?? [],
    [detail?.tasks, modelFilter, search, statusFilter, timeFilter],
  );

  const submitDraft = async (nextDraft = draft) => {
    if (submitting || (!nextDraft.prompt.trim() && nextDraft.referenceImageUrls.length === 0))
      return;
    const cost = nextDraft.imageCount * (nextDraft.resolution === "4K" ? 2 : 1);
    if (quota && cost > quota.available) {
      setError(text.quotaInsufficient);
      return;
    }
    setSubmitting(true);
    setError("");
    setDraft((current) => ({ ...current, prompt: "", referenceImageUrls: [] }));
    try {
      const response = await generationApi.createTask({
        idempotencyKey: crypto.randomUUID(),
        sessionId: detail?.id ?? null,
        prompt:
          nextDraft.prompt.trim() || (language === "zh" ? "参考图创作" : "Reference creation"),
        model: nextDraft.model,
        ratio: nextDraft.ratio,
        resolution: nextDraft.resolution,
        imageCount: nextDraft.imageCount,
        referenceImageUrls: nextDraft.referenceImageUrls,
      });
      setQuota(response.quota);
      notifyQuotaChanged();
      await loadSessions();
      const nextDetail = await loadDetail(response.session.id);
      setDetail(nextDetail);
      if (pathname !== `/generate/${response.session.id}`) {
        router.replace(`/generate/${response.session.id}`);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const addReference = async (file: File) => {
    if (!options) return;
    setError("");
    if (draft.referenceImageUrls.length >= options.referenceImages.max) {
      setError(language === "zh" ? "最多添加 4 张参考图" : "Up to 4 references are allowed");
      return;
    }
    try {
      const result = await generationApi.uploadReference(file);
      setDraft((current) => ({
        ...current,
        referenceImageUrls: [...current.referenceImageUrls, result.url],
      }));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveRename = async () => {
    if (!renameId || !renameTitle.trim()) return;
    try {
      await generationApi.renameSession(renameId, renameTitle.trim());
      setRenameId(null);
      await loadSessions();
      if (detail?.id === renameId) await loadDetail(renameId);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const removeSession = async () => {
    if (!deleteTarget) return;
    try {
      await generationApi.deleteSession(deleteTarget.id);
      setDeleteTarget(null);
      const next = await loadSessions();
      if (detail?.id === deleteTarget.id) {
        setDetail(null);
        router.replace(next[0] ? `/generate/${next[0].id}` : "/generate");
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const openNewSession = async () => {
    try {
      await persistCurrentDraft();
      draftSessionIdRef.current = null;
      setDetail(null);
      setDraft({ ...defaultDraft, referenceImageUrls: [] });
      setSearch("");
      setSearchExpanded(false);
      setTimeFilter("all");
      setModelFilter("all");
      setStatusFilter("all");
      router.push("/generate");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const openSession = async (sessionId: string) => {
    if (detail?.id === sessionId) return;
    try {
      await persistCurrentDraft();
      router.push(`/generate/${sessionId}`);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const cancelTask = async (taskId: string) => {
    try {
      const task = await generationApi.cancelTask(taskId);
      setDetail((current) =>
        current
          ? { ...current, tasks: current.tasks.map((item) => (item.id === task.id ? task : item)) }
          : current,
      );
      await loadQuota();
      notifyQuotaChanged();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const downloadResult = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(text.download);
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  if (loading || loadingPage) {
    return (
      <main className="generation-loading">
        <LoaderCircle className="spin" aria-hidden="true" />
      </main>
    );
  }

  return (
    <main className={`generation-page${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="session-sidebar">
        <div className="sidebar-heading">
          <span>{text.create}</span>
          <button
            className="icon-btn sidebar-collapse"
            type="button"
            aria-label={language === "zh" ? "收起会话栏" : "Collapse conversations"}
            onClick={() => setSidebarCollapsed(true)}
          >
            <PanelLeftClose aria-hidden="true" />
          </button>
        </div>
        <button
          className="action-btn new-session"
          type="button"
          onClick={() => void openNewSession()}
        >
          <SquarePen aria-hidden="true" />
          {text.newSession}
        </button>
        <div className="session-list" aria-label={language === "zh" ? "会话列表" : "Conversations"}>
          {sessions.map((item) => (
            <div className={`session-row${detail?.id === item.id ? " active" : ""}`} key={item.id}>
              {item.thumbnailUrl ? (
                <span className="session-thumb">
                  <img src={item.thumbnailUrl} alt="" />
                </span>
              ) : null}
              {renameId === item.id ? (
                <input
                  className="session-name-input"
                  value={renameTitle}
                  aria-label={text.rename}
                  autoFocus
                  onChange={(event) => setRenameTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveRename();
                    if (event.key === "Escape") {
                      setRenameId(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="session-item"
                  type="button"
                  onClick={() => void openSession(item.id)}
                  onDoubleClick={() => {
                    setRenameId(item.id);
                    setRenameTitle(item.title);
                  }}
                >
                  {item.title}
                </button>
              )}
              {renameId === item.id ? (
                <div className="session-inline-actions">
                  <button
                    className="session-inline-action"
                    type="button"
                    aria-label={language === "zh" ? "保存改名" : "Save name"}
                    onClick={() => void saveRename()}
                  >
                    <Check aria-hidden="true" />
                  </button>
                  <button
                    className="session-inline-action"
                    type="button"
                    aria-label={text.cancelAction}
                    onClick={() => setRenameId(null)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="session-row-actions">
                  <button
                    className="session-row-action"
                    type="button"
                    aria-label={text.rename}
                    title={text.rename}
                    onClick={() => {
                      setRenameId(item.id);
                      setRenameTitle(item.title);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                  <button
                    className="session-row-action danger"
                    type="button"
                    aria-label={text.remove}
                    title={text.remove}
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <section className={`generation-main${detail ? "" : " is-empty"}`}>
        {sidebarCollapsed ? (
          <button
            className="icon-btn sidebar-expand"
            type="button"
            aria-label={language === "zh" ? "展开会话栏" : "Expand conversations"}
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftClose aria-hidden="true" />
          </button>
        ) : null}
        <header className="generation-top">
          <div
            ref={searchControlRef}
            className={`generation-search-control${searchExpanded ? " expanded" : ""}`}
          >
            {searchExpanded ? (
              <div className="generation-search-panel">
                <Search aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label={text.search}
                  value={search}
                  placeholder={text.search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button
                  className="icon-btn generation-search-clear"
                  type="button"
                  aria-label={language === "zh" ? "清空搜索" : "Clear search"}
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                className="field-btn generation-search-trigger"
                type="button"
                onClick={() => setSearchExpanded(true)}
              >
                <Search aria-hidden="true" />
                <span>{text.searchAction}</span>
              </button>
            )}
          </div>
          <select
            className="field-btn generation-filter"
            value={timeFilter}
            onChange={(event) => {
              setSearchExpanded(false);
              setSearch("");
              setTimeFilter(event.target.value);
            }}
          >
            <option value="all">{text.allTime}</option>
            <option value="today">{text.today}</option>
          </select>
          <select
            className="field-btn generation-filter"
            value={modelFilter}
            onChange={(event) => {
              setSearchExpanded(false);
              setSearch("");
              setModelFilter(event.target.value);
            }}
          >
            <option value="all">{text.allModels}</option>
            {options?.models.map((model) => (
              <option value={model.id} key={model.id}>
                {language === "zh" ? model.labelZh : model.labelEn}
              </option>
            ))}
          </select>
          <select
            className="field-btn generation-filter"
            value={statusFilter}
            onChange={(event) => {
              setSearchExpanded(false);
              setSearch("");
              setStatusFilter(event.target.value);
            }}
          >
            <option value="all">{text.allStatuses}</option>
            <option value="queued">{language === "zh" ? "排队中" : "Queued"}</option>
            <option value="generating">{language === "zh" ? "生成中" : "Generating"}</option>
            <option value="succeeded">{language === "zh" ? "已完成" : "Completed"}</option>
            <option value="failed">{language === "zh" ? "失败" : "Failed"}</option>
            <option value="cancelled">{language === "zh" ? "已取消" : "Cancelled"}</option>
          </select>
        </header>

        <div className="timeline">
          {!detail ? (
            <section className="empty-session">
              <h1>{text.emptyTitle}</h1>
              <p className="empty-session-copy">{text.emptyCopy}</p>
              <div className="starter-prompts">
                {starterPrompts.map((item) => (
                  <button
                    className="starter-prompt"
                    type="button"
                    key={item.zh}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        prompt: language === "zh" ? item.zh : item.en,
                      }))
                    }
                  >
                    <img src={item.image} alt="" />
                    <span>{language === "zh" ? item.zh : item.en}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : visibleTasks.length === 0 ? (
            <div className="generation-empty">
              {language === "zh" ? "当前筛选下没有任务" : "No tasks match these filters"}
            </div>
          ) : (
            <>
              <h1 className="date-heading">{detail.title}</h1>
              {visibleTasks.map((task) => (
                <article className="task" key={task.id}>
                  <div className="task-prompt">
                    {task.prompt}
                    <span className="task-params">
                      {task.model} · {task.ratio} · {task.resolution} · {task.imageCount}
                    </span>
                  </div>
                  {task.status === "queued" || task.status === "generating" ? (
                    <>
                      <div className="status-line processing">
                        <LoaderCircle className="spin" aria-hidden="true" />
                        {task.status === "queued"
                          ? language === "zh"
                            ? "正在排队"
                            : "Queued"
                          : language === "zh"
                            ? "正在生成，通常需要几十秒。"
                            : "Generating. This usually takes a few seconds."}
                      </div>
                      <div className="progress-bar">
                        <span />
                      </div>
                      <button
                        className="action-btn"
                        type="button"
                        onClick={() => void cancelTask(task.id)}
                      >
                        {text.cancel}
                      </button>
                    </>
                  ) : null}
                  {task.status === "failed" ? (
                    <div className="status-line error">
                      {task.errorMessage ||
                        (language === "zh"
                          ? "生成失败，额度已返还。"
                          : "Generation failed and credits were returned.")}
                    </div>
                  ) : null}
                  {task.status === "cancelled" ? (
                    <div className="status-line">
                      {language === "zh" ? "已取消，额度已返还。" : "Cancelled. Credits returned."}
                    </div>
                  ) : null}
                  {task.status === "succeeded" || task.status === "partially_succeeded" ? (
                    <>
                      <div className="status-line">
                        <CircleCheck aria-hidden="true" />
                        {language === "zh"
                          ? `${options?.externalServicesMode === "mock" ? "模拟生成完成" : "生成完成"} · 消耗 ${task.totalCost} 点额度`
                          : `${options?.externalServicesMode === "mock" ? "Mock completed" : "Completed"} · ${task.totalCost} credits used`}
                      </div>
                      <div
                        className="result-grid"
                        style={
                          {
                            "--mobile-result-columns": Math.min(task.results.length, 2),
                          } as React.CSSProperties
                        }
                      >
                        {task.results.map((result) => (
                          <div className="result-item" key={result.id}>
                            <button
                              className="result-preview"
                              type="button"
                              aria-label="预览图片"
                              onClick={() => setPreview(result.imageUrl)}
                            >
                              <img src={result.imageUrl} alt="生成结果" />
                            </button>
                            <button
                              className="result-download"
                              type="button"
                              aria-label={text.download}
                              onClick={() =>
                                void downloadResult(
                                  result.imageUrl,
                                  `dream-space-${result.id}.webp`,
                                )
                              }
                            >
                              <Download aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {terminalStatuses.has(task.status) ? (
                    <div className="task-actions">
                      <button
                        className="action-btn"
                        type="button"
                        onClick={() =>
                          setDraft({
                            prompt: task.prompt,
                            model: task.model,
                            ratio: task.ratio,
                            resolution: task.resolution,
                            imageCount: task.imageCount,
                            referenceImageUrls: task.referenceImageUrls,
                          })
                        }
                      >
                        {text.edit}
                      </button>
                      <button
                        className="action-btn"
                        type="button"
                        onClick={() =>
                          void submitDraft({
                            prompt: task.prompt,
                            model: task.model,
                            ratio: task.ratio,
                            resolution: task.resolution,
                            imageCount: task.imageCount,
                            referenceImageUrls: task.referenceImageUrls,
                          })
                        }
                      >
                        {text.rerun}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </>
          )}
        </div>

        <section
          ref={composerRef}
          className={`composer composer-shell${expanded ? " is-expanded" : ""}`}
          aria-label={text.imageGeneration}
        >
          {parameterOpen && options ? (
            <div className="parameter-popover">
              <div className="param-section">
                <div className="param-heading">
                  <span>{text.ratio}</span>
                  <span className="size-preview">
                    {size[0]} × {size[1]} px
                  </span>
                </div>
                <div className="option-grid">
                  {options.ratios.map((ratio) => (
                    <button
                      className={`option-btn${draft.ratio === ratio ? " active" : ""}`}
                      type="button"
                      key={ratio}
                      onClick={() => setDraft((current) => ({ ...current, ratio }))}
                    >
                      {ratio === "smart" ? (language === "zh" ? "智能" : "Smart") : ratio}
                    </button>
                  ))}
                </div>
              </div>
              <div className="param-section">
                <div className="param-heading">
                  <span>{text.resolution}</span>
                </div>
                <div className="option-grid resolution-grid">
                  {options.resolutions.map((resolution) => (
                    <button
                      className={`option-btn${draft.resolution === resolution ? " active" : ""}`}
                      type="button"
                      key={resolution}
                      onClick={() => setDraft((current) => ({ ...current, resolution }))}
                    >
                      {resolution}
                    </button>
                  ))}
                </div>
              </div>
              <div className="param-section">
                <div className="param-heading">
                  <span>{text.count}</span>
                </div>
                <div className="option-grid count-grid">
                  {Array.from({ length: options.imageCount.max }, (_, index) => index + 1).map(
                    (imageCount) => (
                      <button
                        className={`option-btn${draft.imageCount === imageCount ? " active" : ""}`}
                        type="button"
                        key={imageCount}
                        onClick={() => setDraft((current) => ({ ...current, imageCount }))}
                      >
                        {imageCount}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {draft.referenceImageUrls.length ? (
            <div className="ref-strip">
              {draft.referenceImageUrls.map((url, index) => (
                <div className="ref-item" key={`${url}-${index}`}>
                  <img className="ref-thumb" src={url} alt="参考图" />
                  <button
                    className="ref-remove"
                    type="button"
                    aria-label="删除参考图"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        referenceImageUrls: current.referenceImageUrls.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="prompt-row">
            <button
              className="upload-btn"
              type="button"
              aria-label="添加参考图"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                event.target.files?.[0] && void addReference(event.target.files[0])
              }
            />
            <textarea
              rows={1}
              value={draft.prompt}
              placeholder={text.prompt}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onChange={(event) =>
                setDraft((current) => ({ ...current, prompt: event.target.value }))
              }
            />
          </div>
          <div className="composer-footer">
            <span className="field-btn static-field">
              <ImageIcon aria-hidden="true" />
              {text.imageGeneration}
            </span>
            <select
              className="field-btn model-select"
              value={draft.model}
              onChange={(event) =>
                setDraft((current) => ({ ...current, model: event.target.value }))
              }
            >
              {options?.models.map((model) => (
                <option value={model.id} key={model.id}>
                  {language === "zh" ? model.labelZh : model.labelEn}
                </option>
              ))}
            </select>
            <button
              className="field-btn"
              type="button"
              aria-expanded={parameterOpen}
              onClick={() => setParameterOpen((value) => !value)}
            >
              <span>{draft.ratio}</span>
              <span>·</span>
              <span>{draft.resolution}</span>
              <span>·</span>
              <span>
                {draft.imageCount} {language === "zh" ? "张" : "images"}
              </span>
              {parameterOpen ? (
                <ChevronDown aria-hidden="true" />
              ) : (
                <ChevronUp aria-hidden="true" />
              )}
            </button>
            <span className="cost-label">
              {text.expected} {estimatedCost} {text.credits}
            </span>
            <button
              className="submit-btn"
              type="button"
              aria-label="提交生成"
              disabled={
                submitting ||
                (!draft.prompt.trim() && draft.referenceImageUrls.length === 0) ||
                Boolean(quota && estimatedCost > quota.available)
              }
              onClick={() => void submitDraft()}
            >
              {submitting ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </button>
          </div>
          {error ? (
            <div className="composer-error" role="alert">
              {error}
            </div>
          ) : null}
        </section>
      </section>

      {deleteTarget ? (
        <div
          className="legal-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}
        >
          <section className="confirm-dialog" role="dialog" aria-modal="true">
            <h2>{text.confirmDelete}</h2>
            <p>{deleteTarget.title}</p>
            <p>{text.deleteCopy}</p>
            <div className="confirm-actions">
              <button className="action-btn" type="button" onClick={() => setDeleteTarget(null)}>
                {text.cancelAction}
              </button>
              <button
                className="action-btn danger"
                type="button"
                onClick={() => void removeSession()}
              >
                {text.remove}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {preview ? (
        <div
          className="image-preview open"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => event.target === event.currentTarget && setPreview(null)}
        >
          <button
            className="icon-btn image-preview-close"
            type="button"
            aria-label={text.close}
            onClick={() => setPreview(null)}
          >
            <X aria-hidden="true" />
          </button>
          <img src={preview} alt="生成图片预览" />
          <button
            className="action-btn image-preview-download"
            type="button"
            onClick={() => void downloadResult(preview, "dream-space-result.webp")}
          >
            <Download aria-hidden="true" />
            {text.download}
          </button>
        </div>
      ) : null}
    </main>
  );
}
