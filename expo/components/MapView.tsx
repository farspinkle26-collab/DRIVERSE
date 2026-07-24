import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, Text, Platform } from "react-native";
import * as Location from "expo-location";
import { Location as LocationType } from "@/types";
import Colors from "@/constants/colors";
import Card from "./Card";
import { useTheme } from "@/hooks/useThemeStore";

// Universal map component that works on all platforms
const UniversalMapView = ({ children, style, ...props }: any) => {
  return (
    <View style={[style, styles.mapContainer]}>
      {children}
    </View>
  );
};

interface MapViewProps {
  pickup: LocationType | null;
  dropoff: LocationType | null;
  driverLocation?: LocationType | null;
  style?: any;
  onLocationChange?: (pickup: LocationType | null, dropoff: LocationType | null) => void;
  interactive?: boolean;
  showDriverRoute?: boolean;
}

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLEMAPS || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "AIzaSyD_DU3RnAjfkIubXCfRpApH5usllH7O628";

const MapView: React.FC<MapViewProps> = ({
  pickup,
  dropoff,
  driverLocation,
  style,
  onLocationChange,
  interactive = false,
  showDriverRoute = false,
}) => {
  const { theme } = useTheme();
  const mapRef = useRef<any>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<{latitude: number, longitude: number}[]>([]);
  const [distance, setDistance] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Calculate route when pickup and dropoff change
  useEffect(() => {
    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
      fitToCoordinates();
    }
  }, [pickup, dropoff]);

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

      const currentLoc: LocationType = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: 'Current Location',
      };

      setCurrentLocation(currentLoc);
    } catch (error) {
      console.error('Error getting current location:', error);
    }
  };

  const calculateRoute = async (origin: LocationType, destination: LocationType) => {
    if (Platform.OS === 'web') {
      // For web, use a simple straight line
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      ]);
      
      // Calculate straight-line distance
      const dist = calculateStraightLineDistance(origin, destination);
      setDistance(dist);
      setDuration(Math.round(dist * 2)); // Estimate 2 minutes per km
      return;
    }

    try {
      const originStr = `${origin.latitude},${origin.longitude}`;
      const destinationStr = `${destination.latitude},${destination.longitude}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&key=${GOOGLE_MAPS_API_KEY}`;
      
      console.log('🗺️ MapView - Fetching route from Directions API...');
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('🗺️ MapView - Directions API status:', data.status);
      
      if (data.status !== 'OK') {
        console.warn('🗺️ MapView - Directions API non-OK:', data.status, data.error_message || '');
        throw new Error(`Directions API returned ${data.status}`);
      }
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const points = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(points);
        
        const leg = route.legs[0];
        setDistance(leg.distance.value / 1000);
        setDuration(leg.duration.value / 60);
      }
    } catch (error) {
      console.error('🗺️ Error calculating route:', error);
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      ]);
      
      const dist = calculateStraightLineDistance(origin, destination);
      setDistance(dist);
      setDuration(Math.round(dist * 2));
    }
  };

  const calculateStraightLineDistance = (origin: LocationType, destination: LocationType): number => {
    const R = 6371; // Earth radius in km
    const dLat = (destination.latitude - origin.latitude) * Math.PI / 180;
    const dLon = (destination.longitude - origin.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(origin.latitude * Math.PI / 180) * Math.cos(destination.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const decodePolyline = (encoded: string) => {
    const points = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  };

  const fitToCoordinates = () => {
    if (mapRef.current && pickup && dropoff) {
      const coordinates = [pickup, dropoff];
      if (driverLocation) coordinates.push(driverLocation);
      
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  const handleMarkerDragEnd = (coordinate: {latitude: number, longitude: number}, type: 'pickup' | 'dropoff') => {
    if (!interactive || !onLocationChange) return;

    const newLocation: LocationType = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      address: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
    };

    if (type === 'pickup') {
      onLocationChange(newLocation, dropoff);
    } else {
      onLocationChange(pickup, newLocation);
    }
  };

  const getInitialRegion = () => {
    if (pickup) {
      return {
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }
    
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    // Default to Jakarta
    return {
      latitude: -6.2088,
      longitude: 106.8456,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  };



  return (
    <View style={[styles.container, style]}>
      <UniversalMapView style={styles.map}>
        {/* Universal map content */}
        <Text style={[styles.mapText, { color: theme.text }]}>🗺️ Map View</Text>
        {pickup && (
          <Text style={[styles.locationText, { color: theme.textLight }]}>
            📍 From: {pickup.address}
          </Text>
        )}
        {dropoff && (
          <Text style={[styles.locationText, { color: theme.textLight }]}>
            🏁 To: {dropoff.address}
          </Text>
        )}
        {distance > 0 && (
          <Text style={[styles.locationText, { color: theme.primary }]}>
            🛣️ Distance: {distance.toFixed(1)} km
          </Text>
        )}
        {driverLocation && (
          <Text style={[styles.locationText, { color: theme.textLight }]}>
            🚗 Driver: {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
          </Text>
        )}
        {showDriverRoute && driverLocation && (
          <Text style={[styles.locationText, { color: '#22C55E' }]}>
            🛣️ Driver sedang menuju lokasi Anda
          </Text>
        )}
        
        {/* Show route line */}
        {pickup && dropoff && (
          <View style={styles.routeIndicator}>
            <View style={[styles.marker, { backgroundColor: '#22C55E' }]}>
              <Text style={styles.markerText}>A</Text>
            </View>
            <View style={[styles.routeLine, { backgroundColor: '#FF6B35' }]} />
            <View style={[styles.marker, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.markerText}>B</Text>
            </View>
          </View>
        )}
      </UniversalMapView>

      {/* Location info overlay */}
      {(pickup || dropoff) && (
        <View style={styles.infoContainer}>
          {pickup && (
            <Card style={[styles.locationCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Pickup</Text>
              <Text style={[styles.locationAddress, { color: theme.text }]} numberOfLines={1}>
                {pickup.address}
              </Text>
            </Card>
          )}
          
          {dropoff && (
            <Card style={[styles.locationCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Dropoff</Text>
              <Text style={[styles.locationAddress, { color: theme.text }]} numberOfLines={1}>
                {dropoff.address}
              </Text>
            </Card>
          )}

          {distance > 0 && (
            <Card style={[styles.locationCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Route Info</Text>
              <Text style={[styles.locationAddress, { color: theme.text }]}>
                {distance.toFixed(1)} km • {Math.round(duration)} min
              </Text>
            </Card>
          )}
          
          {driverLocation && (
            <Card style={[styles.locationCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.locationLabel, { color: theme.textLight }]}>Driver</Text>
              <Text style={[styles.locationAddress, { color: theme.text }]} numberOfLines={1}>
                {showDriverRoute ? "Sedang menuju lokasi" : `${driverLocation.latitude.toFixed(6)}, ${driverLocation.longitude.toFixed(6)}`}
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
    height: 300,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  mapContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#f8f9fa',
  },
  mapText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  locationText: {
    fontSize: 14,
    marginBottom: 4,
    textAlign: "center",
  },
  routeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 40,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  markerText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  routeLine: {
    flex: 1,
    height: 4,
    marginHorizontal: 8,
    borderRadius: 2,
  },
  infoContainer: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
  },
  locationCard: {
    padding: 12,
    marginBottom: 8,
  },
  locationLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: "500",
  },
});

export default MapView;