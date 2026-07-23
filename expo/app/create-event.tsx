import React, { useCallback, useMemo, useRef, useState } from "react";
import {
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
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";
import MapboxTileLayer from "@/components/MapboxTileLayer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, LocateFixed, MapPin, Clock, Users, Flag } from "lucide-react-native";
import { useEvents, EventType } from "@/hooks/useEventsStore";
import { EVENT_TYPES, START_OPTIONS, CAPACITY_OPTIONS, eventTypeColor, EventTypeIcon } from "@/components/EventMeta";

const DEFAULT_REGION: Region = {
  latitude: -6.2088,
  longitude: 106.8456,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function CreateEventScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const { createEvent } = useEvents();
  const mapRef = useRef<MapView>(null);
  const geocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialRegion = useMemo<Region>(() => {
    const lat = params.lat ? parseFloat(params.lat) : NaN;
    const lng = params.lng ? parseFloat(params.lng) : NaN;
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    }
    return DEFAULT_REGION;
  }, [params.lat, params.lng]);

  const [coordinate, setCoordinate] = useState({
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
  });
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locatingMe, setLocatingMe] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<EventType>("meetup");
  const [startKey, setStartKey] = useState("1h");
  const [capacity, setCapacity] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedColor = useMemo(() => eventTypeColor(eventType), [eventType]);
  const canSubmit = title.trim().length >= 3 && !submitting;

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current);
    geocodeTimeout.current = setTimeout(async () => {
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = results[0];
        if (place) {
          const parts = [place.street, place.district ?? place.city].filter(Boolean);
          setLocationName(parts.length > 0 ? parts.join(", ") : null);
        } else {
          setLocationName(null);
        }
      } catch {
        setLocationName(null);
      }
    }, 500);
  }, []);

  const handleRegionChangeComplete = useCallback((region: Region) => {
    const next = { latitude: region.latitude, longitude: region.longitude };
    setCoordinate(next);
    reverseGeocode(next.latitude, next.longitude);
  }, [reverseGeocode]);

  const useMyLocation = useCallback(async () => {
    setLocatingMe(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission needed to center the map on you");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const region: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      mapRef.current?.animateToRegion(region, 400);
      setCoordinate({ latitude: region.latitude, longitude: region.longitude });
      reverseGeocode(region.latitude, region.longitude);
    } catch {
      setError("Couldn't get your location");
    } finally {
      setLocatingMe(false);
    }
  }, [reverseGeocode]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const startsAt = START_OPTIONS.find((o) => o.key === startKey)?.getDate() ?? new Date();
    const result = await createEvent({
      title,
      description,
      event_type: eventType,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      location_name: locationName ?? undefined,
      starts_at: startsAt,
      ends_at: new Date(startsAt.getTime() + 4 * 3600_000),
      max_participants: capacity,
    });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.back();
  }, [canSubmit, startKey, createEvent, title, description, eventType, coordinate, locationName, capacity, router]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Event</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Location picker */}
          <Text style={styles.label}>Location</Text>
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
              initialRegion={initialRegion}
              onRegionChangeComplete={handleRegionChangeComplete}
            >
              <MapboxTileLayer />
            </MapView>
            <View style={styles.centerPin} pointerEvents="none">
              <Flag size={30} color="#FF6B35" fill="#FF6B3530" />
            </View>
            <TouchableOpacity style={styles.myLocationBtn} onPress={useMyLocation} activeOpacity={0.8}>
              {locatingMe ? (
                <ActivityIndicator size="small" color="#FF6B35" />
              ) : (
                <LocateFixed size={18} color="#FF6B35" strokeWidth={2.2} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.locationRow}>
            <MapPin size={13} color="#FF6B35" />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationName ?? `Pinned at ${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`}
            </Text>
          </View>

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
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled, { marginBottom: insets.bottom + 24 }]}
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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  label: {
    color: "#8A8A9A",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 20,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  mapWrap: {
    height: 220,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  centerPin: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -15,
    marginTop: -30,
  },
  myLocationBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(14, 14, 24, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 107, 53, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginTop: 8,
  },
  locationText: {
    color: "#C08A6A",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
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
    marginHorizontal: 20,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
