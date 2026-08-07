/**
 * Driveverse — a Driveverse-styled stand-in for `Alert.alert`.
 *
 * WHY THIS EXISTS
 *   `Alert.alert` renders the OS's own dialog chrome — stock Android grey on
 *   Android, stock iOS white on iOS — which is the one place in the app that
 *   still looks like a different, unbranded product. Every confirmation,
 *   every "can't do that right now" message, goes through it, so it is not a
 *   cosmetic gap: it is the single most common UI surface in the app that has
 *   never been through the design-token pass `constants/theme.ts` established.
 *
 * WHY A MODULE-LEVEL FUNCTION AND NOT A HOOK
 *   `Alert.alert(...)` is called from anywhere — event handlers, `.then()`
 *   callbacks, code inside `createContextHook` stores — not only from a
 *   component's render body. A `useAppAlert()` hook would work in some of
 *   those places and silently break the Rules of Hooks in others. `appAlert`
 *   keeps `Alert.alert`'s exact calling convention — same three arguments, no
 *   hook, callable from anywhere — so a call site's diff is the import line
 *   and nothing else.
 *
 * HOW IT REACHES THE UI
 *   `<AppAlertHost/>` (mounted once, in `app/_layout.tsx`) binds itself here
 *   on mount and un-binds on unmount. `appAlert()` just calls whatever is
 *   currently bound. Requests queue — a second `appAlert()` call while one is
 *   already showing waits its turn, matching `Alert.alert`'s own behaviour,
 *   rather than clobbering or stacking dialogs.
 *
 * A call before the host has mounted is dropped rather than queued forever:
 * every existing call site fires from a user interaction (a button press, a
 * network response to one), which cannot happen before the screen containing
 * it has rendered — so the host is always bound first in practice. `__DEV__`
 * gets a console warning if that assumption is ever wrong, rather than a
 * silent loss that is hard to notice missing.
 */

export type AppAlertButtonStyle = "default" | "cancel" | "destructive";

export interface AppAlertButton {
  text?: string;
  onPress?: () => void;
  style?: AppAlertButtonStyle;
}

export interface AppAlertRequest {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
}

type Push = (request: AppAlertRequest) => void;

let push: Push | null = null;

/** Called by `<AppAlertHost/>` on mount/unmount. Not for app code. */
export function bindAppAlertHost(fn: Push | null): void {
  push = fn;
}

/**
 * Drop-in for `Alert.alert(title, message?, buttons?)`. A missing/empty
 * `buttons` array becomes a single "OK" button, matching `Alert.alert`'s own
 * default.
 */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[]
): void {
  const resolved = buttons && buttons.length > 0 ? buttons : [{ text: "OK" }];
  if (!push) {
    if (__DEV__) {
      console.warn(`[appAlert] Host not mounted yet — dropped: "${title}"`);
    }
    return;
  }
  push({ title, message, buttons: resolved });
}
