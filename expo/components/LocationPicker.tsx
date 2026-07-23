import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Modal, FlatList, Platform } from "react-native";
import { MapPin, X, Navigation } from "lucide-react-native";
import * as ExpoLocation from "expo-location";
import Input from "./Input";
import Card from "./Card";
import Button from "./Button";
import { jakartaLandmarks } from "@/constants/mockData";
import { Location } from "@/types";
import { useTheme } from "@/hooks/useThemeStore";

interface LocationPickerProps {
  label: string;
  placeholder: string;
  value: Location | null;
  onChange: (location: Location) => void;
}

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLEMAPS || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "AIzaSyD_DU3RnAjfkIubXCfRpApH5usllH7O628";

const LocationPicker: React.FC<LocationPickerProps> = ({
  label,
  placeholder,
  value,
  onChange,
}) => {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setCurrentLocation] = useState<Location | null>(null);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.length > 2) {
        searchPlaces(searchQuery);
      } else {
        setPredictions([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const searchPlaces = async (query: string) => {
    try {
      setLoading(true);
      
      if (Platform.OS === 'web') {
        // For web, use mock data but also try to simulate Google Places API response
        const filteredLocations = jakartaLandmarks.filter(
          location => location.name.toLowerCase().includes(query.toLowerCase()) ||
                      location.address.toLowerCase().includes(query.toLowerCase())
        );
        
        const mockPredictions: PlacePrediction[] = filteredLocations.map((location, index) => ({
          place_id: `mock_${index}`,
          description: location.address,
          structured_formatting: {
            main_text: location.name,
            secondary_text: location.address,
          },
        }));
        
        // Add some common Indonesian locations for better search experience
        const commonPlaces = [
          { name: 'Jakarta', address: 'Jakarta, Indonesia' },
          { name: 'Bandung', address: 'Bandung, West Java, Indonesia' },
          { name: 'Surabaya', address: 'Surabaya, East Java, Indonesia' },
          { name: 'Yogyakarta', address: 'Yogyakarta, Special Region of Yogyakarta, Indonesia' },
          { name: 'Medan', address: 'Medan, North Sumatra, Indonesia' },
        ].filter(place => 
          place.name.toLowerCase().includes(query.toLowerCase()) ||
          place.address.toLowerCase().includes(query.toLowerCase())
        ).map((place, index) => ({
          place_id: `common_${index}`,
          description: place.address,
          structured_formatting: {
            main_text: place.name,
            secondary_text: place.address,
          },
        }));
        
        setPredictions([...mockPredictions, ...commonPlaces]);
        return;
      }

      // For native platforms, use Google Places API
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&components=country:id&types=establishment|geocode&language=id`
      );
      
      const data = await response.json();
      
      if (data.predictions) {
        setPredictions(data.predictions);
      } else if (data.error_message) {
        console.error('Google Places API error:', data.error_message);
        // Fallback to mock data
        const filteredLocations = jakartaLandmarks.filter(
          location => location.name.toLowerCase().includes(query.toLowerCase()) ||
                      location.address.toLowerCase().includes(query.toLowerCase())
        );
        
        const mockPredictions: PlacePrediction[] = filteredLocations.map((location, index) => ({
          place_id: `mock_${index}`,
          description: location.address,
          structured_formatting: {
            main_text: location.name,
            secondary_text: location.address,
          },
        }));
        
        setPredictions(mockPredictions);
      }
    } catch (error) {
      console.error('Error searching places:', error);
      // Fallback to mock data
      const filteredLocations = jakartaLandmarks.filter(
        location => location.name.toLowerCase().includes(query.toLowerCase()) ||
                    location.address.toLowerCase().includes(query.toLowerCase())
      );
      
      const mockPredictions: PlacePrediction[] = filteredLocations.map((location, index) => ({
        place_id: `mock_${index}`,
        description: location.address,
        structured_formatting: {
          main_text: location.name,
          secondary_text: location.address,
        },
      }));
      
      setPredictions(mockPredictions);
    } finally {
      setLoading(false);
    }
  };

  const getPlaceDetails = async (placeId: string) => {
    try {
      setLoading(true);
      
      if (placeId.startsWith('mock_')) {
        // Handle mock data
        const index = parseInt(placeId.replace('mock_', ''));
        const location = jakartaLandmarks[index];
        if (location) {
          onChange({
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address,
          });
        }
        setModalVisible(false);
        return;
      }
      
      if (placeId.startsWith('common_')) {
        // Handle common places
        const commonCoordinates: { [key: string]: { lat: number, lng: number } } = {
          'Jakarta': { lat: -6.2088, lng: 106.8456 },
          'Bandung': { lat: -6.9175, lng: 107.6191 },
          'Surabaya': { lat: -7.2575, lng: 112.7521 },
          'Yogyakarta': { lat: -7.7956, lng: 110.3695 },
          'Medan': { lat: 3.5952, lng: 98.6722 },
        };
        
        const prediction = predictions.find(p => p.place_id === placeId);
        if (prediction) {
          const cityName = prediction.structured_formatting.main_text;
          const coords = commonCoordinates[cityName] || { lat: -6.2088, lng: 106.8456 };
          
          onChange({
            latitude: coords.lat,
            longitude: coords.lng,
            address: prediction.description,
          });
        }
        setModalVisible(false);
        return;
      }

      if (Platform.OS === 'web') {
        // For web, use geocoding to get real coordinates
        const prediction = predictions.find(p => p.place_id === placeId);
        if (prediction) {
          try {
            // Use Google Geocoding API to get real coordinates
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(prediction.description)}&key=${GOOGLE_MAPS_API_KEY}`;
            const geocodeResponse = await fetch(geocodeUrl);
            const geocodeData = await geocodeResponse.json();
            if (geocodeData.status === 'OK' && geocodeData.results.length > 0) {
              const { lat, lng } = geocodeData.results[0].geometry.location;
              onChange({
                latitude: lat,
                longitude: lng,
                address: prediction.description,
              });
            } else {
              // Last resort: use fallback data with real coordinates
              onChange({
                latitude: -6.2088,
                longitude: 106.8456,
                address: prediction.description,
              });
            }
          } catch (geocodeError) {
            console.error('Geocoding error:', geocodeError);
            onChange({
              latitude: -6.2088,
              longitude: 106.8456,
              address: prediction.description,
            });
          }
        }
        setModalVisible(false);
        return;
      }

      // For native platforms, use Google Places Details API
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`
      );
      
      const data = await response.json();
      
      if (data.result && data.result.geometry) {
        const location = data.result.geometry.location;
        onChange({
          latitude: location.lat,
          longitude: location.lng,
          address: data.result.formatted_address,
        });
        setModalVisible(false);
      } else {
        console.error('No geometry data found for place');
        // Fallback to prediction description
        const prediction = predictions.find(p => p.place_id === placeId);
        if (prediction) {
          onChange({
            latitude: -6.2088,
            longitude: 106.8456,
            address: prediction.description,
          });
        }
        setModalVisible(false);
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      // Fallback to prediction description
      const prediction = predictions.find(p => p.place_id === placeId);
      if (prediction) {
        onChange({
          latitude: -6.2088,
          longitude: 106.8456,
          address: prediction.description,
        });
      }
      setModalVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.BestForNavigation,
      });

      const currentLoc: Location = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: 'Current Location',
      };

      // Get address from coordinates using reverse geocoding
      try {
        const reverseGeocode = await ExpoLocation.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        
        if (reverseGeocode.length > 0) {
          const addr = reverseGeocode[0];
          currentLoc.address = `${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || ''}, ${addr.region || ''}`.trim();
        }
      } catch (error) {
        console.error('Error reverse geocoding:', error);
      }

      setCurrentLocation(currentLoc);
      onChange(currentLoc);
      setModalVisible(false);
    } catch (error) {
      console.error('Error getting current location:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLocation = (location: typeof jakartaLandmarks[0]) => {
    onChange({
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    });
    setModalVisible(false);
  };

  const filteredLocations = jakartaLandmarks.filter(
    location => location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                location.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textDark }]}>{label}</Text>
      
      <TouchableOpacity 
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
          }
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <MapPin size={20} color={theme.primary} style={styles.icon} />
        <Text 
          style={[
            styles.inputText,
            { color: value ? theme.text : theme.textLight },
          ]}
          numberOfLines={1}
        >
          {value ? value.address : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.overlay }]}>
          <Card style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textDark }]}>Select Location</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder="Search location..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIcon={<MapPin size={20} color={theme.primary} />}
              containerStyle={styles.searchContainer}
            />

            {/* Current Location Button */}
            <Button
              title="Use Current Location"
              onPress={getCurrentLocation}
              variant="outline"
              size="medium"
              icon={<Navigation size={20} color={theme.primary} />}
              iconPosition="left"
              style={styles.currentLocationButton}
              loading={loading}
            />

            {/* Search Results */}
            {predictions.length > 0 ? (
              <FlatList
                data={predictions}
                keyExtractor={(item) => item.place_id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.locationItem}
                    onPress={() => getPlaceDetails(item.place_id)}
                  >
                    <MapPin size={20} color={theme.primary} style={styles.locationIcon} />
                    <View style={styles.locationInfo}>
                      <Text style={[styles.locationName, { color: theme.text }]}>
                        {item.structured_formatting.main_text}
                      </Text>
                      <Text style={[styles.locationAddress, { color: theme.textLight }]}>
                        {item.structured_formatting.secondary_text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                style={styles.locationsList}
              />
            ) : searchQuery.length === 0 ? (
              <FlatList
                data={filteredLocations}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.locationItem}
                    onPress={() => handleSelectLocation(item)}
                  >
                    <MapPin size={20} color={theme.primary} style={styles.locationIcon} />
                    <View style={styles.locationInfo}>
                      <Text style={[styles.locationName, { color: theme.text }]}>{item.name}</Text>
                      <Text style={[styles.locationAddress, { color: theme.textLight }]}>{item.address}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                style={styles.locationsList}
              />
            ) : (
              <View style={styles.noResults}>
                <Text style={[styles.noResultsText, { color: theme.textLight }]}>
                  {loading ? 'Searching...' : 'No results found'}
                </Text>
              </View>
            )}
          </Card>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: "100%",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  icon: {
    marginRight: 8,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  searchContainer: {
    marginBottom: 12,
  },
  currentLocationButton: {
    marginBottom: 16,
  },
  locationsList: {
    maxHeight: 300,
  },
  noResults: {
    padding: 20,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
  },
  locationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  locationIcon: {
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: "500",
  },
  locationAddress: {
    fontSize: 14,
    marginTop: 2,
  },
  separator: {
    height: 1,
  },
});

export default LocationPicker;