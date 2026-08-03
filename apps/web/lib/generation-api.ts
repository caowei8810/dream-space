import type {
  CreateGenerationTaskRequest,
  CreateGenerationTaskResponse,
  CreateMockReferenceRequest,
  CreateMockReferenceResponse,
  GenerationOptionsResponse,
  GenerationSessionDraft,
  GenerationSessionDetail,
  GenerationSessionListResponse,
  GenerationTaskResponse,
} from "@dream-space/contracts";

export const generationApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${generationApiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join("；") : body.message;
    throw new Error(message || `请求失败（${response.status}）`);
  }
  return body;
}

export const generationApi = {
  options: () => request<GenerationOptionsResponse>("/generation/options"),
  sessions: () => request<GenerationSessionListResponse>("/generation/sessions"),
  session: (sessionId: string) =>
    request<GenerationSessionDetail>(`/generation/sessions/${sessionId}`),
  renameSession: (sessionId: string, title: string) =>
    request<GenerationSessionDetail>(`/generation/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  updateSessionDraft: (sessionId: string, draft: GenerationSessionDraft) =>
    request<GenerationSessionDetail>(`/generation/sessions/${sessionId}/draft`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    }),
  deleteSession: (sessionId: string) =>
    request<void>(`/generation/sessions/${sessionId}`, { method: "DELETE" }),
  createTask: (input: CreateGenerationTaskRequest) =>
    request<CreateGenerationTaskResponse>("/generation/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  task: (taskId: string) => request<GenerationTaskResponse>(`/generation/tasks/${taskId}`),
  cancelTask: (taskId: string) =>
    request<GenerationTaskResponse>(`/generation/tasks/${taskId}/cancel`, { method: "POST" }),
  mockReference: (input: CreateMockReferenceRequest) =>
    request<CreateMockReferenceResponse>("/generation/references/mock", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
