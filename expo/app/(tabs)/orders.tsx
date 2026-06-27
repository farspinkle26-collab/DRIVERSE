import React, { useState } from "react";
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useThemeStore";
import { useTowing } from "@/hooks/useTowingStore";
import RequestCard from "@/components/RequestCard";
import { useAuth } from "@/hooks/useAuthStore";
import { TowRequest } from "@/types";

export default function OrdersScreen() {
  const router = useRouter();
  const { user, isDriver = false, isCustomer } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { requestHistory, activeRequest, acceptTowRequest, completeTowRequest, cancelTowRequest } = useTowing();
  const [filter, setFilter] = useState<string>("all");

  const getFilterLabel = (filterValue: string) => {
    const labels: { [key: string]: string } = {
      pending: "menunggu",
      accepted: "diterima", 
      in_progress: "berlangsung",
      completed: "selesai",
      cancelled: "dibatalkan"
    };
    return labels[filterValue] || filterValue;
  };

  // Filter requests based on user type
  const userRequests = [...(activeRequest ? [activeRequest] : []), ...requestHistory].filter(request => {
    if (isDriver) {
      // Drivers see requests assigned to them or available requests
      return request.driverId === user?.id || request.status === 'pending';
    } else {
      // Customers see their own requests
      return request.customerId === user?.id;
    }
  });

  const filteredRequests = userRequests.filter(request => {
    if (filter === "all") return true;
    return request.status === filter;
  });

  const handleViewDetails = (request: TowRequest) => {
    router.push({
      pathname: "/request-details" as any,
      params: { id: request.id }
    });
  };

  const handleAccept = async (requestId: string) => {
    await acceptTowRequest(requestId);
  };

  const handleComplete = async () => {
    await completeTowRequest();
  };

  const handleCancel = async () => {
    await cancelTowRequest();
  };

  const renderFilterButton = (label: string, value: string) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        {
          backgroundColor: filter === value ? theme.primary : theme.background,
          borderColor: filter === value ? theme.primary : theme.border,
        }
      ]}
      onPress={() => setFilter(value)}
    >
      <Text
        style={[
          styles.filterButtonText,
          {
            color: filter === value ? theme.white : theme.text,
            fontWeight: filter === value ? "500" : "400",
          }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.filtersContainer, { borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScrollContent}>
          {renderFilterButton("Semua", "all")}
          {renderFilterButton("Menunggu", "pending")}
          {renderFilterButton("Diterima", "accepted")}
          {renderFilterButton("Berlangsung", "in_progress")}
          {renderFilterButton("Selesai", "completed")}
          {renderFilterButton("Dibatalkan", "cancelled")}
        </ScrollView>
      </View>

      {filteredRequests.length > 0 ? (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestCard
              request={item}
              onViewDetails={() => handleViewDetails(item)}
              onAccept={isDriver && item.status === "pending" ? () => handleAccept(item.id) : undefined}
              onComplete={(item.status === "accepted" || item.status === "in_progress") ? handleComplete : undefined}
              onCancel={item.status !== "completed" && item.status !== "cancelled" ? handleCancel : undefined}
              showDriverActions={isDriver}
              showDriverView={isDriver}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Platform.OS === 'android' ? 90 + insets.bottom + 20 : 110 }
          ]}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: theme.textDark }]}>Tidak ada pesanan</Text>
          <Text style={[styles.emptyText, { color: theme.textLight }]}>
            {filter !== "all" 
              ? `Anda tidak memiliki pesanan dengan status ${getFilterLabel(filter)}.` 
              : isDriver 
                ? "Pesanan yang tersedia atau ditugaskan kepada Anda akan muncul di sini."
                : "Riwayat pesanan Anda akan muncul di sini."}
          </Text>
        </View>
      )}
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  filtersScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
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