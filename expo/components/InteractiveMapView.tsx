import React, { useEffect, useState, useRef, useCallback } from "react";
import { StyleSheet, View, Text, Platform } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import { Location as LocationType } from "@/types";
import Card from "./Card";
import MapboxSearch from "./MapboxSearch";
import MapboxTileLayer from "./MapboxTileLayer";
import { useTheme } from "@/hooks/useThemeStore";
import { getDirections, reverseGeocode } from "@/lib/mapboxApi";

interface InteractiveMapViewProps {
  pickup: LocationType | null;
  dropoff: LocationType | null;
  driverLocation?: LocationType | null;
  style?: any;
  onLocationChange?: (pickup: LocationType | null, dropoff: LocationType | null) => void;
  interactive?: boolean;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  currentStep?: 'pickup' | 'dropoff';
  /** Called when the map center changes (for drag-to-place) */
  onCenterChange?: (location: LocationType) => void;
  /** Whether to show the fixed center pin */
  showCenterPin?: boolean;
  /** Whether to show the search bar overlay */
  showSearch?: boolean;
}

const InteractiveMapView: React.FC<InteractiveMapViewProps> = ({
  pickup,
  dropoff,
  driverLocation,
  style,
  onLocationChange,
  interactive = false,
  onMapPress,
  currentStep = 'pickup',
  onCenterChange,
  showCenterPin = false,
  showSearch = false,
}) => {
  const { theme } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<{latitude: number, longitude: number}[]>([]);
  const [distance, setDistance] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlacingMarker, setIsPlacingMarker] = useState(false);
  const [centerAddress, setCenterAddress] = useState<string>("");
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [region, setRegion] = useState({
    latitude: -6.2088,
    longitude: 106.8456,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const calculateRoute = useCallback(async (origin: LocationType, destination: LocationType) => {
    const fallbackToStraightLine = () => {
      const dist = calculateStraightLineDistance(origin, destination);
      setDistance(dist);
      setDuration(Math.round(dist * 2));
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      ]);
    };

    try {
      const result = await getDirections(origin, destination);
      if (!result) {
        console.warn('🗺️ Mapbox directions returned no route');
        fallbackToStraightLine();
        return;
      }

      setRouteCoordinates(result.coordinates);
      setDistance(result.distanceKm);
      setDuration(result.durationMin);
    } catch (error) {
      console.error('🗺️ Error calculating route:', error);
      fallbackToStraightLine();
    }
  }, []);

  const fitToCoordinates = useCallback(() => {
    if (mapRef.current && pickup && dropoff) {
      const coordinates = [pickup, dropoff];
      if (driverLocation) coordinates.push(driverLocation);
      
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [pickup, dropoff, driverLocation]);

  useEffect(() => {
    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
      fitToCoordinates();
    } else if (pickup && mapRef.current) {
      mapRef.current.animateCamera({
        center: {
          latitude: pickup.latitude,
          longitude: pickup.longitude,
        },
        zoom: 15,
      }, { duration: 500 });
    } else if (dropoff && mapRef.current) {
      mapRef.current.animateCamera({
        center: {
          latitude: dropoff.latitude,
          longitude: dropoff.longitude,
        },
        zoom: 15,
      }, { duration: 500 });
    } else if (currentLocation && mapRef.current && showCenterPin) {
      // Auto-center on user's GPS when no locations set yet
      mapRef.current.animateCamera({
        center: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        zoom: 15,
      }, { duration: 500 });
    }
  }, [pickup, dropoff, currentLocation, showCenterPin, calculateRoute, fitToCoordinates]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      if (!location?.coords) {
        console.log('No coordinates returned from GPS');
        return;
      }

      const currentLoc: LocationType = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: 'Lokasi Saat Ini',
      };

      setCurrentLocation(currentLoc);
      setRegion((prev) => ({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }));

      // Reverse geocode to get readable address
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        if (results.length > 0) {
          const addr = results[0];
          const parts = [addr.street, addr.streetNumber, addr.city, addr.region].filter(Boolean);
          if (parts.length > 0) {
            currentLoc.address = parts.join(', ');
            setCurrentLocation({ ...currentLoc, address: parts.join(', ') });
          }
        }
      } catch (reverseErr) {
        console.log('Reverse geocode fallback:', reverseErr);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
    }
  };

  const calculateStraightLineDistance = (origin: LocationType, destination: LocationType): number => {
    const R = 6371;
    const dLat = (destination.latitude - origin.latitude) * Math.PI / 180;
    const dLon = (destination.longitude - origin.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(origin.latitude * Math.PI / 180) * Math.cos(destination.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const reverseGeocodeCoordinate = async (latitude: number, longitude: number): Promise<string> => {
    try {
      const mapboxAddress = await reverseGeocode(latitude, longitude);
      if (mapboxAddress) {
        return mapboxAddress;
      }

      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results.length > 0) {
        const addr = results[0];
        const parts = [addr.street, addr.streetNumber, addr.city, addr.region].filter(Boolean);
        return parts.join(', ') || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }
      
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
      console.error('Reverse geocode error:', error);
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };

  // Handle center pin drag-to-place
  const handleRegionChangeComplete = useCallback(async (newRegion: Region) => {
    if (!showCenterPin || !onCenterChange) return;

    // Debounce reverse geocoding
    if (reverseGeocodeTimeout.current) {
      clearTimeout(reverseGeocodeTimeout.current);
    }

    reverseGeocodeTimeout.current = setTimeout(async () => {
      const address = await reverseGeocodeCoordinate(newRegion.latitude, newRegion.longitude);
      setCenterAddress(address);
      onCenterChange({
        latitude: newRegion.latitude,
        longitude: newRegion.longitude,
        address,
      });
    }, 300);
  }, [showCenterPin, onCenterChange]);

  const handleMapPress = async (event: any) => {
    const { coordinate } = event.nativeEvent;
    
    if (interactive && onLocationChange) {
      setIsPlacingMarker(true);
      
      const address = await reverseGeocodeCoordinate(coordinate.latitude, coordinate.longitude);
      const newLocation: LocationType = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        address,
      };
      
      if (currentStep === 'pickup') {
        onLocationChange(newLocation, dropoff);
      } else {
        onLocationChange(pickup, newLocation);
      }
      
      setIsPlacingMarker(false);
      
      if (onMapPress) {
        onMapPress(coordinate);
      }
    } else if (onMapPress) {
      onMapPress(event.nativeEvent.coordinate);
    }
  };

  const getInitialRegion = () => {
    if (pickup) {
      return {
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
    }
    
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
    }

    return region;
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
        mapType={Platform.OS === 'web' ? undefined : 'none'}
        initialRegion={getInitialRegion()}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsCompass={true}
        zoomEnabled={true}
        scrollEnabled={true}
        onPress={interactive && !showCenterPin ? handleMapPress : undefined}
        onRegionChangeComplete={showCenterPin ? handleRegionChangeComplete : undefined}
      >
        <MapboxTileLayer />

        {pickup && (
          <Marker
            coordinate={{ latitude: pickup.latitude, longitude: pickup.longitude }}
            title="Penjemputan"
            description={pickup.address}
            pinColor="#FF6B35"
          />
        )}
        
        {dropoff && (
          <Marker
            coordinate={{ latitude: dropoff.latitude, longitude: dropoff.longitude }}
            title="Tujuan"
            description={dropoff.address}
            pinColor="#22C55E"
          />
        )}
        
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
            title="Driver"
            description="Lokasi Driver"
            pinColor="#3B82F6"
          />
        )}
        
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#FF6B35"
            strokeWidth={5}
            geodesic={true}
          />
        )}
      </MapView>

      {/* Search bar overlay - always at top when showSearch is true */}
      {showSearch && (
        <View style={styles.searchOverlay}>
          <MapboxSearch
            onLocationSelect={(location) => {
              if (currentStep === 'pickup') {
                onLocationChange?.(location, dropoff);
                if (mapRef.current) {
                  mapRef.current.animateCamera({
                    center: { latitude: location.latitude, longitude: location.longitude },
                    zoom: 16,
                  }, { duration: 500 });
                }
              } else {
                onLocationChange?.(pickup, location);
                if (mapRef.current) {
                  mapRef.current.animateCamera({
                    center: { latitude: location.latitude, longitude: location.longitude },
                    zoom: 16,
                  }, { duration: 500 });
                }
              }
            }}
            placeholder="Cari lokasi..."
            currentLocation={currentLocation}
            style={styles.mapboxSearch}
            autoFocus={false}
          />
        </View>
      )}

      {/* Fixed center pin for drag-to-place mode */}
      {showCenterPin && (
        <View style={styles.centerPinContainer} pointerEvents="none">
          <View style={styles.centerPinWrapper}>
            <View style={styles.centerPinDot} />
            <View style={styles.centerPinShadow} />
          </View>
        </View>
      )}

{interactive && !showCenterPin && (
        <View style={styles.searchContainer}>
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>
              👆 Ketuk peta untuk memilih lokasi {currentStep === 'pickup' ? 'penjemputan' : 'tujuan'}
            </Text>
          </View>
          <MapboxSearch
            onLocationSelect={(location) => {
              if (currentStep === 'pickup') {
                onLocationChange?.(location, dropoff);
              } else {
                onLocationChange?.(pickup, location);
              }
            }}
            placeholder="Atau cari lokasi di sini..."
            currentLocation={pickup || undefined}
            style={styles.mapboxSearch}
            autoFocus={false}
          />
        </View>
      )}

      {isPlacingMarker && (
        <View style={styles.placingOverlay}>
          <Text style={styles.placingText}>Mendapatkan alamat...</Text>
        </View>
      )}

      {(pickup || dropoff) && !showCenterPin && (
        <View style={styles.infoContainer}>
          {pickup && (
            <Card style={[styles.locationCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>📍 Pickup</Text>
              <Text style={[styles.locationAddress, { color: theme.text }]} numberOfLines={2}>
                {pickup.address}
              </Text>
            </Card>
          )}
          
          {dropoff && (
            <Card style={[styles.locationCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>🏁 Dropoff</Text>
              <Text style={[styles.locationAddress, { color: theme.text }]} numberOfLines={2}>
                {dropoff.address}
              </Text>
            </Card>
          )}

          {distance > 0 && pickup && dropoff && (
            <Card style={[styles.locationCard, { backgroundColor: '#FF6B35' + '20' }]}>
              <Text style={[styles.locationLabel, { color: '#FF6B35' }]}>🛣️ Route</Text>
              <Text style={[styles.locationAddress, { color: '#FF6B35' }]}>
                {distance.toFixed(1)} km • {Math.round(duration)} min
              </Text>
            </Card>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    minHeight: 400,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  // Center pin for drag-to-place
  centerPinContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  centerPinWrapper: {
    alignItems: "center",
    marginTop: -30, // Offset to account for pin tip position
  },
  centerPinDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  centerPinShadow: {
    width: 4,
    height: 24,
    backgroundColor: "#EF4444",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    marginTop: -2,
  },
  searchOverlay: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  searchContainer: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  tapHint: {
    backgroundColor: 'rgba(255, 107, 53, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    alignSelf: 'center',
  },
  tapHintText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  placingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 500,
  },
  placingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  mapboxSearch: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  infoContainer: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 0,
  },
  locationCard: {
    padding: 12,
    marginBottom: 4,
  },
  locationLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: "600",
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: "500",
  },
});

export default InteractiveMapView;
