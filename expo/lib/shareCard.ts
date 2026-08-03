/**
 * Driveverse — Share Trip export + distribution service.
 *
 * The product-side half of the organic-growth loop: a completed trip, a
 * rank-up, or a finished quest is rendered to a branded 1080×1920 image and
 * handed to the OS to post to Instagram Stories, TikTok, WhatsApp, etc. Every
 * real drive a user shares is free content in our visual language.
 *
 * Two responsibilities live here so the UI never touches native detail:
 *
 *   1. CAPTURE — turn a rendered `<ShareableCard>` (via its ref) into a PNG
 *      file on disk at exactly Story dimensions (1080×1920), using
 *      `react-native-view-shot`.
 *   2. DISTRIBUTE — hand that file to a destination:
 *        • `shareToInstagramStory` — the DIRECT "Add to Story" integration
 *          (`com.instagram.share.ADD_TO_STORY` on Android, the
 *          `instagram-stories://share` scheme on iOS). Skips the
 *          save-to-camera-roll-then-open-Instagram friction and is the
 *          primary CTA where Instagram is installed.
 *        • `shareViaSheet` — the generic native share sheet (TikTok,
 *          WhatsApp, Messages, save to camera roll, everything else).
 *        • `saveCardToPhotos` — no destination at all: the PNG goes into the
 *          user's camera roll (or Files on iOS without the media library) and
 *          nothing is posted. Its own action because "save the picture" is a
 *          different intent from "share the picture", and burying it in the
 *          sheet made it undiscoverable.
 *
 * `react-native-share` is what makes the *direct* Instagram Stories path
 * possible (it owns the pasteboard write on iOS and the intent on Android),
 * so it is the preferred backend. It is loaded defensively: on a runtime
 * where the native module isn't linked (e.g. Expo Go), we degrade to the
 * built-in React Native `Share` API and, for Instagram, to the generic sheet
 * — the feature never hard-crashes on a missing module.
 *
 * All entry points resolve to a `ShareOutcome` and never throw for the two
 * expected "non-error" endings — the user cancelling, or Instagram not being
 * installed — so the calling modal can just close cleanly.
 */

import { Platform, Share as RNShare } from "react-native";
import * as Linking from "expo-linking";
import { captureRef } from "react-native-view-shot";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type ShareChannel = "instagram_story" | "sheet" | "photos" | "files";

export type ShareOutcome =
  /** Content reached (or was handed to) a destination. */
  | { status: "shared"; channel: ShareChannel; app?: string }
  /** User dismissed the sheet / backed out of Instagram — not an error. */
  | { status: "cancelled" }
  /** Instagram isn't installed; caller should fall back to the sheet. */
  | { status: "unavailable" }
  /** Something genuinely went wrong (capture failed, native threw). */
  | { status: "error"; message: string };

/** Story canvas — Instagram/TikTok full-screen portrait. */
export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;

/**
 * Our registered iOS Story `source_application`, and the `appId` Instagram
 * wants on the Android ADD_TO_STORY intent. Matches the iOS bundle id in
 * app.json; Instagram only uses it for attribution, so an approximate value
 * is harmless, but keep it aligned with the real app identifier.
 */
const IG_SOURCE_APP = "app.rork.driverse";

/* ------------------------------------------------------------------ *
 * Optional native backend: react-native-share
 * ------------------------------------------------------------------ */

/**
 * `react-native-share`, loaded once and only if present. Returns `null` on
 * a runtime without the native module so every caller can branch on it
 * instead of risking a bundler/require crash. Typed loosely on purpose —
 * we only touch the two calls we use.
 */
type RNShareModule = {
  open: (options: Record<string, unknown>) => Promise<{ success?: boolean; app?: string } | unknown>;
  shareSingle: (options: Record<string, unknown>) => Promise<unknown>;
  Social: Record<string, string>;
};

let rnShareResolved = false;
let rnShareModule: RNShareModule | null = null;

function getRNShare(): RNShareModule | null {
  if (rnShareResolved) return rnShareModule;
  rnShareResolved = true;
  try {
    // Defensive require: absent native module must degrade, not crash.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-share");
    const resolved = (mod?.default ?? mod) as RNShareModule;
    // A JS shim without the native side won't expose `open`; treat as absent.
    rnShareModule = typeof resolved?.open === "function" ? resolved : null;
  } catch {
    rnShareModule = null;
  }
  return rnShareModule;
}

/**
 * Whether the direct Instagram-Story integration is usable at all. It needs
 * the react-native-share native backend — the built-in RN `Share` cannot
 * write the story pasteboard/intent. UI can call this to decide whether the
 * "Add to Instagram Story" CTA is even wired to the direct path (it still
 * shows when Instagram is installed; if the backend is missing it routes
 * through the generic sheet).
 */
export function hasDirectStoryBackend(): boolean {
  return getRNShare() != null;
}

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

/**
 * Render a mounted `<ShareableCard>` (referenced by `ref`) to a PNG on disk
 * at exactly {@link EXPORT_WIDTH}×{@link EXPORT_HEIGHT}. The card can be laid
 * out at any on-screen size (or scaled down for a preview) — view-shot
 * rescales the snapshot to the requested resolution, so the export is always
 * Story-sized regardless of the device.
 *
 * Returns a `file://` uri. Throws only on a real capture failure; callers
 * surface that as a `ShareOutcome` of `error`.
 */
export async function captureCard(ref: React.RefObject<unknown>): Promise<string> {
  if (!ref?.current) {
    throw new Error("Nothing to capture — the card is not mounted yet.");
  }
  const uri = await captureRef(ref as never, {
    format: "png",
    quality: 1,
    result: "tmpfile",
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
  });
  // Android sometimes returns a bare path; normalise to a file:// uri so
  // both the RN Share API and react-native-share accept it uniformly.
  return uri.startsWith("file://") || uri.startsWith("content://")
    ? uri
    : `file://${uri}`;
}

/* ------------------------------------------------------------------ *
 * Instagram detection
 * ------------------------------------------------------------------ */

/**
 * Whether Instagram appears to be installed. On iOS this is reliable because
 * we declared `instagram`/`instagram-stories` in LSApplicationQueriesSchemes
 * (see app.json). On Android, `canOpenURL` for a custom scheme is not a
 * dependable presence check, so we treat Android optimistically: report
 * "installed" and let the ADD_TO_STORY intent itself be the real gate — if
 * Instagram is absent the share simply falls through to the sheet.
 */
export async function isInstagramInstalled(): Promise<boolean> {
  if (Platform.OS === "android") return true;
  try {
    return await Linking.canOpenURL("instagram-stories://share");
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Direct: Add to Instagram Story
 * ------------------------------------------------------------------ */

/**
 * Hand the captured image straight into Instagram's Story composer — no
 * "save to camera roll, then open Instagram" detour. Uses react-native-share's
 * `INSTAGRAM_STORIES` target, which maps to `instagram-stories://share`
 * (iOS pasteboard) and `com.instagram.share.ADD_TO_STORY` (Android intent).
 *
 * Resolution semantics (never throws for the expected endings):
 *   • backend missing        → `unavailable` (caller should use the sheet)
 *   • Instagram not installed → `unavailable`
 *   • user backs out          → `cancelled`
 *   • landed in the composer  → `shared`
 */
export async function shareToInstagramStory(fileUri: string): Promise<ShareOutcome> {
  const Share = getRNShare();
  if (!Share) return { status: "unavailable" };

  if (!(await isInstagramInstalled())) return { status: "unavailable" };

  try {
    await Share.shareSingle({
      // `backgroundImage` fills the whole story canvas with our 1080×1920 art.
      backgroundImage: fileUri,
      social: Share.Social.INSTAGRAM_STORIES,
      appId: IG_SOURCE_APP,
      // iOS attribution / return handoff.
      // (react-native-share reads these keys for the stories deep link.)
      // `attributionURL` is optional; omitted so we don't advertise a bad link.
    });
    return { status: "shared", channel: "instagram_story", app: "instagram" };
  } catch (e: unknown) {
    const message = errString(e);
    if (isCancellation(message)) return { status: "cancelled" };
    // Instagram missing shows up here on some devices despite the pre-check.
    if (/not.*install|no.*activity|could not.*open/i.test(message)) {
      return { status: "unavailable" };
    }
    return { status: "error", message };
  }
}

/* ------------------------------------------------------------------ *
 * Generic: native share sheet
 * ------------------------------------------------------------------ */

/**
 * Present the OS share sheet for everything else — TikTok, WhatsApp,
 * Messages, save to camera roll, AirDrop, etc. The list is populated by the
 * OS from whatever is installed, so we don't enumerate targets ourselves.
 *
 * Prefers react-native-share (`Share.open`, which shares the image as a real
 * file attachment on both platforms) and falls back to the built-in RN
 * `Share.share`. A dismissed sheet resolves to `cancelled`, not an error.
 */
export async function shareViaSheet(
  fileUri: string,
  message?: string
): Promise<ShareOutcome> {
  const Share = getRNShare();

  if (Share) {
    try {
      const res = (await Share.open({
        url: fileUri,
        type: "image/png",
        message,
        failOnCancel: false,
      })) as { success?: boolean; app?: string } | undefined;
      // With failOnCancel:false a dismissal resolves (not rejects) with
      // success:false — report it as a clean cancel.
      if (res && res.success === false) return { status: "cancelled" };
      return { status: "shared", channel: "sheet", app: res?.app };
    } catch (e: unknown) {
      const message2 = errString(e);
      if (isCancellation(message2)) return { status: "cancelled" };
      // Fall through to the built-in API on an unexpected native failure.
    }
  }

  // Built-in fallback — always available, works in Expo Go.
  try {
    const result = await RNShare.share(
      Platform.OS === "ios"
        ? { url: fileUri, message }
        : { message: message ? `${message}\n${fileUri}` : fileUri }
    );
    if (result.action === RNShare.dismissedAction) return { status: "cancelled" };
    return { status: "shared", channel: "sheet" };
  } catch (e: unknown) {
    return { status: "error", message: errString(e) };
  }
}

/* ------------------------------------------------------------------ *
 * Save the PNG
 * ------------------------------------------------------------------ */

/**
 * `expo-media-library`, loaded once and only if the native module is actually
 * linked. Same defensive shape as {@link getRNShare}, and for the same reason
 * this repo keeps re-learning: a static import of a package whose entry
 * reaches a native module runs that lookup at *module scope*, and the throwing
 * variant of that lookup has killed this app on open before
 * (LAUNCH_SAFETY_REFERENCE.md §10). `lib/shareCard.ts` is imported by screens
 * on the launch path, so the require happens on first press instead.
 */
type MediaLibraryModule = {
  requestPermissionsAsync: (
    writeOnly?: boolean
  ) => Promise<{ granted: boolean; canAskAgain?: boolean }>;
  saveToLibraryAsync: (localUri: string) => Promise<void>;
};

let mediaLibResolved = false;
let mediaLibModule: MediaLibraryModule | null = null;

function getMediaLibrary(): MediaLibraryModule | null {
  if (mediaLibResolved) return mediaLibModule;
  mediaLibResolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-media-library");
    const resolved = (mod?.default ?? mod) as MediaLibraryModule;
    mediaLibModule =
      typeof resolved?.saveToLibraryAsync === "function" ? resolved : null;
  } catch {
    mediaLibModule = null;
  }
  return mediaLibModule;
}

/**
 * Put the captured card in the user's own storage, as a PNG, without posting
 * it anywhere.
 *
 * This is a distinct action from {@link shareViaSheet} on purpose. "Save
 * Image" does exist somewhere inside the OS share sheet, but it is two taps
 * down a list of apps, it is worded differently on every device, and on
 * Android it depends on which gallery apps are installed. A driver who wants
 * the picture — to post later, to send outside the phone, to keep — should not
 * have to go looking for it.
 *
 * Three paths, best first:
 *   1. `expo-media-library` → straight into the camera roll. The real answer.
 *   2. iOS without it → the system "Save to Files" sheet, which is a genuine
 *      save rather than a share.
 *   3. Anything else → the generic sheet, where Save Image is at least
 *      reachable. Reported as `sheet` so the caller can word the confirmation
 *      honestly instead of claiming a save that may not have happened.
 *
 * A denied photo permission resolves as `error` with a message the user can
 * act on, not as a silent no-op.
 */
export async function saveCardToPhotos(fileUri: string): Promise<ShareOutcome> {
  const MediaLibrary = getMediaLibrary();

  if (MediaLibrary) {
    try {
      // `true` asks for write-only access where the platform supports it,
      // which is all we need and the least we can ask for.
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission?.granted) {
        return {
          status: "error",
          message:
            "Driveverse needs permission to save photos. You can turn it on in Settings.",
        };
      }
      await MediaLibrary.saveToLibraryAsync(fileUri);
      return { status: "shared", channel: "photos" };
    } catch (e: unknown) {
      const message = errString(e);
      if (isCancellation(message)) return { status: "cancelled" };
      // Fall through — a save that failed can still be offered as a share.
    }
  }

  const Share = getRNShare();
  if (Share && Platform.OS === "ios") {
    try {
      const res = (await Share.open({
        url: fileUri,
        type: "image/png",
        filename: "driverse-trip",
        saveToFiles: true,
        failOnCancel: false,
      })) as { success?: boolean } | undefined;
      if (res && res.success === false) return { status: "cancelled" };
      return { status: "shared", channel: "files" };
    } catch (e: unknown) {
      const message = errString(e);
      if (isCancellation(message)) return { status: "cancelled" };
    }
  }

  return shareViaSheet(fileUri);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function errString(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  const anyE = e as { message?: unknown; error?: unknown };
  if (typeof anyE.message === "string") return anyE.message;
  if (typeof anyE.error === "string") return anyE.error;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** react-native-share signals a user dismissal through a few different strings. */
function isCancellation(message: string): boolean {
  return /cancel|dismiss|user did not share|abort/i.test(message);
}
