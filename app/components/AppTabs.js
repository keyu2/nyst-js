"use client";

import Link from "next/link";
import { House, MapPin, Settings, Star, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { id: "subway", label: "Home", href: "/subway", Icon: House },
  { id: "favorites", label: "Favorite", href: "/subway/favorites", Icon: Star },
  { id: "nearby", label: "Nearby", href: "/subway/nearby", Icon: MapPin },
  { id: "status", label: "Status", href: "/status", Icon: TriangleAlert },
];

export default function AppTabs({ active, onNavigate }) {
  const router = useRouter();

  function navigateTo(href) {
    onNavigate?.();
    router.push(href);
  }

  return (
    <header className="app-navigation">
      <Link className="app-navigation__brand" href="/subway" onClick={onNavigate}>
        NYST
      </Link>

      <nav className="new-tabs new-tabs--primary" aria-label="Main sections">
        {NAV_ITEMS.map(({ id, label, href, Icon }) => {
          const isActive = active === id;

          return (
            <button
              key={id}
              type="button"
              className={isActive ? "active" : ""}
              aria-current={isActive ? "page" : undefined}
              aria-pressed={isActive}
              onClick={() => navigateTo(href)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <Link
        className={`app-navigation__settings${active === "settings" ? " active" : ""}`}
        href="/settings"
        aria-current={active === "settings" ? "page" : undefined}
        aria-label="Settings"
        onClick={onNavigate}
      >
        <Settings aria-hidden="true" />
        <span>Settings</span>
      </Link>
    </header>
  );
}
