import { describe, expect, it } from "bun:test";
import { buildLink } from "@/lib/deepLinkFormat";

/**
 * `buildLink` is the half of `createAppLink` that runs when `expo-linking`
 * has thrown — the release-build path nobody exercises by hand. Its whole job
 * is to produce a well-formed link out of two strings that may or may not
 * bring their own punctuation.
 */
describe("buildLink", () => {
  it("joins a bare scheme and a path", () => {
    expect(buildLink("myapp", "auth-callback")).toBe("myapp://auth-callback");
  });

  it("handles an empty path", () => {
    expect(buildLink("myapp", "")).toBe("myapp://");
  });

  it("does not double up separators when the scheme carries its own", () => {
    expect(buildLink("myapp://", "auth-callback")).toBe("myapp://auth-callback");
    expect(buildLink("myapp:", "auth-callback")).toBe("myapp://auth-callback");
  });

  it("strips leading slashes from the path", () => {
    expect(buildLink("myapp", "/route/42")).toBe("myapp://route/42");
    expect(buildLink("myapp", "//route/42")).toBe("myapp://route/42");
  });

  it("keeps interior path segments intact", () => {
    expect(buildLink("myapp", "route/42")).toBe("myapp://route/42");
  });
});
