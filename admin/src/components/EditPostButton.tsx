"use client";

import { useState } from "react";
import { PostFormModal } from "./PostFormModal";
import type { Post } from "@/lib/content/types";

export function EditPostButton({ post, className }: { post: Post; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ??
          "rounded-md border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-secondary transition hover:text-ink-primary"
        }
      >
        Edit
      </button>
      {open && <PostFormModal post={post} onClose={() => setOpen(false)} />}
    </>
  );
}
