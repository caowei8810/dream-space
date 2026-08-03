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
  demoCode: "123456";
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
