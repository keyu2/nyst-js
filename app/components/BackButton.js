"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ href }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else router.push(href || "/subway");
      }}
      className="nav-button nav-button--back"
    >
      Back
    </button>
  );
}
