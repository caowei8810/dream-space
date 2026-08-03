import { describe, expect, it } from "vitest";
import { authAgreementVersion, inspirationCategories, serviceNames } from "../src";

describe("service contracts", () => {
  it("lists every runnable service", () => {
    expect(serviceNames).toEqual(["web", "admin", "api", "worker"]);
  });

  it("defines stable inspiration category ids", () => {
    expect(inspirationCategories.map((category) => category.id)).toEqual([
      "portrait",
      "photography",
      "anime",
      "illustration",
      "design",
    ]);
  });

  it("publishes a fixed agreement version for auditable login consent", () => {
    expect(authAgreementVersion).toBe("2026-08-03");
  });
});
