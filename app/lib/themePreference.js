"use client";

import { useSyncExternalStore } from "react";
import { notifyStorageChange, subscribeToStorage } from "./clientStorage";

const STORAGE_KEY = "subway-theme";
const CHANGE_EVENT = "subway-theme-change";

function getSnapshot() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribe(callback) {
  return subscribeToStorage(CHANGE_EVENT, callback);
}

function setThemePreference(theme) {
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The active page can still change theme when storage is unavailable.
    }
  } else {
    delete document.documentElement.dataset.theme;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The active page can still follow the system theme without storage.
    }
  }
  notifyStorageChange(CHANGE_EVENT);
}

export function useThemePreference() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system");
  return { theme, setTheme: setThemePreference };
}

function subscribeSystemTheme(callback) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useMapTheme() {
  const { theme } = useThemePreference();
  const system = useSyncExternalStore(subscribeSystemTheme, systemTheme, () => "light");
  return theme === "system" ? system : theme;
}
