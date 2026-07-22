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
import { X, Flag } from "lucide-react-native";
import { useConvoys } from "@/hooks/useConvoysStore";

interface CreateConvoyModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ACCENT = "#3B82F6";

export default function CreateConvoyModal({ visible, onClose, onCreated }: CreateConvoyModalProps) {
  const insets = useSafeAreaInsets();
  const { createConvoy } = useConvoys();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 3 && tag.trim().length >= 2 && !submitting;

  const reset = useCallback(() => {
    setName("");
    setTag("");
    setDescription("");
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

    const result = await createConvoy({ name, tag, description });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    reset();
    onCreated();
  }, [canSubmit, createConvoy, name, tag, description, reset, onCreated]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Flag size={18} color={ACCENT} />
                </View>
                <Text style={styles.headerTitle}>Start a Convoy</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                <X size={18} color="#8A8A9A" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Crew name</Text>
              <TextInput
                style={styles.input}
                placeholder="Midnight Runners"
                placeholderTextColor="#4A4A5E"
                value={name}
                onChangeText={setName}
                maxLength={40}
              />

              <Text style={styles.label}>Tag (2-6 letters)</Text>
              <TextInput
                style={styles.input}
                placeholder="MDNT"
                placeholderTextColor="#4A4A5E"
                value={tag}
                onChangeText={(t) => setTag(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={6}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="What's this crew about?"
                placeholderTextColor="#4A4A5E"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={300}
              />

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
    maxHeight: "80%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: `${ACCENT}18`,
    borderWidth: 1,
    borderColor: `${ACCENT}50`,
  },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
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
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  errorText: { color: "#EF4444", fontSize: 13, fontWeight: "600", marginTop: 12 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 20,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
});
