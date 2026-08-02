import { describe, expect, it } from "bun:test";
import { callbackParams, parseAuthCallback } from "@/lib/authCallback";

/**
 * `parseAuthCallback` reads the one URL the whole Google sign-in hangs on, and
 * it is the step nobody can watch: it happens inside an auth-session sheet
 * that closes the instant it fires. The bug it replaces returned `null` for
 * every shape but one, so the sign-in button did nothing at all and left
 * nothing behind to read.
 */
describe("parseAuthCallback", () => {
  const REDIRECT = "myapp://auth-callback";

  describe("PKCE — the flow this app is pinned to", () => {
    it("reads the code off the query string", () => {
      expect(parseAuthCallback(`${REDIRECT}?code=abc-123`)).toEqual({
        kind: "code",
        code: "abc-123",
      });
    });

    it("reads the code when other parameters travel with it", () => {
      const url = `${REDIRECT}?state=xyz&code=abc-123&provider=google`;
      expect(parseAuthCallback(url)).toEqual({ kind: "code", code: "abc-123" });
    });

    it("percent-decodes the code", () => {
      expect(parseAuthCallback(`${REDIRECT}?code=a%2Fb%2Bc`)).toEqual({
        kind: "code",
        code: "a/b+c",
      });
    });
  });

  describe("implicit — the shape the default client used to produce", () => {
    it("reads both tokens off the fragment", () => {
      const url = `${REDIRECT}#access_token=at-1&refresh_token=rt-1&expires_in=3600`;
      expect(parseAuthCallback(url)).toEqual({
        kind: "tokens",
        accessToken: "at-1",
        refreshToken: "rt-1",
      });
    });

    it("does not claim a session when only the access token came back", () => {
      // Half a session is not a session — `setSession` needs both.
      expect(parseAuthCallback(`${REDIRECT}#access_token=at-1`)).toEqual({ kind: "none" });
    });

    it("reads tokens from a fragment that carries its own query marker", () => {
      const url = `${REDIRECT}#/?access_token=at-1&refresh_token=rt-1`;
      expect(parseAuthCallback(url)).toEqual({
        kind: "tokens",
        accessToken: "at-1",
        refreshToken: "rt-1",
      });
    });
  });

  describe("failures", () => {
    it("prefers the provider's own description", () => {
      const url = `${REDIRECT}?error=server_error&error_description=Database%20error%20saving%20new%20user`;
      expect(parseAuthCallback(url)).toEqual({
        kind: "error",
        message: "Database error saving new user",
      });
    });

    it("reads an error out of the fragment too", () => {
      const url = `${REDIRECT}#error=access_denied&error_description=User%20did%20not%20consent`;
      expect(parseAuthCallback(url)).toEqual({
        kind: "error",
        message: "User did not consent",
      });
    });

    it("falls back to the bare code when there is no description", () => {
      expect(parseAuthCallback(`${REDIRECT}?error=access_denied`)).toEqual({
        kind: "error",
        message: "Sign-in was cancelled.",
      });
      expect(parseAuthCallback(`${REDIRECT}?error=server_error`)).toEqual({
        kind: "error",
        message: "Sign-in failed (server_error).",
      });
    });

    it("accepts error_code as well as error", () => {
      const url = `${REDIRECT}#error_code=otp_expired&error_description=Link%20has%20expired`;
      expect(parseAuthCallback(url)).toEqual({ kind: "error", message: "Link has expired" });
    });

    it("reports the error even when a code rode along with it", () => {
      // A callback carrying both is a failed exchange, not a usable one.
      const url = `${REDIRECT}?code=abc&error=server_error&error_description=nope`;
      expect(parseAuthCallback(url)).toEqual({ kind: "error", message: "nope" });
    });

    it("ignores an empty error_description rather than showing a blank alert", () => {
      const url = `${REDIRECT}?error=server_error&error_description=%20`;
      expect(parseAuthCallback(url)).toEqual({
        kind: "error",
        message: "Sign-in failed (server_error).",
      });
    });
  });

  describe("nothing useful", () => {
    it("returns none for a bare redirect", () => {
      expect(parseAuthCallback(REDIRECT)).toEqual({ kind: "none" });
    });

    it("returns none for an empty query", () => {
      expect(parseAuthCallback(`${REDIRECT}?`)).toEqual({ kind: "none" });
      expect(parseAuthCallback(`${REDIRECT}#`)).toEqual({ kind: "none" });
    });

    it("returns none for the empty string", () => {
      expect(parseAuthCallback("")).toEqual({ kind: "none" });
    });

    it("returns none for a code with no value", () => {
      expect(parseAuthCallback(`${REDIRECT}?code=`)).toEqual({ kind: "none" });
    });
  });

  describe("custom schemes and dev URLs", () => {
    it("handles an exp:// development redirect", () => {
      const url = "exp://10.0.0.4:8081/--/auth-callback?code=abc-123";
      expect(parseAuthCallback(url)).toEqual({ kind: "code", code: "abc-123" });
    });

    it("handles an https redirect", () => {
      expect(parseAuthCallback("https://driverse.app/auth-callback?code=abc")).toEqual({
        kind: "code",
        code: "abc",
      });
    });
  });
});

describe("callbackParams", () => {
  it("merges the query string and the fragment", () => {
    const params = callbackParams("myapp://auth-callback?state=s1#access_token=at-1");
    expect(params.get("state")).toBe("s1");
    expect(params.get("access_token")).toBe("at-1");
  });

  it("lets the first occurrence of a key win", () => {
    const params = callbackParams("myapp://auth-callback?code=first&code=second");
    expect(params.get("code")).toBe("first");
  });

  it("keeps a valueless parameter as an empty string", () => {
    const params = callbackParams("myapp://auth-callback?flag");
    expect(params.get("flag")).toBe("");
  });

  it("survives a malformed percent-escape instead of throwing", () => {
    // decodeURIComponent("%E0%A4%A") throws; the raw text is better than a
    // crash inside the one code path with no UI around it.
    const params = callbackParams("myapp://auth-callback?code=%E0%A4%A");
    expect(params.get("code")).toBe("%E0%A4%A");
  });
});
