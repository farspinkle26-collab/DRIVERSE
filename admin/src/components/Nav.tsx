"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Users" },
  { href: "/trips", label: "Trips" },
  { href: "/quests", label: "Quests & XP" },
  { href: "/events", label: "Events & Convoys" },
  { href: "/community", label: "Community & Chat" },
  { href: "/places", label: "Places" },
  { href: "/garage", label: "Garage" },
  { href: "/monetization", label: "Monetization" },
  { href: "/content", label: "Content" },
  { href: "/marketing", label: "Marketing" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-hairline bg-surface-1 px-3 py-5">
      <div className="px-2 pb-5">
        <div className="text-sm font-semibold tracking-tight">Driveverse</div>
        <div className="text-xs text-ink-muted">Admin analytics</div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {LINKS.map((l) => {
          const active =
            l.href === "/"
              ? pathname === "/"
              : pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-surface-2 font-medium text-ink-primary"
                  : "text-ink-secondary hover:bg-surface-2/60 hover:text-ink-primary"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={logout}
        className="mt-4 rounded-lg px-3 py-2 text-left text-sm text-ink-muted transition hover:text-ink-primary"
      >
        Log out
      </button>
    </aside>
  );
}
