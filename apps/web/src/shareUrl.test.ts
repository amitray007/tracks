import { describe, expect, it } from "vitest";
import { createSessionShareUrl, isSessionShareUrl } from "./shareUrl";

describe("session share URLs", () => {
  it("scopes the link to the selected session and removes library-only state", () => {
    const result = new URL(createSessionShareUrl(
      "http://127.0.0.1:4317/?view=full&track=old&group=project&order=latest&type=tools",
      "claude:project:session",
    ));

    expect(result.searchParams.get("track")).toBe("claude:project:session");
    expect(result.searchParams.get("share")).toBe("session");
    expect(result.searchParams.has("group")).toBe(false);
    expect(result.searchParams.get("view")).toBe("full");
    expect(result.searchParams.get("order")).toBe("latest");
    expect(result.searchParams.get("type")).toBe("tools");
  });

  it("only recognizes a share view when an exact session is present", () => {
    expect(isSessionShareUrl("http://127.0.0.1:4317/?share=session&track=claude%3Aone")).toBe(true);
    expect(isSessionShareUrl("http://127.0.0.1:4317/?share=session")).toBe(false);
    expect(isSessionShareUrl("http://127.0.0.1:4317/?track=claude%3Aone")).toBe(false);
    expect(isSessionShareUrl("https://tracks.example/s/019d2c64-2526-7f8a-b289-a1f9ad67c808#secret"))
      .toBe(true);
  });
});
