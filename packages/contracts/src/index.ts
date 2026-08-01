export const serviceNames = ["web", "admin", "api", "worker"] as const;
export type ServiceName = (typeof serviceNames)[number];

export interface HealthResponse {
  service: ServiceName;
  status: "ok";
  timestamp: string;
}
