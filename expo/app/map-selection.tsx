import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, MapPin, Navigation } from "lucide-react-native";
import Button from "@/components/Button";
import InteractiveMapView from "@/components/InteractiveMapView";
import Card from "@/components/Card";
import { useTheme } from "@/hooks/useThemeStore";
import { useTowing } from "@/hooks/useTowingStore";
import { Location } from "@/types";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MapSelectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { 
    setLocations, 
    pickupLocation, 
    dropoffLocation,
    estimatedDistance, 
  } = useTowing();
  
  const [currentStep, setCurrentStep] = useState<'pickup' | 'dropoff'>('pickup');
  const [tempPickup, setTempPickup] = useState<Location | null>(pickupLocation);
  const [tempDropoff, setTempDropoff] = useState<Location | null>(dropoffLocation);
  const [centerLocation, setCenterLocation] = useState<Location | null>(null);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const serviceType = params.serviceType as string;

  // Real-time distance calculation
  useEffect(() => {
    if (tempPickup && tempDropoff) {
      setLocations(tempPickup, tempDropoff);
    }
  }, [tempPickup, tempDropoff]);

  const handleBack = () => {
    if (currentStep === 'dropoff' && !tempDropoff) {
      setCurrentStep('pickup');
    } else {
      router.back();
    }
  };

  const handleSelectLocation = () => {
    if (!centerLocation) return;

    if (currentStep === 'pickup') {
      setTempPickup(centerLocation);
      // Auto-switch to dropoff
      setCurrentStep('dropoff');
    } else {
      setTempDropoff(centerLocation);
    }
  };

  // Handle location selection from search
  const handleLocationChange = (pickup: Location | null, dropoff: Location | null) => {
    if (pickup) {
      setTempPickup(pickup);
      setCenterLocation(pickup);
    }
    if (dropoff) {
      setTempDropoff(dropoff);
      setCenterLocation(dropoff);
    }
  };

  const handleContinue = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!tempPickup) newErrors.pickup = "Silakan pilih lokasi penjemputan";
    if (!tempDropoff) newErrors.dropoff = "Silakan pilih lokasi tujuan";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setLocations(tempPickup, tempDropoff);
    
    const returnTo = params.returnTo as string;
    
    if (returnTo === 'request-tow') {
      router.push({
        pathname: "/location-confirmation",
        params: { serviceType, returnTo: 'request-tow' }
      });
    } else {
      router.push({
        pathname: "/location-confirmation",
        params: { serviceType }
      });
    }
  };

  const canSelect = centerLocation !== null;
  const stepLabel = currentStep === 'pickup' ? 'Penjemputan' : 'Tujuan';
  const stepQuestion = currentStep === 'pickup' 
    ? 'Dimana kendaraan Anda berada?'
    : 'Kemana kendaraan akan diderek?';

  const showRoute = tempPickup && tempDropoff;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: "Pilih Lokasi",
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
      
      {/* Step Indicator - Compact bar */}
      <View style={[styles.stepBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity 
          style={[styles.stepTab, currentStep === 'pickup' && styles.stepTabActive]}
          onPress={() => setCurrentStep('pickup')}
        >
          <View style={[styles.stepDotSmall, { 
            backgroundColor: tempPickup ? '#FF6B35' : (currentStep === 'pickup' ? '#FF6B35' : theme.border) 
          }]} />
          <Text style={[styles.stepTabText, { 
            color: currentStep === 'pickup' ? theme.textDark : theme.textLight,
            fontWeight: currentStep === 'pickup' ? '600' : '400'
          }]}>
            Penjemputan{tempPickup ? ' ✓' : ''}
          </Text>
        </TouchableOpacity>
        
        <View style={[styles.stepArrow, { backgroundColor: theme.border }]} />
        
        <TouchableOpacity 
          style={[styles.stepTab, currentStep === 'dropoff' && styles.stepTabActive]}
          onPress={() => setCurrentStep('dropoff')}
        >
          <View style={[styles.stepDotSmall, { 
            backgroundColor: tempDropoff ? '#22C55E' : (currentStep === 'dropoff' ? '#FF6B35' : theme.border) 
          }]} />
          <Text style={[styles.stepTabText, { 
            color: currentStep === 'dropoff' ? theme.textDark : theme.textLight,
            fontWeight: currentStep === 'dropoff' ? '600' : '400'
          }]}>
            Tujuan{tempDropoff ? ' ✓' : ''}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Map with Center Pin */}
      <View style={styles.mapWrapper}>
        <InteractiveMapView
          pickup={tempPickup}
          dropoff={tempDropoff}
          interactive={false}
          style={styles.fullMap}
          currentStep={currentStep}
          showCenterPin={true}
          showSearch={true}
          onLocationChange={handleLocationChange}
          onCenterChange={(location) => {
            setCenterLocation(location);
          }}
        />
      </View>
      
      {/* Address bar at top of map — below search, above center pin */}
      {centerLocation && (
        <View style={styles.addressOverlay} pointerEvents="none">
          <View style={[styles.addressRow, { backgroundColor: 'rgba(255, 255, 255, 0.95)' }]}>
            <View style={styles.addressDot}>
              <MapPin size={16} color={currentStep === 'pickup' ? '#FF6B35' : '#22C55E'} />
            </View>
            <View style={styles.addressTextCol}>
              <Text style={[styles.addressStepLabel, { color: currentStep === 'pickup' ? '#FF6B35' : '#22C55E' }]}>
                {stepLabel}
              </Text>
              <Text style={styles.addressText} numberOfLines={2}>
                {centerLocation.address}
              </Text>
            </View>
          </View>
        </View>
      )}
      
      {/* Bottom Sheet */}
      <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {/* Header */}
        <Text style={[styles.bottomTitle, { color: theme.textDark }]}>
          {stepQuestion}
        </Text>
        
        {/* Selected locations summary */}
        {(tempPickup || tempDropoff) && (
          <View style={styles.selectedSummary}>
            {tempPickup && (
              <View style={styles.selectedItem}>
                <View style={[styles.selectedIcon, { backgroundColor: '#FF6B3520' }]}>
                  <MapPin size={12} color="#FF6B35" />
                </View>
                <Text style={[styles.selectedText, { color: theme.textDark }]} numberOfLines={1}>
                  {tempPickup.address.split(',')[0]}
                </Text>
              </View>
            )}
            {tempPickup && tempDropoff && (
              <View style={styles.selectedDivider}>
                <View style={[styles.dividerLine, { backgroundColor: '#FF6B35' }]} />
                <Text style={[styles.dividerLabel, { color: '#FF6B35' }]}>
                  {estimatedDistance > 0 ? `${estimatedDistance.toFixed(1)} km` : ''}
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: '#FF6B35' }]} />
              </View>
            )}
            {tempDropoff && (
              <View style={styles.selectedItem}>
                <View style={[styles.selectedIcon, { backgroundColor: '#22C55E20' }]}>
                  <Navigation size={12} color="#22C55E" />
                </View>
                <Text style={[styles.selectedText, { color: theme.textDark }]} numberOfLines={1}>
                  {tempDropoff.address.split(',')[0]}
                </Text>
              </View>
            )}
          </View>
        )}
        
        {/* Error messages */}
        {errors.pickup && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.pickup}</Text>}
        {errors.dropoff && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.dropoff}</Text>}
        
        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <Button
            title="Pilih Lokasi"
            onPress={handleSelectLocation}
            variant="primary"
            size="large"
            style={styles.primaryButton}
            disabled={!canSelect}
          />
          
          <Button
            title={tempPickup && tempDropoff ? "Lanjutkan" : "Lewati"}
            onPress={handleContinue}
            variant={tempPickup && tempDropoff ? "primary" : "outline"}
            size="medium"
            style={styles.secondaryButton}
            disabled={!tempPickup || !tempDropoff}
          />
        </View>
        
        {/* Helper text */}
        <Text style={[styles.helperText, { color: theme.textLight }]}>
          Geser peta hingga pin merah tepat di lokasi yang diinginkan, lalu tekan "Pilih Lokasi"
        </Text>
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
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  stepTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  stepTabActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  stepTabText: {
    fontSize: 13,
  },
  stepDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepArrow: {
    height: 2,
    width: 20,
    marginHorizontal: 8,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  fullMap: {
    flex: 1,
    borderRadius: 0,
  },
  addressOverlay: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    zIndex: 15,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    gap: 10,
  },
  addressDot: {
    marginTop: 2,
  },
  addressTextCol: {
    flex: 1,
  },
  addressStepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  bottomSheet: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  selectedSummary: {
    marginBottom: 12,
  },
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  selectedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedText: {
    fontSize: 13,
    flex: 1,
  },
  selectedDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 12,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionButtons: {
    gap: 10,
    marginBottom: 8,
  },
  primaryButton: {
    width: '100%',
  },
  secondaryButton: {
    width: '100%',
  },
  errorText: {
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
