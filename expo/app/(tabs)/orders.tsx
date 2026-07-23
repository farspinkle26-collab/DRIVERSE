import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useThemeStore";

export default function OrdersScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyTitle, { color: theme.textDark }]}>Tidak ada pesanan</Text>
        <Text style={[styles.emptyText, { color: theme.textLight }]}>
          Riwayat pesanan Anda akan muncul di sini.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
});
