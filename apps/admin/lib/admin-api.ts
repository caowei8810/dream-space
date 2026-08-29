import type {
  AdminAccountActionInput,
  AdminAccountCreateInput,
  AdminAccountListResponse,
  AdminAccountRecord,
  AdminAccountUpdateInput,
  AdminDashboardSummary,
  AdminRoleActionInput,
  AdminRoleCreateInput,
  AdminRoleListResponse,
  AdminRoleRecord,
  AdminRoleUpdateInput,
  AdminUserListResponse,
  AdminUserRecord,
  AdminUserStatusInput,
  AdminRiskRuleCreateInput,
  AdminRiskRuleActionInput,
  AdminRiskRuleListResponse,
  AdminRiskHitListResponse,
  AdminModerationDecisionInput,
  AdminBillingRuleCreateInput,
  AdminBillingPromotionCreateInput,
  AdminBillingRuleListResponse,
  AdminBillingOrderListResponse,
  AdminPlanCreateInput,
  AdminPlanListResponse,
  AdminRedemptionCodeBatchCreateInput,
  AdminRedemptionCodeBatchCreateResponse,
  AdminRedemptionCodeListResponse,
  AdminModerationReviewListResponse,
  AdminModerationAppealListResponse,
  AdminGenerationTaskDetail,
  AdminGenerationTaskListResponse,
  AdminQuotaReconciliationResponse,
  AdminInspirationCandidateListResponse,
  AdminInspirationListResponse,
  AdminInspirationRecord,
  AdminAuditLogListResponse,
  AdminModelCreateInput,
  AdminModelRecord,
  AdminModelListResponse,
  AdminModelVersionInput,
  AdminProviderUpdateInput,
  AdminProviderCreateInput,
  AdminProviderRecord,
  AdminProviderHealthCheckResult,
  AdminProviderModelOption,
  AdminModelRouteUpdateInput,
  AdminPrivacyRequestListResponse,
  AdminPrivacyCleanupInput,
  AdminPrivacyCleanupResponse,
  AdminLoginRequest,
  AdminSessionResponse,
  SendCodeRequest,
  SendCodeResponse,
  RefundCreateInput,
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

export interface AdminInspirationFilters {
  status?: string;
  category?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminAccountFilters {
  query?: string;
  status?: string;
  roleId?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminUserFilters {
  query?: string;
  status?: string;
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
  dashboardSummary: () => request<AdminDashboardSummary>("/admin/dashboard/summary"),
  roles: () => request<AdminRoleListResponse>("/admin/roles"),
  auditLogs: (
    filters: {
      action?: string;
      resourceType?: string;
      actor?: string;
      requestId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminAuditLogListResponse>(`/admin/audit/logs?${search.toString()}`);
  },
  role: (id: string) => request<AdminRoleRecord>(`/admin/roles/${id}`),
  createRole: (input: AdminRoleCreateInput) =>
    request<AdminRoleRecord>("/admin/roles", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRole: (id: string, input: AdminRoleUpdateInput) =>
    request<AdminRoleRecord>(`/admin/roles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteRole: (id: string, input: AdminRoleActionInput) =>
    request<void>(`/admin/roles/${id}`, {
      method: "DELETE",
      body: JSON.stringify(input),
    }),
  users: (filters: AdminUserFilters) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminUserListResponse>(`/admin/users?${search.toString()}`);
  },
  user: (id: string) => request<AdminUserRecord>(`/admin/users/${id}`),
  restrictUser: (id: string, input: AdminUserStatusInput) =>
    request<AdminUserRecord>(`/admin/users/${id}/restrict`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  banUser: (id: string, input: AdminUserStatusInput) =>
    request<AdminUserRecord>(`/admin/users/${id}/ban`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  activateUser: (id: string, input: AdminUserStatusInput) =>
    request<AdminUserRecord>(`/admin/users/${id}/activate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeUserSessions: (id: string, input: AdminUserStatusInput) =>
    request<{ revokedSessionCount: number }>(`/admin/users/${id}/revoke-sessions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  riskRules: () => request<AdminRiskRuleListResponse>("/admin/risk/rules"),
  riskHits: (filters: { status?: string; page?: number; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminRiskHitListResponse>(`/admin/risk/hits?${search.toString()}`);
  },
  createRiskRule: (input: AdminRiskRuleCreateInput) =>
    request<AdminRiskRuleListResponse["items"][number]>("/admin/risk/rules", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  publishRiskRule: (id: string, input: AdminRiskRuleActionInput) =>
    request<AdminRiskRuleListResponse["items"][number]>(`/admin/risk/rules/${id}/publish`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  archiveRiskRule: (id: string, input: AdminRiskRuleActionInput) =>
    request<AdminRiskRuleListResponse["items"][number]>(`/admin/risk/rules/${id}/archive`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  moderationReviews: (filters: { status?: string; page?: number; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminModerationReviewListResponse>(
      `/admin/moderation/reviews?${search.toString()}`,
    );
  },
  claimModerationReview: (id: string) =>
    request(`/admin/moderation/reviews/${id}/claim`, { method: "POST" }),
  decideModerationReview: (id: string, input: AdminModerationDecisionInput) =>
    request(`/admin/moderation/reviews/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  moderationAppeals: () => request<AdminModerationAppealListResponse>("/admin/moderation/appeals"),
  decideModerationAppeal: (id: string, input: AdminModerationDecisionInput) =>
    request(`/admin/moderation/appeals/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  adminAccounts: (filters: AdminAccountFilters) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminAccountListResponse>(`/admin/admin-users?${search.toString()}`);
  },
  adminAccount: (id: string) => request<AdminAccountRecord>(`/admin/admin-users/${id}`),
  createAdminAccount: (input: AdminAccountCreateInput) =>
    request<AdminAccountRecord>("/admin/admin-users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  billingRules: () => request<AdminBillingRuleListResponse>("/admin/billing/rules"),
  billingOrders: (filters: {
    page?: number;
    pageSize?: number;
    status?: string;
    query?: string;
  }) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminBillingOrderListResponse>(`/admin/billing/orders?${search.toString()}`);
  },
  redemptionCodes: (filters: { page?: number; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, String(value));
    });
    return request<AdminRedemptionCodeListResponse>(
      `/admin/billing/redemption-codes?${search.toString()}`,
    );
  },
  createRedemptionCodes: (input: AdminRedemptionCodeBatchCreateInput) =>
    request<AdminRedemptionCodeBatchCreateResponse>("/admin/billing/redemption-codes/batches", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  disableRedemptionCode: (id: string, input: { reason: string }) =>
    request(`/admin/billing/redemption-codes/${id}/disable`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  refundBillingOrder: (id: string, input: Omit<RefundCreateInput, "orderId">) =>
    request(`/admin/billing/orders/${id}/refund`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  models: () => request<AdminModelListResponse>("/admin/models"),
  createProvider: (input: AdminProviderCreateInput) =>
    request("/admin/models/providers", { method: "POST", body: JSON.stringify(input) }),
  updateProvider: (id: string, input: AdminProviderUpdateInput) =>
    request<AdminProviderRecord>(`/admin/models/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  checkProviderHealth: (id: string, reason: string) =>
    request<AdminProviderHealthCheckResult>(`/admin/models/providers/${id}/health-check`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  providerModels: (id: string) =>
    request<{ items: AdminProviderModelOption[] }>(`/admin/models/providers/${id}/models`),
  updateModelRoute: (modelId: string, providerId: string, input: AdminModelRouteUpdateInput) =>
    request<AdminModelRecord>(`/admin/models/${modelId}/routes/${providerId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  createModel: (input: AdminModelCreateInput) =>
    request("/admin/models", { method: "POST", body: JSON.stringify(input) }),
  createModelVersion: (id: string, input: AdminModelVersionInput) =>
    request(`/admin/models/${id}/versions`, { method: "POST", body: JSON.stringify(input) }),
  publishModel: (id: string, version: number, reason: string) =>
    request(`/admin/models/${id}/publish?version=${version}`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  rollbackModel: (id: string, reason: string) =>
    request(`/admin/models/${id}/rollback`, { method: "POST", body: JSON.stringify({ reason }) }),
  privacyRequests: (filters: { page?: number; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) search.set(key, String(value));
    });
    return request<AdminPrivacyRequestListResponse>(`/admin/privacy/requests?${search.toString()}`);
  },
  completePrivacyRequest: (id: string, input: { reason: string; decisionNote?: string }) =>
    request(`/admin/privacy/requests/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cleanupPrivacyUploads: (input: AdminPrivacyCleanupInput) =>
    request<AdminPrivacyCleanupResponse>("/admin/privacy/requests/cleanup", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createBillingRule: (input: AdminBillingRuleCreateInput) =>
    request("/admin/billing/rules", { method: "POST", body: JSON.stringify(input) }),
  publishBillingRule: (id: string, reason: string) =>
    request(`/admin/billing/rules/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  createBillingPromotion: (input: AdminBillingPromotionCreateInput) =>
    request("/admin/billing/promotions", { method: "POST", body: JSON.stringify(input) }),
  plans: () => request<AdminPlanListResponse>("/admin/billing/plans"),
  createPlan: (input: AdminPlanCreateInput) =>
    request("/admin/billing/plans", { method: "POST", body: JSON.stringify(input) }),
  publishPlan: (id: string, reason: string) =>
    request(`/admin/billing/plans/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  updateAdminAccount: (id: string, input: AdminAccountUpdateInput) =>
    request<AdminAccountRecord>(`/admin/admin-users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  activateAdminAccount: (id: string, input: AdminAccountActionInput) =>
    request<AdminAccountRecord>(`/admin/admin-users/${id}/activate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  suspendAdminAccount: (id: string, input: AdminAccountActionInput) =>
    request<AdminAccountRecord>(`/admin/admin-users/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeAdminAccount: (id: string, input: AdminAccountActionInput) =>
    request<AdminAccountRecord>(`/admin/admin-users/${id}/revoke`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeAdminSessions: (id: string, input: AdminAccountActionInput) =>
    request<{ revokedSessionCount: number }>(`/admin/admin-users/${id}/revoke-sessions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
  reconciliationRuns: () =>
    request<AdminQuotaReconciliationResponse>("/admin/tasks/reconciliation/runs"),
  inspirations: (filters: AdminInspirationFilters) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminInspirationListResponse>(`/admin/inspirations?${search.toString()}`);
  },
  inspirationCandidates: (filters: AdminInspirationFilters) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<AdminInspirationCandidateListResponse>(
      `/admin/inspiration-candidates?${search.toString()}`,
    );
  },
  inspiration: (id: string) => request<AdminInspirationRecord>(`/admin/inspirations/${id}`),
  publishCandidate: (resultId: string) =>
    request<AdminInspirationRecord>(`/admin/inspiration-candidates/${resultId}/publish`, {
      method: "POST",
    }),
  unpublishInspiration: (id: string) =>
    request<AdminInspirationRecord>(`/admin/inspirations/${id}/unpublish`, { method: "POST" }),
};
