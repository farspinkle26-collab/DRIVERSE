"use client";

import { useState } from "react";
import { PostFormModal } from "./PostFormModal";

export function AddPostButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-lg bg-series-1 px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
        }
      >
        + Add post
      </button>
      {open && <PostFormModal onClose={() => setOpen(false)} />}
    </>
  );
}
