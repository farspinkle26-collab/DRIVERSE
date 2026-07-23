import React from "react";
import { CarFront, Route as RouteIcon, Gauge, Flag } from "lucide-react-native";
import { EventType } from "@/hooks/useEventsStore";

export const EVENT_TYPES: { key: EventType; label: string; color: string }[] = [
  { key: "meetup", label: "Meetup", color: "#8B5CF6" },
  { key: "convoy", label: "Convoy", color: "#22C55E" },
  { key: "cruise", label: "Cruise", color: "#3B82F6" },
  { key: "race", label: "Track Day", color: "#EF4444" },
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

export function eventTypeColor(type: EventType): string {
  return EVENT_TYPES.find((t) => t.key === type)?.color ?? "#8B5CF6";
}

export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPES.find((t) => t.key === type)?.label ?? "Meetup";
}

export function EventTypeIcon({ type, size, color }: { type: EventType; size: number; color: string }) {
  switch (type) {
    case "convoy": return <CarFront size={size} color={color} strokeWidth={2} />;
    case "cruise": return <RouteIcon size={size} color={color} strokeWidth={2} />;
    case "race": return <Gauge size={size} color={color} strokeWidth={2} />;
    default: return <Flag size={size} color={color} strokeWidth={2} />;
  }
}
