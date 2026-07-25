import React from "react";
import { CarFront, Route as RouteIcon, Gauge, Flag } from "lucide-react-native";
import { EventType } from "@/hooks/useEventsStore";

/**
 * Event type is shape, not hue — same rule the map screen established for
 * place categories (MAP_SCREEN_REFERENCE §2). `EventTypeIcon` takes its
 * colour from the caller (`textSecondary` normally, `racingRed` for live),
 * not from the type.
 */
export const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: "meetup", label: "Meetup" },
  { key: "convoy", label: "Convoy" },
  { key: "cruise", label: "Cruise" },
  { key: "race", label: "Track Day" },
];

export const START_OPTIONS: { key: string; label: string; getDate: () => Date }[] = [
  { key: "now", label: "Now", getDate: () => new Date() },
  { key: "1h", label: "In 1 hour", getDate: () => new Date(Date.now() + 3600_000) },
  { key: "3h", label: "In 3 hours", getDate: () => new Date(Date.now() + 3 * 3600_000) },
  {
    key: "tonight",
    label: "Tonight 8 PM",
    getDate: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    key: "tomorrow",
    label: "Tomorrow 10 AM",
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    },
  },
];

export const CAPACITY_OPTIONS: { label: string; value: number }[] = [
  { label: "Unlimited", value: 0 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "25", value: 25 },
  { label: "50", value: 50 },
];

export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPES.find((t) => t.key === type)?.label ?? "Meetup";
}

/** Defaults to `MAP_GLYPH_STROKE` (2) for markers on the map surface; pass
 *  1.5 (`CHROME_ICON_STROKE`) when the icon sits in chrome next to hairlines. */
export function EventTypeIcon({
  type,
  size,
  color,
  strokeWidth = 2,
}: {
  type: EventType;
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  switch (type) {
    case "convoy": return <CarFront size={size} color={color} strokeWidth={strokeWidth} />;
    case "cruise": return <RouteIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case "race": return <Gauge size={size} color={color} strokeWidth={strokeWidth} />;
    default: return <Flag size={size} color={color} strokeWidth={strokeWidth} />;
  }
}
