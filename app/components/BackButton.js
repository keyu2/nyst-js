"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function BackButton({ href }) {
  const router = useRouter();

  if (href) {
    return (
      <Link href={href} className="nav-button nav-button--back">
        Back
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else router.push("/subway");
      }}
      className="nav-button nav-button--back"
    >
      Back
    </button>
  );
}
