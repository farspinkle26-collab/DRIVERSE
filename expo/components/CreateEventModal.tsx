import React, { useState, useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Users, Flag, CarFront, Route as RouteIcon, Gauge, MapPin, Clock } from "lucide-react-native";
import { useEvents, EventType } from "@/hooks/useEventsStore";

interface CreateEventModalProps {
  visible: boolean;
  coordinate: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onCreated: () => void;
}

const EVENT_TYPES: { key: EventType; label: string; color: string }[] = [
  { key: "meetup", label: "Meetup", color: "#8B5CF6" },
  { key: "convoy", label: "Convoy", color: "#22C55E" },
  { key: "cruise", label: "Cruise", color: "#3B82F6" },
  { key: "race", label: "Track Day", color: "#EF4444" },
];

const START_OPTIONS: { key: string; label: string; getDate: () => Date }[] = [
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

const CAPACITY_OPTIONS: { label: string; value: number }[] = [
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

export default function CreateEventModal({ visible, coordinate, onClose, onCreated }: CreateEventModalProps) {
  const insets = useSafeAreaInsets();
  const { createEvent } = useEvents();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<EventType>("meetup");
  const [startKey, setStartKey] = useState("1h");
  const [capacity, setCapacity] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedColor = useMemo(() => eventTypeColor(eventType), [eventType]);
  const canSubmit = title.trim().length >= 3 && coordinate != null && !submitting;

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setEventType("meetup");
    setStartKey("1h");
    setCapacity(0);
    setError(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!coordinate || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    const startsAt = START_OPTIONS.find((o) => o.key === startKey)?.getDate() ?? new Date();
    const result = await createEvent({
      title,
      description,
      event_type: eventType,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      starts_at: startsAt,
      ends_at: new Date(startsAt.getTime() + 4 * 3600_000),
      max_participants: capacity,
    });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    reset();
    onCreated();
  }, [coordinate, canSubmit, startKey, createEvent, title, description, eventType, capacity, reset, onCreated]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={[styles.headerIcon, { backgroundColor: `${selectedColor}18`, borderColor: `${selectedColor}50` }]}>
                  <EventTypeIcon type={eventType} size={18} color={selectedColor} />
                </View>
                <Text style={styles.headerTitle}>Create Event</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                <X size={18} color="#8A8A9A" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Location hint */}
              {coordinate && (
                <View style={styles.locationRow}>
                  <MapPin size={13} color="#FF6B35" />
                  <Text style={styles.locationText}>
                    Pinned at {coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)}
                  </Text>
                </View>
              )}

              {/* Title */}
              <Text style={styles.label}>Event name</Text>
              <TextInput
                style={styles.input}
                placeholder="Saturday Night Meet"
                placeholderTextColor="#4A4A5E"
                value={title}
                onChangeText={setTitle}
                maxLength={80}
              />

              {/* Description */}
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="What's the plan?"
                placeholderTextColor="#4A4A5E"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
              />

              {/* Type chips */}
              <Text style={styles.label}>Type</Text>
              <View style={styles.chipRow}>
                {EVENT_TYPES.map((t) => {
                  const active = eventType === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        styles.chip,
                        active && { borderColor: t.color, backgroundColor: `${t.color}18` },
                      ]}
                      onPress={() => setEventType(t.key)}
                      activeOpacity={0.7}
                    >
                      <EventTypeIcon type={t.key} size={14} color={active ? t.color : "#6A6A7E"} />
                      <Text style={[styles.chipText, active && { color: t.color }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Start time chips */}
              <Text style={styles.label}>Starts</Text>
              <View style={styles.chipRow}>
                {START_OPTIONS.map((o) => {
                  const active = startKey === o.key;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      style={[styles.chip, active && styles.chipActiveOrange]}
                      onPress={() => setStartKey(o.key)}
                      activeOpacity={0.7}
                    >
                      <Clock size={13} color={active ? "#FF6B35" : "#6A6A7E"} />
                      <Text style={[styles.chipText, active && { color: "#FF6B35" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Capacity chips */}
              <Text style={styles.label}>Max drivers</Text>
              <View style={styles.chipRow}>
                {CAPACITY_OPTIONS.map((o) => {
                  const active = capacity === o.value;
                  return (
                    <TouchableOpacity
                      key={o.label}
                      style={[styles.chip, active && styles.chipActiveOrange]}
                      onPress={() => setCapacity(o.value)}
                      activeOpacity={0.7}
                    >
                      <Users size={13} color={active ? "#FF6B35" : "#6A6A7E"} />
                      <Text style={[styles.chipText, active && { color: "#FF6B35" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.75}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Flag size={18} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>Create Event</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  sheetWrap: {
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0E0E18",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 107, 53, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  locationText: {
    color: "#C08A6A",
    fontSize: 12,
    fontWeight: "500",
  },
  label: {
    color: "#8A8A9A",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    color: "#FFFFFF",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  chipActiveOrange: {
    borderColor: "#FF6B35",
    backgroundColor: "rgba(255, 107, 53, 0.12)",
  },
  chipText: {
    color: "#8A8A9A",
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF6B35",
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 20,
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
