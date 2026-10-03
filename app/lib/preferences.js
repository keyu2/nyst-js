"use client";

import { useSyncExternalStore } from "react";
import {
  notifyStorageChange,
  readJsonStorage,
  subscribeToStorage,
  writeJsonStorage,
} from "./clientStorage";

const STORAGE_KEY = "subway-preferences";
const CHANGE_EVENT = "subway-preferences-change";
const DEFAULT_PREFERENCES = Object.freeze({
  showSeconds: false,
  tripProgressUnit: "minutes",
  lineView: "overview",
  stationView: "standard",
  boardAlertLayout: "columns",
  boardArrivalInversion: true,
});

let cachedValue = null;
let cachedPreferences = DEFAULT_PREFERENCES;

function normalizePreferences(value) {
  return {
    showSeconds: value?.showSeconds === true,
    tripProgressUnit: value?.tripProgressUnit === "stops" ? "stops" : "minutes",
    lineView: value?.lineView === "focus" ? "focus" : "overview",
    stationView: value?.stationView === "board" ? "board" : "standard",
    boardAlertLayout: value?.boardAlertLayout === "stacked" ? "stacked" : "columns",
    boardArrivalInversion: value?.boardArrivalInversion !== false,
  };
}

function getSnapshot() {
  try {
    const value = localStorage.getItem(STORAGE_KEY) || "";
    if (value === cachedValue) return cachedPreferences;
    cachedValue = value;
    cachedPreferences = normalizePreferences(readJsonStorage(STORAGE_KEY));
    return cachedPreferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function subscribe(callback) {
  return subscribeToStorage(CHANGE_EVENT, callback);
}

function updatePreferences(changes) {
  const next = normalizePreferences({ ...getSnapshot(), ...changes });
  writeJsonStorage(STORAGE_KEY, next);
  cachedValue = null;
  notifyStorageChange(CHANGE_EVENT);
}

export function useSubwayPreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFERENCES);
  return {
    ...preferences,
    setShowSeconds: (showSeconds) => updatePreferences({ showSeconds }),
    setTripProgressUnit: (tripProgressUnit) => updatePreferences({ tripProgressUnit }),
    setLineView: (lineView) => updatePreferences({ lineView }),
    setStationView: (stationView) => updatePreferences({ stationView }),
    setBoardAlertLayout: (boardAlertLayout) => updatePreferences({ boardAlertLayout }),
    setBoardArrivalInversion: (boardArrivalInversion) => updatePreferences({ boardArrivalInversion }),
  };
}
