import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Alert, Linking, Platform } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Phone, MapPin, Navigation } from "lucide-react-native";
import Colors from "@/constants/colors";
import Button from "@/components/Button";
import Card from "@/components/Card";
import MapView from "@/components/MapView";
import { useTowing } from "@/hooks/useTowingStore";
import { useAuth } from "@/hooks/useAuthStore";
import { useRealtime } from "@/hooks/useRealtimeStore";
import { useTheme } from "@/hooks/useThemeStore";
import { TowRequest, Driver } from "@/types";
import DriverCard from "@/components/DriverCard";
import { mockDrivers } from "@/constants/mockData";

export default function RequestDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { 
    activeRequest, 
    requestHistory, 
    acceptTowRequest, 
    cancelTowRequest,
    loading 
  } = useTowing();
  const {
    driverLocation,
    setConnectedUserId,
    loadChatMessages
  } = useRealtime();
  
  const [request, setRequest] = useState<TowRequest | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  
  const isCustomer = user?.role === "customer";

  useEffect(() => {
    if (!id) return;
    
    // Find the request in active or history
    const foundRequest = activeRequest?.id === id 
      ? activeRequest 
      : requestHistory.find(req => req.id === id);
    
    if (foundRequest) {
      setRequest(foundRequest);
      
      // Find driver info if available
      if (foundRequest.driverId) {
        const foundDriver = mockDrivers.find(d => d.id === foundRequest.driverId);
        if (foundDriver) {
          setDriver(foundDriver);
        }
        
        // Set up chat connection if request is accepted
        if (foundRequest.status === 'accepted' || foundRequest.status === 'in_progress') {
          if (isCustomer && foundRequest.driverId) {
            setConnectedUserId(foundRequest.driverId);
            loadChatMessages(foundRequest.id);
          } else if (!isCustomer && foundRequest.customerId) {
            setConnectedUserId(foundRequest.customerId);
            loadChatMessages(foundRequest.id);
          }
        }
      }
    }
  }, [id, activeRequest, requestHistory, isCustomer, setConnectedUserId, loadChatMessages]);

  const handleAccept = async () => {
    if (!request) return;
    
    const success = await acceptTowRequest(request.id);
    if (success) {
      Alert.alert("Success", "You have accepted this tow request.");
    }
  };

  const handleCancel = async () => {
    Alert.alert(
      "Batalkan Permintaan",
      "Apakah Anda yakin ingin membatalkan permintaan derek ini?",
      [
        {
          text: "Tidak",
          style: "cancel",
        },
        {
          text: "Ya, Batalkan",
          onPress: async () => {
            const success = await cancelTowRequest();
            if (success) {
              Alert.alert("Berhasil", "Permintaan derek berhasil dibatalkan.");
              router.replace("/orders");
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  const handleCallDriver = async () => {
    if (!driver?.phone) {
      Alert.alert("Error", "Nomor telepon driver tidak tersedia");
      return;
    }

    const phoneNumber = driver.phone.replace(/[^0-9]/g, '');
    const phoneUrl = Platform.select({
      ios: `tel:${phoneNumber}`,
      android: `tel:${phoneNumber}`,
      web: `tel:${phoneNumber}`
    });

    try {
      const canOpen = await Linking.canOpenURL(phoneUrl!);
      if (canOpen) {
        await Linking.openURL(phoneUrl!);
      } else {
        Alert.alert("Error", "Tidak dapat membuka aplikasi telepon");
      }
    } catch (error) {
      console.error('Error opening phone app:', error);
      Alert.alert("Error", "Gagal membuka aplikasi telepon");
    }
  };

  const handleOpenChat = () => {
    if (!request) return;
    
    // Determine receiverId based on user role
    let receiverId: string;
    if (isCustomer) {
      // Customer chatting with driver
      receiverId = request.driverId || 'unknown';
    } else {
      // Driver chatting with customer
      receiverId = request.customerId || 'unknown';
    }
    
    router.push({
      pathname: "/chat",
      params: { 
        requestId: request.id,
        receiverId: receiverId
      }
    });
  };

  const handlePayment = () => {
    if (!request) return;
    
    // Navigate to payment checkout with request details
    router.push({
      pathname: "/payment-checkout",
      params: {
        towRequestId: request.id,
        amount: request.price?.toString() || "0",
        companyId: "test_company_001", // This should come from the request
        driverId: request.driverId,
      }
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getServiceTypeName = (serviceType: string) => {
    const serviceTypeMap: { [key: string]: string } = {
      'hydraulic': 'Towing Hidraulik',
      'ladder': 'Towing Tangga',
      'accident': 'Towing Katrol',
      'service': 'Service Car',
      'roller_tire': 'Derek Sepatu Roda',
      'free_wheel': 'Free Wheel',
      'selfloader': 'Selfloader',
      'dolly': 'Dolly',
      'double_deck': 'Double Deck',
      'moge_transport': 'Moge Transport',
      'basement_towing': 'Derek Basement',
    };
    return serviceTypeMap[serviceType] || serviceType;
  };

  const getBreakdownTypeName = (breakdownType?: string) => {
    const breakdownMap: { [key: string]: string } = {
      'engine_wont_start': 'Mesin Tidak Mau Hidup',
      'accident': 'Kecelakaan',
      'flat_tire': 'Ban Kempes',
      'stuck': 'Kendaraan Terjebak',
      'battery_dead': 'Aki Soak',
      'overheating': 'Overheat',
      'other': 'Lainnya',
    };
    return breakdownMap[breakdownType || ''] || breakdownType || 'Tidak diketahui';
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };



  if (!request) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: "Detail Permintaan" }} />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textLight }]}>Permintaan tidak ditemukan</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: "Permintaan Towing Masuk",
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.textDark,
          headerTitleStyle: { color: theme.textDark },
          headerRight: () => (
            request.status !== "completed" && request.status !== "cancelled" ? (
              <Button
                title="Tolak"
                onPress={handleCancel}
                variant="text"
                size="small"
                textStyle={{ color: Colors.danger }}
              />
            ) : null
          ),
        }} 
      />
      
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusContainer, { backgroundColor: Colors.danger }]}>
          <Text style={styles.statusText}>⏰ {formatTime(request.createdAt)}</Text>
        </View>
        
        <MapView
          pickup={request.pickup}
          dropoff={request.dropoff}
          driverLocation={driverLocation || driver?.location}
          style={styles.map}
          showDriverRoute={request.status === 'accepted' || request.status === 'in_progress'}
        />
        
        {/* Real-time Driver Status */}
        {(request.status === 'accepted' || request.status === 'in_progress') && driverLocation && isCustomer && (
          <Card style={[styles.trackingCard, { backgroundColor: theme.card }]}>
            <View style={styles.trackingHeader}>
              <Navigation size={20} color={theme.primary} />
              <Text style={[styles.trackingTitle, { color: theme.textDark }]}>Pelacakan Driver Real-time</Text>
            </View>
            <Text style={[styles.trackingText, { color: theme.textLight }]}>Driver sedang dalam perjalanan menuju lokasi Anda</Text>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Lokasi Driver Saat Ini:</Text>
              <Text style={[styles.locationValue, { color: theme.textDark }]}>
                {driverLocation.latitude.toFixed(6)}, {driverLocation.longitude.toFixed(6)}
              </Text>
            </View>
            <View style={styles.chatPrompt}>
              <Text style={[styles.chatPromptText, { color: theme.textLight }]}>
                💬 Anda dapat berkomunikasi dengan driver melalui chat atau telepon
              </Text>
            </View>
          </Card>
        )}
        
        <Card style={[styles.detailsCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Informasi Pelanggan</Text>
          
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Phone size={16} color={Colors.primary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={[styles.detailLabel, { color: theme.textLight }]}>Farel</Text>
              <Text style={[styles.detailValue, { color: theme.textDark }]}>087771984633</Text>
            </View>
          </View>
        </Card>
        
        <Card style={[styles.detailsCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Detail Layanan</Text>
          
          <View style={styles.detailItem}>
            <View style={styles.detailContent}>
              <Text style={[styles.serviceType, { color: Colors.danger }]}>
                {getServiceTypeName(request.serviceType || '')}
              </Text>
              <Text style={[styles.detailValue, { color: theme.textDark }]}>
                Masalah: {getBreakdownTypeName(request.breakdownInfo?.type)}
                {request.breakdownInfo?.notes && ` - ${request.breakdownInfo.notes}`}
              </Text>
            </View>
          </View>
        </Card>
        
        <Card style={[styles.detailsCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Kendaraan</Text>
          
          <View style={styles.detailItem}>
            <View style={styles.detailContent}>
              <Text style={[styles.vehicleInfo, { color: theme.textDark }]}>
                {request.vehicleInfo?.make} {request.vehicleInfo?.model} ({request.vehicleInfo?.color})
              </Text>
              <Text style={[styles.detailValue, { color: theme.textLight }]}>
                {request.vehicleInfo?.licensePlate}
              </Text>
            </View>
          </View>
        </Card>
        
        <Card style={[styles.detailsCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Lokasi</Text>
          
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <MapPin size={16} color={Colors.success} />
            </View>
            <View style={styles.detailContent}>
              <Text style={[styles.detailLabel, { color: theme.textLight }]}>Penjemputan</Text>
              <Text style={[styles.detailValue, { color: theme.textDark }]}>
                {request.pickup.address}
              </Text>
            </View>
          </View>
          
          {request.dropoff && (
            <View style={styles.detailItem}>
              <View style={styles.detailIcon}>
                <Navigation size={16} color={Colors.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: theme.textLight }]}>Tujuan</Text>
                <Text style={[styles.detailValue, { color: theme.textDark }]}>
                  {request.dropoff.address}
                </Text>
              </View>
            </View>
          )}
        </Card>
        

        
        {driver && (
          <Card style={[styles.driverCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Informasi Driver</Text>
            <DriverCard
              driver={driver}
              onCall={handleCallDriver}
              onMessage={handleOpenChat}
            />
          </Card>
        )}
        
        <View style={styles.bottomSpacing} />
      </ScrollView>
      
      {/* Action Buttons */}
      <View style={[styles.actionBar, { backgroundColor: theme.background }]}>
        {request.status === 'pending' && !isCustomer && (
          <>
            <Button
              title="✕ Tolak"
              onPress={handleCancel}
              variant="outline"
              size="large"
              style={[styles.rejectButton, { borderColor: Colors.danger }]}
              textStyle={{ color: Colors.danger }}
            />
            <Button
              title="✓ Terima"
              onPress={handleAccept}
              variant="primary"
              size="large"
              style={[styles.acceptButton, { backgroundColor: Colors.success }]}
              loading={loading}
            />
          </>
        )}
        
        {request.status === 'completed' && isCustomer && (
          <Button
            title={`💳 Bayar Sekarang - ${formatPrice(request.price || 0)}`}
            onPress={handlePayment}
            variant="primary"
            size="large"
            style={[styles.paymentButton, { backgroundColor: Colors.primary }]}
          />
        )}
        
        {(request.status === 'accepted' || request.status === 'in_progress') && (
          <Button
            title="💬 Buka Chat"
            onPress={handleOpenChat}
            variant="primary"
            size="large"
            style={[styles.chatButton, { backgroundColor: Colors.primary }]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
  statusContainer: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.white,
  },
  serviceType: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  trackingCard: {
    marginBottom: 16,
    padding: 16,
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  trackingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  trackingText: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationLabel: {
    fontSize: 12,
  },
  locationValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  chatPrompt: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  chatPromptText: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  map: {
    marginBottom: 16,
  },
  detailsCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.textDark,
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: "row",
    marginBottom: 12,
  },
  detailIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  priceContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "bold",
  },
  priceDetails: {
    alignItems: "flex-end",
    marginTop: 8,
  },
  priceDetailText: {
    fontSize: 12,
    lineHeight: 16,
  },
  photosContainer: {
    marginBottom: 16,
  },
  photosContent: {
    paddingRight: 16,
  },
  vehiclePhoto: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginRight: 12,
  },
  driverCard: {
    marginBottom: 24,
  },
  actionButton: {
    marginBottom: 16,
  },

  actionBar: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rejectButton: {
    flex: 1,
  },
  acceptButton: {
    flex: 1,
  },
  paymentButton: {
    flex: 1,
  },
  chatButton: {
    flex: 1,
  },
  bottomSpacing: {
    height: 20,
  },
});