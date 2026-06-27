import React, { useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions } from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, MapPin, Navigation, Plus, Minus, Car } from "lucide-react-native";
import Button from "@/components/Button";
import InteractiveMapView from "@/components/InteractiveMapView";
import Card from "@/components/Card";
import { useTheme } from "@/hooks/useThemeStore";
import { useTowing } from "@/hooks/useTowingStore";
import { SERVICE_TYPES } from "@/constants/mockData";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function LocationConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { 
    pickupLocation, 
    dropoffLocation,
    estimatedDistance, 
    calculatePrice,
    priceAdjustment,
    setPriceAdjustment,
    selectedServiceType
  } = useTowing();
  
  const serviceType = params.serviceType as string || selectedServiceType;
  
  useEffect(() => {
    console.log('🗺️ Location Confirmation - Params:', params);
    console.log('🗺️ Location Confirmation - Pickup:', pickupLocation?.address);
    console.log('🗺️ Location Confirmation - Dropoff:', dropoffLocation?.address);
    console.log('🗺️ Location Confirmation - Service Type:', serviceType);
  }, [params, pickupLocation, dropoffLocation, serviceType]);

  const handleBack = () => {
    router.back();
  };

  const handleContinue = () => {
    const returnTo = params.returnTo as string;
    // Navigate to car details section
    router.push({
      pathname: "/request-tow",
      params: { 
        serviceType,
        ...(returnTo === 'request-tow' ? { fromLocationSelection: 'true', step: '3' } : {})
      }
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const renderPriceBreakdown = () => {
    const serviceConfig = SERVICE_TYPES[serviceType as keyof typeof SERVICE_TYPES];
    if (!serviceConfig) return null;
    
    const roundedDistance = Math.ceil(estimatedDistance);
    
    if (serviceConfig.isFixed) {
      return (
        <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
          Tarif tetap untuk {serviceConfig.name}
        </Text>
      );
    }
    
    // Special handling for ladder towing with long distance rates
    if (serviceType === 'ladder') {
      const ladderService = serviceConfig as typeof SERVICE_TYPES.ladder;
      
      if (roundedDistance > (ladderService.longDistanceThreshold || 160)) {
        return (
          <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
            Luar kota ({roundedDistance} km × Rp{ladderService.longDistanceRate?.toLocaleString('id-ID') || '7.000'}): {formatPrice(roundedDistance * (ladderService.longDistanceRate || 7000))}
          </Text>
        );
      }
      
      return (
        <>
          <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
            Tarif dasar ({ladderService.baseDistance}km pertama): {formatPrice(ladderService.baseFare)}
          </Text>
          {roundedDistance > ladderService.baseDistance && (
            <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
              Tambahan ({roundedDistance - ladderService.baseDistance} km): {formatPrice((roundedDistance - ladderService.baseDistance) * ladderService.pricePerKm)}
            </Text>
          )}
        </>
      );
    }
    
    return (
      <>
        <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
          Tarif dasar ({serviceConfig.baseDistance}km pertama): {formatPrice(serviceConfig.baseFare)}
        </Text>
        {roundedDistance > serviceConfig.baseDistance && (
          <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
            Tambahan ({roundedDistance - serviceConfig.baseDistance} km): {formatPrice((roundedDistance - serviceConfig.baseDistance) * serviceConfig.pricePerKm)}
          </Text>
        )}
      </>
    );
  };

  // Check if we have the required data
  if (!pickupLocation || !dropoffLocation) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen 
          options={{
            title: "Konfirmasi Lokasi",
            headerTitleStyle: {
              fontWeight: "600",
              color: theme.textDark,
            },
            headerStyle: {
              backgroundColor: theme.card,
            },
            headerTintColor: theme.textDark,
          }} 
        />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textLight }]}>Lokasi belum dipilih</Text>
          <Button
            title="Pilih Lokasi"
            onPress={() => router.push('/map-selection')}
            variant="primary"
            size="medium"
            style={styles.emptyButton}
          />
        </View>
      </View>
    );
  }

  const estimatedPrice = calculatePrice(estimatedDistance, serviceType) * (1 + priceAdjustment / 100);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: "Konfirmasi Lokasi",
          headerTitleStyle: {
            fontWeight: "600",
            color: theme.textDark,
          },
          headerStyle: {
            backgroundColor: theme.card,
          },
          headerTintColor: theme.textDark,
          headerLeft: () => (
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <ArrowLeft size={24} color={theme.textDark} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      {/* Progress Indicator */}
      <View style={[styles.progressContainer, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.progressSteps}>
          <View style={[styles.progressStep, { backgroundColor: theme.success }]}>
            <MapPin size={16} color={theme.white} />
          </View>
          <View style={[styles.progressConnector, { backgroundColor: theme.primary }]} />
          <View style={[styles.progressStep, { backgroundColor: theme.primary }]}>
            <Navigation size={16} color={theme.white} />
          </View>
          <View style={[styles.progressConnector, { backgroundColor: theme.border }]} />
          <View style={[styles.progressStep, { backgroundColor: theme.border }]}>
            <Car size={16} color={theme.textLight} />
          </View>
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressLabel, { color: theme.success }]}>Lokasi</Text>
          <Text style={[styles.progressLabel, { color: theme.primary }]}>Peta</Text>
          <Text style={[styles.progressLabel, { color: theme.textLight }]}>Kendaraan</Text>
        </View>
      </View>
      
      {/* Content Container with ScrollView */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Text style={[styles.title, { color: theme.textDark }]}>Konfirmasi Rute Perjalanan</Text>
          <Text style={[styles.subtitle, { color: theme.textLight }]}>Periksa kembali lokasi penjemputan dan tujuan Anda</Text>
        </View>
        
        {/* Location Summary */}
        <Card style={[styles.locationCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.locationItem}>
            <View style={[styles.locationIcon, { backgroundColor: '#FF6B3520' }]}>
              <MapPin size={20} color="#FF6B35" />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Penjemputan</Text>
              <Text style={[styles.locationAddress, { color: theme.textDark }]} numberOfLines={2}>
                {pickupLocation.address}
              </Text>
            </View>
          </View>
          
          <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
          
          <View style={styles.locationItem}>
            <View style={[styles.locationIcon, { backgroundColor: '#22C55E20' }]}>
              <Navigation size={20} color="#22C55E" />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Tujuan</Text>
              <Text style={[styles.locationAddress, { color: theme.textDark }]} numberOfLines={2}>
                {dropoffLocation.address}
              </Text>
            </View>
          </View>
        </Card>
        
        {/* Large Interactive Map */}
        <View style={styles.mapContainer}>
          <InteractiveMapView
            pickup={pickupLocation}
            dropoff={dropoffLocation}
            interactive={false}
            style={styles.interactiveMap}
            currentStep="dropoff"
          />
        </View>
        
        {/* Service Type Info */}
        {serviceType && (
          <Card style={[styles.serviceCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.serviceTitle, { color: theme.textDark }]}>Layanan Terpilih</Text>
            <Text style={[styles.serviceName, { color: theme.primary }]}>
              {SERVICE_TYPES[serviceType as keyof typeof SERVICE_TYPES]?.name || serviceType}
            </Text>
          </Card>
        )}
        
        {/* Price Preview with Adjustment Controls */}
        {estimatedDistance > 0 && (
          <Card style={[styles.priceCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.priceHeader}>
              <Text style={[styles.priceLabel, { color: theme.textLight }]}>Estimasi Harga</Text>
              <View style={styles.priceControls}>
                <TouchableOpacity 
                  style={[styles.priceButton, { backgroundColor: theme.danger, opacity: priceAdjustment <= -30 ? 0.5 : 1 }]}
                  onPress={() => setPriceAdjustment(Math.max(-30, priceAdjustment - 5))}
                  disabled={priceAdjustment <= -30}
                >
                  <Minus size={16} color="white" />
                </TouchableOpacity>
                <Text style={[styles.priceValue, { color: theme.primary, marginHorizontal: 12 }]}>
                  {formatPrice(estimatedPrice)}
                </Text>
                <TouchableOpacity 
                  style={[styles.priceButton, { backgroundColor: theme.success, opacity: priceAdjustment >= 20 ? 0.5 : 1 }]}
                  onPress={() => setPriceAdjustment(Math.min(20, priceAdjustment + 5))}
                  disabled={priceAdjustment >= 20}
                >
                  <Plus size={16} color="white" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.priceDetails}>
              <Text style={[styles.priceDistance, { color: theme.textLight }]}>Jarak: {Math.ceil(estimatedDistance)} km</Text>
              {priceAdjustment !== 0 && (
                <Text style={[styles.priceAdjustment, { color: priceAdjustment > 0 ? theme.success : theme.danger }]}>
                  {priceAdjustment > 0 ? '+' : ''}{priceAdjustment}% dari harga dasar
                </Text>
              )}
            </View>
            <View style={styles.priceBreakdown}>
              {renderPriceBreakdown()}
            </View>
            <Text style={[styles.pricingNote, { color: theme.textLight }]}>
              {priceAdjustment < 0 ? '⚠️ Pengurangan harga mempengaruhi kecepatan mencari driver' : 
               priceAdjustment > 0 ? '✅ Harga lebih tinggi meningkatkan prioritas pencarian driver' :
               'Sesuaikan harga dengan tombol + / - di atas'}
            </Text>
          </Card>
        )}
      </ScrollView>
      
      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <Button
          title="Ubah Lokasi"
          onPress={() => router.push('/map-selection')}
          variant="outline"
          size="medium"
          style={styles.footerButton}
        />
        
        <Button
          title="Lanjut ke Kendaraan"
          onPress={handleContinue}
          variant="primary"
          size="medium"
          style={styles.footerButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  progressContainer: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  progressSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressConnector: {
    height: 2,
    width: 40,
    marginHorizontal: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerSection: {
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  locationCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  routeConnector: {
    height: 2,
    marginLeft: 32,
    marginRight: 16,
    marginVertical: 8,
  },
  mapContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    height: SCREEN_HEIGHT * 0.5, // 50% of screen height for large map
    minHeight: 350,
  },
  interactiveMap: {
    flex: 1,
    height: '100%',
    borderRadius: 16,
  },
  serviceCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  serviceName: {
    fontSize: 18,
    fontWeight: '600',
  },
  priceCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  priceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceAdjustment: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceDistance: {
    fontSize: 12,
    marginBottom: 4,
  },
  priceBreakdown: {
    marginBottom: 8,
  },
  pricePreviewText: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 2,
  },
  pricingNote: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 14,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyButton: {
    minWidth: 150,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  footerButton: {
    flex: 1,
  },
});