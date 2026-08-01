import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FoundationBadge } from "../src";

describe("FoundationBadge", () => {
  it("renders its label", () => {
    expect(renderToStaticMarkup(<FoundationBadge label="WEB" />)).toContain("WEB");
  });
});
