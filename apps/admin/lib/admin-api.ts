import type {
  AdminGenerationTaskDetail,
  AdminGenerationTaskListResponse,
  AdminLoginRequest,
  AdminSessionResponse,
  SendCodeRequest,
  SendCodeResponse,
} from "@dream-space/contracts";

export const adminApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const webAppUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${adminApiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join("；") : payload?.message;
    throw new AdminApiError(message || `请求失败（${response.status}）`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface AdminTaskFilters {
  status?: string;
  model?: string;
  query?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  pageSize?: number;
}

export function resolveAdminAssetUrl(value: string) {
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  return new URL(value, webAppUrl).toString();
}

export const adminApi = {
  session: () => request<AdminSessionResponse>("/admin/auth/session"),
  sendCode: (input: SendCodeRequest) =>
    request<SendCodeResponse>("/admin/auth/codes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: AdminLoginRequest) =>
    request<AdminSessionResponse>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request<void>("/admin/auth/logout", { method: "POST" }),
  tasks: (filters: AdminTaskFilters) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminGenerationTaskListResponse>(`/admin/tasks?${search.toString()}`);
  },
  task: async (taskId: string) => {
    const task = await request<AdminGenerationTaskDetail>(`/admin/tasks/${taskId}`);
    return {
      ...task,
      results: task.results.map((result) => ({
        ...result,
        imageUrl: resolveAdminAssetUrl(result.imageUrl),
      })),
    };
  },
};
