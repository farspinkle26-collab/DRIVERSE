"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      const next = params.get("next") || "/";
      router.replace(next);
      router.refresh();
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-plane px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-hairline bg-surface-1 p-8"
      >
        <div className="mb-1 text-lg font-semibold tracking-tight">
          Driveverse Admin
        </div>
        <p className="mb-6 text-sm text-ink-muted">
          Internal analytics. Enter the shared password.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="mb-3 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
        />
        {error && (
          <div className="mb-3 text-sm text-status-critical">{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-series-1 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
        <p className="mt-6 text-xs leading-relaxed text-ink-muted">
          Shared-password gate for the founding team only. Move to real auth with
          per-user roles before granting anyone else access.
        </p>
      </form>
    </main>
  );
}
