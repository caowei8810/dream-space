import { describe, expect, it } from "vitest";
import { serviceNames } from "../src";

describe("service contracts", () => {
  it("lists every runnable service", () => {
    expect(serviceNames).toEqual(["web", "admin", "api", "worker"]);
  });
});
