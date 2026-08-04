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
  createdAt: string;
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

export const adminRoles = ["viewer", "operator", "admin"] as const;
export type AdminRole = (typeof adminRoles)[number];

export const adminPermissions = ["tasks:read", "inspirations:read", "inspirations:write"] as const;
export type AdminPermission = (typeof adminPermissions)[number];

export interface AdminUser {
  id: string;
  displayName: string;
  phoneMasked: string;
  role: AdminRole;
  permissions: AdminPermission[];
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

export interface CreateGenerationTaskRequest {
  idempotencyKey: string;
  sessionId?: string | null;
  prompt: string;
  model: string;
  ratio: GenerationRatio;
  resolution: GenerationResolution;
  imageCount: number;
  referenceImageUrls: string[];
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
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  isAiGenerated: true;
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
  errorCode: string | null;
  errorMessage: string | null;
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
  "task.succeeded",
  "task.partially_succeeded",
  "task.failed",
  "task.cancelled",
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
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AdminGenerationTaskDetail extends AdminGenerationTaskSummary {
  referenceImageUrls: string[];
  errorCode: string | null;
  errorMessage: string | null;
  results: GenerationResultResponse[];
}

export interface AdminGenerationTaskListResponse {
  items: AdminGenerationTaskSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
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
}

export interface AdminInspirationInput {
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
  sourceUrl?: string | null;
  licenseBasis: string;
  isAiGenerated: boolean;
  likeCount: number;
  sortOrder: number;
}

export interface AdminInspirationListResponse {
  items: AdminInspirationRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
