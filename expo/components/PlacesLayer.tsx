import React, { useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Marker } from "@/components/AppMap";
import { X, Plus, MapPin } from "lucide-react-native";
import Card from "@/components/Card";
import Input from "@/components/Input";
import Dropdown from "@/components/Dropdown";
import ImagePickerField from "@/components/ImagePicker";
import Button from "@/components/Button";
import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useThemeStore";
import { useXP } from "@/hooks/useXPStore";
import { uploadPlacePhoto } from "@/lib/uploadPlacePhoto";
import { supabase } from "@/lib/supabase";
import type { NormalizedPlace } from "@/lib/placesApi";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";

export const PLACE_SUBMIT_XP = 15;

// ─── Category filter segmented control ──────────────────────
export function PlacesFilterBar({
  active,
  onChange,
  style,
}: {
  active: PlaceCategory;
  onChange: (category: PlaceCategory) => void;
  style?: object;
}) {
  return (
    <View style={[styles.filterBar, style]}>
      {PLACE_CATEGORIES.map((cat) => {
        const Icon = PLACE_CATEGORY_ICONS[cat];
        const isActive = active === cat;
        return (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, isActive && { backgroundColor: PLACE_CATEGORY_COLORS[cat] }]}
            activeOpacity={0.75}
            onPress={() => onChange(cat)}
          >
            <Icon size={14} color={isActive ? "#0A0A14" : "#8A8A9A"} strokeWidth={2.3} />
            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
              {PLACE_CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Markers (render as a child of <MapView>) ───────────────
export function PlacesMarkers({
  places,
  onSelect,
}: {
  places: NormalizedPlace[];
  onSelect: (place: NormalizedPlace) => void;
}) {
  return (
    <>
      {places.map((place) => {
        const Icon = PLACE_CATEGORY_ICONS[place.category];
        const color = PLACE_CATEGORY_COLORS[place.category];
        return (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.lat, longitude: place.lng }}
            onPress={() => onSelect(place)}
            tracksViewChanges={false}
          >
            <View style={[styles.markerBadge, { backgroundColor: color, borderColor: place.source === "user" ? Colors.primary : "#FFFFFF" }]}>
              <Icon size={14} color="#0A0A14" strokeWidth={2.4} />
            </View>
          </Marker>
        );
      })}
    </>
  );
}

// ─── Tap callout: bottom sheet with name/category/tags/attribution ──
export function PlaceDetailSheet({ place, onClose }: { place: NormalizedPlace | null; onClose: () => void }) {
  if (!place) return null;
  const Icon = PLACE_CATEGORY_ICONS[place.category];
  const color = PLACE_CATEGORY_COLORS[place.category];
  const openingHours = place.tags.opening_hours;
  const notes = place.tags.notes;

  return (
    <View style={styles.sheetWrap} pointerEvents="box-none">
      <Card style={styles.sheetCard}>
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetIconBadge, { backgroundColor: color }]}>
            <Icon size={18} color="#0A0A14" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{place.name}</Text>
            <Text style={styles.sheetSubtitle}>{PLACE_CATEGORY_LABELS[place.category]}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {place.source === "osm" && openingHours && (
          <Text style={styles.sheetLine}>Hours: {openingHours}</Text>
        )}
        {place.source === "user" && (
          <>
            <Text style={styles.sheetLine}>Submitted by a Driveverse driver</Text>
            {notes ? <Text style={styles.sheetLine}>{notes}</Text> : null}
          </>
        )}
      </Card>
    </View>
  );
}

// ─── Submit-a-place FAB + form modal ─────────────────────────
const CATEGORY_OPTIONS = PLACE_CATEGORIES.map((cat) => ({ label: PLACE_CATEGORY_LABELS[cat], value: cat }));

export function SubmitPlaceFab({ onPress, style }: { onPress: () => void; style?: object }) {
  return (
    <TouchableOpacity style={[styles.fab, style]} activeOpacity={0.8} onPress={onPress}>
      <Plus size={22} color="#0A0A14" strokeWidth={2.6} />
    </TouchableOpacity>
  );
}

export function SubmitPlaceModal({
  visible,
  onClose,
  coordinate,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  coordinate: { latitude: number; longitude: number } | null;
  onSubmit: (input: { name: string; lat: number; lng: number; category: PlaceCategory; notes?: string; photoUrl?: string }) => Promise<{ error: string | null }>;
}) {
  const { theme } = useTheme();
  const { addXP } = useXP();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("cafe");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setName("");
    setCategory("cafe");
    setNotes("");
    setPhotoUri(null);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!coordinate) return;
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let photoUrl: string | undefined;
      if (photoUri) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (userId) {
          photoUrl = await uploadPlacePhoto(userId, photoUri);
        }
      }
      const result = await onSubmit({
        name: name.trim(),
        lat: coordinate.latitude,
        lng: coordinate.longitude,
        category,
        notes: notes.trim() || undefined,
        photoUrl,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      addXP(PLACE_SUBMIT_XP);
      setSuccess(true);
      setTimeout(handleClose, 1400);
    } catch {
      setError("Couldn't submit place, try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Submit a Place</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {success ? (
            <View style={styles.successBox}>
              <MapPin size={32} color={Colors.primary} />
              <Text style={[styles.successText, { color: theme.text }]}>Place added! +{PLACE_SUBMIT_XP} XP</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Input label="Name" placeholder="e.g. Warkop Kang Ujang" value={name} onChangeText={setName} />
              <Dropdown label="Category" placeholder="Select category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as PlaceCategory)} />
              <Input label="Notes (optional)" placeholder="What's good here?" value={notes} onChangeText={setNotes} multiline />
              <ImagePickerField label="Photo (optional)" value={photoUri} onChange={setPhotoUri} />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button title="Submit Place" onPress={handleSubmit} loading={submitting} disabled={submitting} style={styles.submitBtn} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "rgba(20,20,28,0.85)",
    borderWidth: 1,
    borderColor: "#2A2A3A",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  filterChipTextActive: {
    color: "#0A0A14",
  },
  markerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
  },
  sheetCard: {
    padding: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sheetLine: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  submitBtn: {
    marginTop: 8,
  },
  successBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  successText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
