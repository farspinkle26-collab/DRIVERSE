import React, { useState, useCallback } from "react";
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
import { X, Globe, Lock, Users, Flag } from "lucide-react-native";
import { useParty } from "@/hooks/usePartyStore";

interface CreateConvoyModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CAPACITY_OPTIONS: { label: string; value: number }[] = [
  { label: "Unlimited", value: 0 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "25", value: 25 },
];

export default function CreateConvoyModal({ visible, onClose, onCreated }: CreateConvoyModalProps) {
  const insets = useSafeAreaInsets();
  const { createParty } = useParty();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "invite_only">("public");
  const [maxMembers, setMaxMembers] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && !submitting;

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setVisibility("public");
    setMaxMembers(0);
    setError(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const ok = await createParty(name, { visibility, description, maxMembers });
    if (!ok) {
      setError("Couldn't create convoy. Please try again.");
      setSubmitting(false);
      return;
    }
    reset();
    onCreated();
  }, [canSubmit, createParty, name, visibility, description, maxMembers, reset, onCreated]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Flag size={18} color="#3B82F6" />
                </View>
                <Text style={styles.headerTitle}>Start a Convoy</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                <X size={18} color="#8A8A9A" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Convoy name</Text>
              <TextInput
                style={styles.input}
                placeholder="Midnight Runners"
                placeholderTextColor="#4A4A5E"
                value={name}
                onChangeText={setName}
                maxLength={30}
              />

              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="What's this crew about?"
                placeholderTextColor="#4A4A5E"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={200}
              />

              <Text style={styles.label}>Who can join</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, visibility === "public" && styles.chipActive]}
                  onPress={() => setVisibility("public")}
                  activeOpacity={0.7}
                >
                  <Globe size={14} color={visibility === "public" ? "#3B82F6" : "#6A6A7E"} />
                  <Text style={[styles.chipText, visibility === "public" && { color: "#3B82F6" }]}>Anyone can join</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, visibility === "invite_only" && styles.chipActive]}
                  onPress={() => setVisibility("invite_only")}
                  activeOpacity={0.7}
                >
                  <Lock size={14} color={visibility === "invite_only" ? "#3B82F6" : "#6A6A7E"} />
                  <Text style={[styles.chipText, visibility === "invite_only" && { color: "#3B82F6" }]}>Invite only</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Max members</Text>
              <View style={styles.chipRow}>
                {CAPACITY_OPTIONS.map((o) => {
                  const active = maxMembers === o.value;
                  return (
                    <TouchableOpacity
                      key={o.label}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setMaxMembers(o.value)}
                      activeOpacity={0.7}
                    >
                      <Users size={13} color={active ? "#3B82F6" : "#6A6A7E"} />
                      <Text style={[styles.chipText, active && { color: "#3B82F6" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

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
                    <Text style={styles.submitBtnText}>Create Convoy</Text>
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
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "flex-end" },
  sheetWrap: { justifyContent: "flex-end" },
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(59,130,246,0.18)", borderWidth: 1, borderColor: "rgba(59,130,246,0.5)",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255, 255, 255, 0.06)", justifyContent: "center", alignItems: "center" },
  label: { color: "#8A8A9A", fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 8, letterSpacing: 0.4, textTransform: "uppercase" },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)",
    color: "#FFFFFF", fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  chipActive: { borderColor: "#3B82F6", backgroundColor: "rgba(59,130,246,0.12)" },
  chipText: { color: "#8A8A9A", fontSize: 13, fontWeight: "600" },
  errorText: { color: "#EF4444", fontSize: 13, fontWeight: "600", marginTop: 12 },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3B82F6",
    borderRadius: 16, paddingVertical: 15, marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
});
