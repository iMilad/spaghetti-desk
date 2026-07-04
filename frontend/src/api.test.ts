import { describe, expect, it } from "vitest";

import { buildApiUrl, resolveApiBase } from "./api";

describe("api helpers", () => {
  it("uses the configured API base when one is provided", () => {
    expect(resolveApiBase("http://api.example.invalid/", "localhost")).toBe(
      "http://api.example.invalid",
    );
  });

  it("defaults local browser sessions to the local backend", () => {
    expect(resolveApiBase(undefined, "localhost")).toBe("http://127.0.0.1:8000");
    expect(resolveApiBase(undefined, "127.0.0.1")).toBe("http://127.0.0.1:8000");
  });

  it("keeps production deployments on same-origin requests by default", () => {
    expect(resolveApiBase(undefined, "desk.example.invalid")).toBe("");
  });

  it("builds API URLs without duplicate slashes", () => {
    expect(buildApiUrl("/api/v1/summary", "http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000/api/v1/summary",
    );
    expect(buildApiUrl("api/v1/summary", "")).toBe("/api/v1/summary");
  });
});
