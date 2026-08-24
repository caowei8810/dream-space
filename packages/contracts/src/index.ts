export const serviceNames = ["web", "admin", "api", "worker"] as const;
export type ServiceName = (typeof serviceNames)[number];

export interface HealthResponse {
  service: ServiceName;
  status: "ok";
  timestamp: string;
}

export const inspirationCategories = [
  { id: "portrait", labelZh: "人像", labelEn: "Portrait" },
  { id: "photography", labelZh: "摄影", labelEn: "Photography" },
  { id: "anime", labelZh: "动漫", labelEn: "Anime" },
  { id: "illustration", labelZh: "插画", labelEn: "Illustration" },
  { id: "design", labelZh: "设计", labelEn: "Design" },
] as const;

export type InspirationCategory = (typeof inspirationCategories)[number]["id"];

export interface InspirationSummary {
  id: string;
  slug: string;
  title: string;
  promptSummary: string;
  category: InspirationCategory;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  authorDisplayName: string;
  likeCount: number;
  modelName: string;
  ratio: string;
  resolutionLabel: string;
  isAiGenerated: boolean;
}

export interface InspirationListResponse {
  items: InspirationSummary[];
  total: number;
}

export interface InspirationDetail extends InspirationSummary {
  prompt: string;
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
}

export const authAgreementVersion = "2026-08-03" as const;

export interface AuthUser {
  id: string;
  phoneMasked: string;
  status: UserStatus;
  createdAt: string;
}

export const userStatuses = ["active", "restricted", "banned"] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface AdminUserRecord {
  id: string;
  phoneMasked: string;
  status: UserStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activeSessionCount: number;
  generationTaskCount: number;
  referenceUploadCount: number;
}

export interface AdminUserListResponse {
  items: AdminUserRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminUserStatusInput {
  reason: string;
}

export const riskRuleMatchTypes = ["keyword", "regex"] as const;
export type RiskRuleMatchType = (typeof riskRuleMatchTypes)[number];
export const riskRuleStatuses = ["draft", "published", "archived"] as const;
export type RiskRuleStatus = (typeof riskRuleStatuses)[number];
export const riskActions = ["reject", "restrict", "ban", "manual_review"] as const;
export type RiskAction = (typeof riskActions)[number];
export const riskHitStatuses = ["open", "resolved", "ignored"] as const;
export type RiskHitStatus = (typeof riskHitStatuses)[number];

export interface AdminRiskRuleRecord {
  id: string;
  code: string;
  version: number;
  name: string;
  matchType: RiskRuleMatchType;
  pattern: string;
  category: string;
  action: RiskAction;
  priority: number;
  status: RiskRuleStatus;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  hitCount: number;
}

export interface AdminRiskRuleListResponse {
  items: AdminRiskRuleRecord[];
  total: number;
}

export interface AdminRiskRuleCreateInput {
  code: string;
  name: string;
  matchType: RiskRuleMatchType;
  pattern: string;
  category: string;
  action: RiskAction;
  priority?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  reason: string;
}

export interface AdminRiskRuleActionInput {
  reason: string;
}

export interface AdminRiskHitRecord {
  id: string;
  userId: string;
  taskId: string | null;
  ruleId: string | null;
  ruleVersion: number | null;
  action: RiskAction;
  status: RiskHitStatus;
  decision: string;
  inputLength: number;
  requestId: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminRiskHitListResponse {
  items: AdminRiskHitRecord[];
  total: number;
}

export const moderationReviewStatuses = ["open", "claimed", "approved", "rejected"] as const;
export type ModerationReviewStatus = (typeof moderationReviewStatuses)[number];
export const moderationReviewStages = ["input", "output"] as const;
export type ModerationReviewStage = (typeof moderationReviewStages)[number];
export const appealStatuses = ["open", "accepted", "rejected"] as const;
export type AppealStatus = (typeof appealStatuses)[number];

export interface AdminModerationReviewRecord {
  id: string;
  taskId: string | null;
  resultId: string | null;
  stage: ModerationReviewStage;
  status: ModerationReviewStatus;
  reasonCode: string;
  reason: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  decision: string | null;
  decisionNote: string | null;
  createdAt: string;
  claimedAt: string | null;
  decidedAt: string | null;
}

export interface AdminModerationReviewListResponse {
  items: AdminModerationReviewRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminModerationDecisionInput {
  decision: "approved" | "rejected";
  note: string;
}

export interface AppealCreateInput {
  taskId?: string;
  resultId?: string;
  reason: string;
}

export interface AppealRecord {
  id: string;
  taskId: string | null;
  resultId: string | null;
  reason: string;
  status: AppealStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AdminModerationAppealListResponse {
  items: AppealRecord[];
  total: number;
}

export type AuthSessionResponse =
  { authenticated: false } | { authenticated: true; user: AuthUser };

export interface AuthIntent {
  returnTo: string;
  draft: AuthDraft | null;
  action: "resume" | "generate" | "download" | "like";
}

export interface AuthDraft {
  prompt: string;
  model: string;
  ratio: string;
  resolution: string;
  referenceImageUrl: string | null;
}

export interface SendCodeResponse {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
  demoCode?: "123456";
}

export interface SendCodeRequest {
  phone: string;
}

export interface AgreementConsents {
  version: typeof authAgreementVersion;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  aiTermsAccepted: boolean;
}

export interface LoginRequest extends AgreementConsents {
  phone: string;
  challengeId: string;
  code: string;
}

export const adminDemoPhone = "18800000000" as const;
export const adminViewerDemoPhone = "18800000001" as const;

export const adminBuiltInRoleCodes = ["viewer", "operator", "owner"] as const;
export type AdminBuiltInRoleCode = (typeof adminBuiltInRoleCodes)[number];

export const adminPermissions = [
  "dashboard:read",
  "tasks:read",
  "inspirations:read",
  "inspirations:publish",
  "admin-accounts:read",
  "admin-accounts:write",
  "admin-sessions:revoke",
  "users:read",
  "users:write",
  "user-sessions:revoke",
  "roles:read",
  "roles:write",
  "permissions:read",
  "audit:read",
  "risk-rules:read",
  "risk-rules:write",
  "risk-rules:publish",
  "moderation:read",
  "moderation:write",
  "billing:read",
  "billing:write",
  "billing:publish",
  "plans:read",
  "plans:write",
  "plans:publish",
  "refunds:create",
] as const;
export type AdminPermission = (typeof adminPermissions)[number];

export interface AdminAuditLogRecord {
  id: string;
  actor: { displayName: string; employeeNo: string } | null;
  action: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  requestId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AdminAuditLogListResponse {
  items: AdminAuditLogRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminDashboardSummary {
  window: { from: string; to: string; timezone: "Asia/Shanghai" };
  generation: {
    total: number;
    succeeded: number;
    failed: number;
    successRate: number;
    averageLatencyMs: number | null;
    pendingReview: number;
  };
  users: {
    total: number;
    active: number;
    restricted: number;
    banned: number;
    newToday: number;
  };
  revenue: {
    available: false;
    grossCents: 0;
    refundCents: 0;
    note: string;
  };
  generatedAt: string;
}

export interface AdminPermissionRecord {
  id: string;
  code: AdminPermission;
  name: string;
  description: string;
  risk: "low" | "medium" | "high";
  active: boolean;
}

export interface AdminRoleRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  system: boolean;
  active: boolean;
  userCount: number;
  permissions: AdminPermissionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminRoleListResponse {
  items: AdminRoleRecord[];
  permissions: AdminPermissionRecord[];
}

export interface AdminRoleCreateInput {
  code: string;
  name: string;
  description: string;
  permissionIds: string[];
  reason: string;
}

export interface AdminRoleUpdateInput {
  name: string;
  description: string;
  active: boolean;
  permissionIds: string[];
  reason: string;
}

export interface AdminRoleActionInput {
  reason: string;
}

export const adminAccountStatuses = ["invited", "active", "suspended", "revoked"] as const;
export type AdminAccountStatus = (typeof adminAccountStatuses)[number];

export interface AdminRoleSummary {
  id: string;
  code: string;
  name: string;
  system: boolean;
}

export interface AdminUser {
  id: string;
  employeeNo: string;
  displayName: string;
  phoneMasked: string;
  roles: AdminRoleSummary[];
  permissions: AdminPermission[];
}

export interface AdminAccountRecord {
  id: string;
  employeeNo: string;
  displayName: string;
  phoneMasked: string;
  roles: AdminRoleSummary[];
  status: AdminAccountStatus;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccountListResponse {
  items: AdminAccountRecord[];
  roles: AdminRoleSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminAccountCreateInput {
  employeeNo: string;
  displayName: string;
  phone: string;
  roleIds: string[];
  reason: string;
}

export interface AdminAccountUpdateInput {
  displayName: string;
  phone?: string;
  roleIds: string[];
  reason: string;
}

export interface AdminAccountActionInput {
  reason: string;
}

export type AdminSessionResponse =
  { authenticated: false } | { authenticated: true; user: AdminUser };

export interface AdminLoginRequest {
  phone: string;
  challengeId: string;
  code: string;
}

export const generationQueueName = "image-generation" as const;

export const generationTaskStatuses = [
  "queued",
  "generating",
  "reviewing",
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
] as const;

export type GenerationTaskStatus = (typeof generationTaskStatuses)[number];

export const generationRatios = [
  "smart",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "1:1",
  "3:4",
  "2:3",
  "9:16",
] as const;
export type GenerationRatio = (typeof generationRatios)[number];

export const generationResolutions = ["2K", "4K"] as const;
export type GenerationResolution = (typeof generationResolutions)[number];

export const moderationStatuses = ["pending", "approved", "rejected"] as const;
export type ModerationStatus = (typeof moderationStatuses)[number];

export interface CreateGenerationTaskRequest {
  idempotencyKey: string;
  sessionId?: string | null;
  prompt: string;
  model: string;
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  referenceImageUrls: string[];
  promotionCode?: string;
}

export interface GenerationModelOption {
  id: string;
  labelZh: string;
  labelEn: string;
}

export interface GenerationOptionsResponse {
  models: GenerationModelOption[];
  ratios: readonly GenerationRatio[];
  resolutions: readonly GenerationResolution[];
  imageCount: { min: number; max: number };
  referenceImages: { max: number; maxBytes: number; mimeTypes: string[] };
  costPerImage: Record<GenerationResolution, number>;
  externalServicesMode: "mock" | "live";
}

export interface ReferenceUploadResponse {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  checksumSha256: string;
}

export interface GenerationResultResponse {
  id: string;
  index: number;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  isAiGenerated: true;
  moderationStatus: ModerationStatus;
}

export interface GenerationTaskResponse {
  id: string;
  sessionId: string;
  status: GenerationTaskStatus;
  prompt: string;
  model: string;
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  referenceImageUrls: string[];
  unitCost: number;
  totalCost: number;
  billingRuleVersion: number | null;
  billingPromotionCode: string | null;
  billingUnitCents: number | null;
  billingTotalCents: number | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  inputModerationStatus: ModerationStatus;
  outputModerationStatus: ModerationStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  results: GenerationResultResponse[];
}

export interface GenerationSessionSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationSessionDraft {
  prompt: string;
  model: string;
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  referenceImageUrls: string[];
}

export interface GenerationSessionDetail extends GenerationSessionSummary {
  draft: GenerationSessionDraft | null;
  tasks: GenerationTaskResponse[];
}

export interface GenerationSessionListResponse {
  items: GenerationSessionSummary[];
}

export interface QuotaResponse {
  total: number;
  available: number;
  reserved: number;
  used: number;
  remainingPercent: number;
}

export interface BillingQuoteRequest {
  imageCount: number;
  promotionCode?: string;
}

export interface BillingQuoteResponse {
  imageCount: number;
  standardUnitCents: number;
  standardTotalCents: number;
  discountCents: number;
  finalUnitCents: number;
  finalTotalCents: number;
  promotionCode: string | null;
  currency: "CNY";
  ruleVersion: number;
}

export interface CashWalletResponse {
  currency: "CNY";
  availableCents: number;
  reservedCents: number;
}

export interface AdminCashGrantInput {
  amountCents: number;
  reason: string;
}

export interface PlanRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  version: number;
  priceCents: number;
  imageCount: number;
  validDays: number;
  modelAllowlist: string[];
  resolutionAllowlist: string[];
  dailyLimit: number | null;
  concurrencyLimit: number | null;
}

export interface PlanListResponse { items: PlanRecord[]; }

export interface OrderCreateInput {
  planVersionId: string;
  idempotencyKey: string;
}

export interface OrderRecord {
  id: string;
  planVersionId: string;
  planCode: string;
  planName: string;
  status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  amountCents: number;
  refundedCents: number;
  createdAt: string;
  paidAt: string | null;
}

export interface OrderListResponse { items: OrderRecord[]; }

export interface PaymentCallbackInput {
  provider: string;
  providerEventId: string;
  orderId: string;
  paidAmountCents: number;
  payload?: Record<string, unknown>;
}

export interface RefundCreateInput {
  orderId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
}

export interface EntitlementRecord {
  id: string;
  planVersionId: string;
  available: number;
  reserved: number;
  expiresAt: string;
  status: "active" | "expired" | "exhausted" | "refunded";
}

export interface AdminPlanCreateInput {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  imageCount: number;
  validDays: number;
  reason: string;
}

export interface AdminPlanRecord extends PlanRecord {
  status: "draft" | "published" | "archived";
}

export interface AdminPlanListResponse { items: AdminPlanRecord[]; total: number; }

export interface AdminBillingRuleRecord {
  id: string;
  version: number;
  standardUnitCents: number;
  currency: "CNY";
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  promotions: AdminBillingPromotionRecord[];
}

export interface AdminBillingPromotionRecord {
  id: string;
  code: string;
  name: string;
  discountBps: number;
  priority: number;
  stacking: boolean;
  startsAt: string;
  endsAt: string | null;
  status: "draft" | "published" | "archived";
}

export interface AdminBillingRuleListResponse {
  items: AdminBillingRuleRecord[];
  total: number;
}

export interface AdminBillingRuleCreateInput {
  standardUnitCents: number;
  reason: string;
}

export interface AdminBillingPromotionCreateInput {
  ruleVersion: number;
  code: string;
  name: string;
  discountBps: number;
  priority?: number;
  stacking?: boolean;
  startsAt: string;
  endsAt?: string | null;
  reason: string;
}

export interface CreateGenerationTaskResponse {
  session: GenerationSessionSummary;
  task: GenerationTaskResponse;
  quota: QuotaResponse;
  replayed: boolean;
}

export interface RenameGenerationSessionRequest {
  title: string;
}

export type UpdateGenerationSessionDraftRequest = GenerationSessionDraft;

export const generationEventTypes = [
  "task.queued",
  "task.generating",
  "task.retrying",
  "task.input.moderated",
  "task.output.moderated",
  "task.reviewing",
  "task.succeeded",
  "task.partially_succeeded",
  "task.failed",
  "task.cancelled",
  "task.dead_lettered",
] as const;
export type GenerationEventType = (typeof generationEventTypes)[number];

export interface GenerationTaskEventData {
  id: string;
  taskId: string;
  type: GenerationEventType;
  status: GenerationTaskStatus;
  createdAt: string;
}

export interface GenerationQueueJob {
  taskId: string;
}

export interface AdminGenerationTaskSummary {
  id: string;
  sessionId: string;
  sessionTitle: string;
  userPhoneMasked: string;
  status: GenerationTaskStatus;
  prompt: string;
  model: string;
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  resultCount: number;
  totalCost: number;
  attempts: number;
  inputModerationStatus: ModerationStatus;
  outputModerationStatus: ModerationStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AdminGenerationTaskDetail extends AdminGenerationTaskSummary {
  referenceImageUrls: string[];
  errorCode: string | null;
  errorMessage: string | null;
  deadLetter: {
    errorCode: string;
    errorMessage: string;
    attempts: number;
    createdAt: string;
    resolvedAt: string | null;
  } | null;
  results: GenerationResultResponse[];
}

export interface AdminGenerationTaskListResponse {
  items: AdminGenerationTaskSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminQuotaReconciliationFinding {
  id: string;
  userId: string;
  taskId: string | null;
  kind:
    | "missing_reserve"
    | "missing_release"
    | "missing_consume"
    | "settlement_amount_mismatch"
    | "total_drift"
    | "reserved_drift"
    | "available_drift";
  status: "open" | "repaired" | "blocked";
  expectedAmount: number | null;
  actualAmount: number | null;
  repairedAt: string | null;
  createdAt: string;
}

export interface AdminQuotaReconciliationRun {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  scannedUsers: number;
  scannedTasks: number;
  mismatchCount: number;
  repairedCount: number;
  errorMessage: string | null;
  findings: AdminQuotaReconciliationFinding[];
}

export interface AdminQuotaReconciliationResponse {
  items: AdminQuotaReconciliationRun[];
}

export const adminInspirationStatuses = ["draft", "published", "archived"] as const;
export type AdminInspirationStatus = (typeof adminInspirationStatuses)[number];

export const adminInspirationSourceTypes = ["ai_public_gallery", "licensed", "internal"] as const;
export type AdminInspirationSourceType = (typeof adminInspirationSourceTypes)[number];

export interface AdminInspirationRecord {
  id: string;
  slug: string;
  title: string;
  prompt: string;
  category: InspirationCategory;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  modelName: string;
  ratio: string;
  resolutionLabel: string;
  authorDisplayName: string;
  sourceType: AdminInspirationSourceType;
  sourceName: string;
  sourceUrl: string | null;
  licenseBasis: string;
  isAiGenerated: boolean;
  likeCount: number;
  sortOrder: number;
  status: AdminInspirationStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceResultId: string | null;
}

export interface AdminInspirationCandidateRecord {
  resultId: string;
  taskId: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  mimeType: string;
  prompt: string;
  modelName: string;
  ratio: string;
  resolutionLabel: string;
  userPhoneMasked: string;
  createdAt: string;
  inputModerationStatus: ModerationStatus;
  outputModerationStatus: ModerationStatus;
  publishedInspirationId: string | null;
}

export interface AdminInspirationCandidateListResponse {
  items: AdminInspirationCandidateRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminInspirationPublishInput {
  /** 发布参数由服务端从用户生成任务派生，客户端不提交可编辑图源或文案。 */
  readonly source?: never;
}

export interface AdminInspirationListResponse {
  items: AdminInspirationRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
