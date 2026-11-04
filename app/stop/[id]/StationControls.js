import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import RouteBullet from "../../components/RouteBullet";

export function StationRouteTabs({
  activeRoute,
  routeFamilies,
  routeGroups,
  sameStationTransfers,
  onRouteChange,
}) {
  return (
    <div
      className="station-route-tabs"
      role="tablist"
      aria-label="Subway lines at this station"
    >
      {routeGroups.map((families) => (
        <div
          className={`station-route-group${families.includes(activeRoute) ? " active" : ""}`}
          key={families.join("-")}
          role="presentation"
        >
          {families.map((familyId) => {
            const memberIds = routeFamilies.get(familyId);
            const selected = familyId === activeRoute;
            return (
              <button
                key={familyId}
                type="button"
                role="tab"
                aria-label={`${memberIds.join(" and ")} Train`}
                aria-selected={selected}
                onClick={() => onRouteChange(familyId)}
                className={selected ? "active" : ""}
              >
                {memberIds.map((routeId) => (
                  <RouteBullet key={routeId} routeId={routeId} size={28} />
                ))}
              </button>
            );
          })}
        </div>
      ))}

      {sameStationTransfers.map((service) => (
        <Link
          className="same-station-transfer-tab"
          key={`${service.stop.id}-${service.routes.join("-")}`}
          href={`/stop/${service.stop.id}?route=${encodeURIComponent(service.routes[0] || "")}`}
          aria-label={`Transfer to ${service.routes.join(" and ")} train`}
        >
          {service.routes.map((routeId) => (
            <RouteBullet key={routeId} routeId={routeId} size={28} />
          ))}
          <ArrowUpRight
            className="same-station-transfer-arrow"
            aria-hidden="true"
          />
        </Link>
      ))}
    </div>
  );
}

export function DirectionSelector({
  activeDirectionGroup,
  activeTerminus,
  directionGroups,
  onDirectionChange,
  onTerminusChange,
  selectedTerminus,
  terminusKey,
}) {
  const branchMenuRef = useRef(null);
  if (!activeDirectionGroup) return null;

  const selectTerminus = (terminus) => {
    onTerminusChange(terminus);
    branchMenuRef.current?.removeAttribute("open");
  };

  return (
    <div className="direction-groups">
      <div
        className="direction-slider"
        role="tablist"
        aria-label="Train direction"
        style={{
          "--direction-count": directionGroups.length,
          "--direction-index": Math.max(0, directionGroups.findIndex((group) => group.id === activeDirectionGroup.id)),
        }}
      >
        {directionGroups.map((group) => {
          const selected = group.id === activeDirectionGroup.id;

          return (
            <button
              className={selected ? "active" : ""}
              key={group.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onDirectionChange(group.id)}
            >
              {group.label}
            </button>
          );
        })}
      </div>

      {activeDirectionGroup.options.length > 1 && (
        <details
          className="direction-branch-picker"
          aria-label={`${activeDirectionGroup.label} terminal filter`}
          key={activeDirectionGroup.id}
          ref={branchMenuRef}
        >
          <summary>
            <span>{activeTerminus?.label || "All branches"}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="direction-branch-options">
            <button
              className={!activeTerminus ? "active" : ""}
              type="button"
              aria-pressed={!activeTerminus}
              onClick={() => selectTerminus("")}
            >
              All branches
            </button>

            {activeDirectionGroup.options.map((option) => {
              const optionKey = terminusKey(option);
              const selected = optionKey === selectedTerminus;

              return (
                <button
                  className={selected ? "active" : ""}
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectTerminus(optionKey)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
