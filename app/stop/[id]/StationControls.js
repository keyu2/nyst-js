import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import RouteBullet from "../../components/RouteBullet";

export function StationRouteTabs({
  activeRoute,
  routeFamilies,
  sameStationTransfers,
  onRouteChange,
}) {
  return (
    <div
      className="station-route-tabs"
      role="tablist"
      aria-label="Subway lines at this station"
    >
      {[...routeFamilies.entries()].map(([familyId, memberIds]) => {
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
  if (!activeDirectionGroup) return null;

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
        <section
          className="direction-group"
          aria-label={`${activeDirectionGroup.label} terminal filter`}
        >
          <div className="direction-tabs">
            <button
              className={!activeTerminus ? "active" : ""}
              type="button"
              aria-pressed={!activeTerminus}
              onClick={() => onTerminusChange("")}
            >
              All
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
                  onClick={() => onTerminusChange(optionKey)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
