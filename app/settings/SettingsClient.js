"use client";

import AppTabs from "../components/AppTabs";
import BackButton from "../components/BackButton";
import { useSubwayPreferences } from "../lib/preferences";
import { useThemePreference } from "../lib/themePreference";

const APPEARANCE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];
const COUNTDOWN_OPTIONS = [
  { value: "minutes", label: "Off" },
  { value: "seconds", label: "On" },
];
const TRIP_PROGRESS_OPTIONS = [
  { value: "minutes", label: "Minutes" },
  { value: "stops", label: "Stops away" },
];
const DISPLAY_MODE_OPTIONS = [
  { value: "standard", label: "Arrival list" },
  { value: "board", label: "Station board" },
];
const ARRIVAL_INVERSION_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
const LINE_SELECTION_OPTIONS = [
  { value: "overview", label: "Traditional" },
  { value: "focus", label: "Slider" },
];
const MOBILE_LINE_LAYOUT_OPTIONS = [
  { value: "grouped", label: "Grouped" },
  { value: "rows", label: "Full-width rows" },
];
const MAP_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

function SegmentedSetting({ className = "", label, value, options, onChange }) {
  const settingId = `${label.toLowerCase().replaceAll(" ", "-")}-setting`;
  return (
    <section className={`settings-row${className ? ` ${className}` : ""}`} aria-labelledby={settingId}>
      <div className="settings-row__copy">
        <h2 id={settingId}>{label}</h2>
      </div>
      <div className="settings-segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function SettingsClient() {
  const {
    showSeconds,
    tripProgressUnit,
    lineView,
    mobileLineLayout,
    stationView,
    boardArrivalInversion,
    mapEnabled,
    setShowSeconds,
    setTripProgressUnit,
    setLineView,
    setMobileLineLayout,
    setStationView,
    setBoardArrivalInversion,
    setMapEnabled,
  } = useSubwayPreferences();
  const { theme, setTheme } = useThemePreference();

  return (
    <main className="new-app-shell settings-page">
      <div className="new-status-page">
        <AppTabs active="settings" />
        <header className="settings-header">
          <BackButton />
          <h1>Settings</h1>
        </header>

        <div className="settings-list">
          <SegmentedSetting
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={APPEARANCE_OPTIONS}
          />
          <SegmentedSetting
            label="Show seconds"
            value={showSeconds ? "seconds" : "minutes"}
            onChange={(value) => setShowSeconds(value === "seconds")}
            options={COUNTDOWN_OPTIONS}
          />
          <div className="settings-preview" aria-label="Arrival countdown preview">
            <span>Preview</span>
            <strong>{showSeconds ? "4m 32s" : "4 min"}</strong>
          </div>

          <SegmentedSetting
            label="Arrival estimate"
            value={tripProgressUnit}
            onChange={setTripProgressUnit}
            options={TRIP_PROGRESS_OPTIONS}
          />

          <SegmentedSetting
            label="Station page"
            value={stationView}
            onChange={setStationView}
            options={DISPLAY_MODE_OPTIONS}
          />

          {stationView === "board" && (
            <SegmentedSetting
              label="Highlight arriving trains"
              value={boardArrivalInversion ? "on" : "off"}
              onChange={(value) => setBoardArrivalInversion(value === "on")}
              options={ARRIVAL_INVERSION_OPTIONS}
            />
          )}

          <SegmentedSetting
            label="Home page"
            value={lineView}
            onChange={setLineView}
            options={LINE_SELECTION_OPTIONS}
          />

          <SegmentedSetting
            className="settings-row--mobile-only"
            label="Line layout on phones"
            value={mobileLineLayout}
            onChange={setMobileLineLayout}
            options={MOBILE_LINE_LAYOUT_OPTIONS}
          />

          <SegmentedSetting
            label="Map"
            value={mapEnabled ? "on" : "off"}
            onChange={(value) => setMapEnabled(value === "on")}
            options={MAP_OPTIONS}
          />
        </div>
      </div>
    </main>
  );
}
