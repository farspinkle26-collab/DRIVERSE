"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Post } from "@/lib/content/types";

export function PostCheckedCheckbox({ post }: { post: Post }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const checked = !!post.frontmatter.checked;

  async function toggle(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    const next = e.target.checked;
    setBusy(true);
    try {
      const res = await fetch(`/api/content/posts/${post.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to update.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={toggle}
      className="accent-series-1 disabled:opacity-50"
      aria-label={checked ? "Mark as not done" : "Mark as done"}
    />
  );
}
