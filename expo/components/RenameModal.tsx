import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

interface RenameModalProps {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
}

export default function RenameModal({
  visible,
  title,
  initialValue,
  placeholder = "Route name",
  saving = false,
  onCancel,
  onSave,
}: RenameModalProps) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
          <View style={[styles.sheet, { marginBottom: insets.bottom + 20 }]}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onCancel} hitSlop={10}>
                <X size={20} color="#8A8A9A" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor="#5A5A6E"
              maxLength={100}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={() => value.trim() && onSave(value.trim())}
            />
            <TouchableOpacity
              style={[styles.saveBtn, (!value.trim() || saving) && styles.saveBtnDisabled]}
              onPress={() => value.trim() && onSave(value.trim())}
              disabled={!value.trim() || saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#FF3B30", "#FF3B6F"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtnGradient}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  kav: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#111119",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  saveBtn: { borderRadius: 14, overflow: "hidden" },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnGradient: { height: 50, justifyContent: "center", alignItems: "center" },
  saveBtnText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
});
