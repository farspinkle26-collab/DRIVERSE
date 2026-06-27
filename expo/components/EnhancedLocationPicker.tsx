import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Modal, FlatList } from "react-native";
import { MapPin, X, Search } from "lucide-react-native";
import * as ExpoLocation from "expo-location";
import Input from "./Input";
import Card from "./Card";
import Button from "./Button";
import InteractiveMapView from "./InteractiveMapView";
import { jakartaLandmarks } from "@/constants/mockData";
import { Location } from "@/types";
import { useTheme } from "@/hooks/useThemeStore";

interface EnhancedLocationPickerProps {
  label: string;
  placeholder: string;
  value: Location | null;
  onChange: (location: Location) => void;
  showMap?: boolean;
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

console.log('Google Maps API Key configured:', GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here' ? 'Yes' : 'No');

const EnhancedLocationPicker: React.FC<EnhancedLocationPickerProps> = ({
  label,
  placeholder,
  value,
  onChange,
  showMap = true,
}) => {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(value);
  const [showMapView, setShowMapView] = useState(false);

  const searchPlaces = useCallback(async (query: string) => {
    try {
      setLoading(true);
      
      if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "your_google_maps_api_key_here") {
        console.warn('Google Maps API key not configured, using fallback data');
        handleFallbackSearch(query);
        return;
      }
      
      // Enhanced Google Places API with comprehensive search types
      // This will search for ALL types of places in Indonesia including:
      // - Streets, roads, and addresses (geocode)
      // - Buildings, landmarks, and POIs (establishment)
      // - Administrative areas like cities, villages (administrative_area_level_1-5)
      // - Natural features, parks, etc. (natural_feature)
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=id&components=country:id&types=(regions)&sessiontoken=${Date.now()}`;
      console.log('Making comprehensive Google Places API request for:', query);
      
      const response = await fetch(url);
      const data = await response.json();
      
      let allPredictions: PlacePrediction[] = [];
      
      if (data.status === 'OK' && data.predictions) {
        allPredictions = [...data.predictions];
      }
      
      // Make additional requests for different place types to get comprehensive results
      const additionalSearches = [
        // Search for establishments (businesses, landmarks, buildings)
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=id&components=country:id&types=establishment&sessiontoken=${Date.now()}_est`,
        // Search for addresses and geocoded locations
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=id&components=country:id&types=geocode&sessiontoken=${Date.now()}_geo`,
      ];
      
      // Execute additional searches in parallel
      const additionalResults = await Promise.allSettled(
        additionalSearches.map(async (url) => {
          const response = await fetch(url);
          const data = await response.json();
          return data.status === 'OK' && data.predictions ? data.predictions : [];
        })
      );
      
      // Combine all results and remove duplicates
      additionalResults.forEach((result) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          result.value.forEach((prediction: PlacePrediction) => {
            // Avoid duplicates by checking place_id
            if (!allPredictions.some(p => p.place_id === prediction.place_id)) {
              allPredictions.push(prediction);
            }
          });
        }
      });
      
      if (allPredictions.length > 0) {
        console.log('Google Places API comprehensive search success:', allPredictions.length, 'total results for:', query);
        // Sort by relevance (Google already provides them sorted, but we can prioritize certain types)
        const sortedPredictions = allPredictions.sort((a, b) => {
          // Prioritize exact matches in main_text
          const aMainMatch = a.structured_formatting.main_text.toLowerCase().includes(query.toLowerCase());
          const bMainMatch = b.structured_formatting.main_text.toLowerCase().includes(query.toLowerCase());
          if (aMainMatch && !bMainMatch) return -1;
          if (!aMainMatch && bMainMatch) return 1;
          return 0;
        });
        setPredictions(sortedPredictions.slice(0, 15)); // Limit to 15 results for performance
      } else {
        console.log('No results from Google Places API, using fallback');
        handleFallbackSearch(query);
      }
    } catch (error) {
      console.error('Error searching places:', error);
      handleFallbackSearch(query);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.length > 1) {
        searchPlaces(searchQuery);
      } else {
        setPredictions([]);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchPlaces]);

  const handleFallbackSearch = (query: string) => {
    // Enhanced fallback with Indonesian locations including popular places
    const enhancedLocations = [
      ...jakartaLandmarks,
      // Major Cities
      { name: 'Jakarta Pusat', address: 'Jakarta Pusat, DKI Jakarta, Indonesia', latitude: -6.1745, longitude: 106.8227 },
      { name: 'Jakarta Selatan', address: 'Jakarta Selatan, DKI Jakarta, Indonesia', latitude: -6.2615, longitude: 106.8106 },
      { name: 'Jakarta Utara', address: 'Jakarta Utara, DKI Jakarta, Indonesia', latitude: -6.1388, longitude: 106.8650 },
      { name: 'Jakarta Barat', address: 'Jakarta Barat, DKI Jakarta, Indonesia', latitude: -6.1352, longitude: 106.7674 },
      { name: 'Jakarta Timur', address: 'Jakarta Timur, DKI Jakarta, Indonesia', latitude: -6.2250, longitude: 106.9004 },
      { name: 'Bandung', address: 'Bandung, Jawa Barat, Indonesia', latitude: -6.9175, longitude: 107.6191 },
      { name: 'Surabaya', address: 'Surabaya, Jawa Timur, Indonesia', latitude: -7.2575, longitude: 112.7521 },
      { name: 'Yogyakarta', address: 'Yogyakarta, DI Yogyakarta, Indonesia', latitude: -7.7956, longitude: 110.3695 },
      { name: 'Medan', address: 'Medan, Sumatera Utara, Indonesia', latitude: 3.5952, longitude: 98.6722 },
      { name: 'Semarang', address: 'Semarang, Jawa Tengah, Indonesia', latitude: -6.9667, longitude: 110.4167 },
      { name: 'Makassar', address: 'Makassar, Sulawesi Selatan, Indonesia', latitude: -5.1477, longitude: 119.4327 },
      { name: 'Palembang', address: 'Palembang, Sumatera Selatan, Indonesia', latitude: -2.9761, longitude: 104.7754 },
      { name: 'Tangerang', address: 'Tangerang, Banten, Indonesia', latitude: -6.1783, longitude: 106.6319 },
      { name: 'Bekasi', address: 'Bekasi, Jawa Barat, Indonesia', latitude: -6.2383, longitude: 106.9756 },
      { name: 'Depok', address: 'Depok, Jawa Barat, Indonesia', latitude: -6.4025, longitude: 106.7942 },
      { name: 'Bogor', address: 'Bogor, Jawa Barat, Indonesia', latitude: -6.5971, longitude: 106.8060 },
      { name: 'Malang', address: 'Malang, Jawa Timur, Indonesia', latitude: -7.9666, longitude: 112.6326 },
      { name: 'Denpasar', address: 'Denpasar, Bali, Indonesia', latitude: -8.6705, longitude: 115.2126 },
      { name: 'Balikpapan', address: 'Balikpapan, Kalimantan Timur, Indonesia', latitude: -1.2379, longitude: 116.8529 },
      { name: 'Banjarmasin', address: 'Banjarmasin, Kalimantan Selatan, Indonesia', latitude: -3.3194, longitude: 114.5906 },
      // Popular Malls and Landmarks
      { name: 'Mall Taman Anggrek', address: 'Mall Taman Anggrek, Jakarta Barat, Indonesia', latitude: -6.1782, longitude: 106.7920 },
      { name: 'Grand Indonesia', address: 'Grand Indonesia, Jakarta Pusat, Indonesia', latitude: -6.1944, longitude: 106.8231 },
      { name: 'Plaza Indonesia', address: 'Plaza Indonesia, Jakarta Pusat, Indonesia', latitude: -6.1944, longitude: 106.8231 },
      { name: 'Senayan City', address: 'Senayan City, Jakarta Selatan, Indonesia', latitude: -6.2297, longitude: 106.8019 },
      { name: 'Pondok Indah Mall', address: 'Pondok Indah Mall, Jakarta Selatan, Indonesia', latitude: -6.2659, longitude: 106.7844 },
      { name: 'Kelapa Gading Mall', address: 'Kelapa Gading Mall, Jakarta Utara, Indonesia', latitude: -6.1588, longitude: 106.9056 },
      { name: 'Bandara Soekarno-Hatta', address: 'Bandara Soekarno-Hatta, Tangerang, Banten, Indonesia', latitude: -6.1256, longitude: 106.6559 },
      { name: 'Bandara Halim Perdanakusuma', address: 'Bandara Halim Perdanakusuma, Jakarta Timur, Indonesia', latitude: -6.2665, longitude: 106.8911 },
      { name: 'Stasiun Gambir', address: 'Stasiun Gambir, Jakarta Pusat, Indonesia', latitude: -6.1754, longitude: 106.8308 },
      { name: 'Stasiun Pasar Senen', address: 'Stasiun Pasar Senen, Jakarta Pusat, Indonesia', latitude: -6.1722, longitude: 106.8417 },
    ];
    
    const filteredLocations = enhancedLocations.filter(
      location => location.name.toLowerCase().includes(query.toLowerCase()) ||
                  location.address.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10); // Limit to 10 results for better performance
    
    const mockPredictions: PlacePrediction[] = filteredLocations.map((location, index) => ({
      place_id: `fallback_${index}`,
      description: location.address,
      structured_formatting: {
        main_text: location.name,
        secondary_text: location.address.replace(location.name + ', ', ''),
      },
    }));
    
    setPredictions(mockPredictions);
  };

  const getPlaceDetails = async (placeId: string) => {
    try {
      setLoading(true);
      
      if (placeId.startsWith('fallback_')) {
        // Handle fallback data - use the same enhanced locations as in handleFallbackSearch
        const enhancedLocations = [
          ...jakartaLandmarks,
          // Major Cities
          { name: 'Jakarta Pusat', address: 'Jakarta Pusat, DKI Jakarta, Indonesia', latitude: -6.1745, longitude: 106.8227 },
          { name: 'Jakarta Selatan', address: 'Jakarta Selatan, DKI Jakarta, Indonesia', latitude: -6.2615, longitude: 106.8106 },
          { name: 'Jakarta Utara', address: 'Jakarta Utara, DKI Jakarta, Indonesia', latitude: -6.1388, longitude: 106.8650 },
          { name: 'Jakarta Barat', address: 'Jakarta Barat, DKI Jakarta, Indonesia', latitude: -6.1352, longitude: 106.7674 },
          { name: 'Jakarta Timur', address: 'Jakarta Timur, DKI Jakarta, Indonesia', latitude: -6.2250, longitude: 106.9004 },
          { name: 'Bandung', address: 'Bandung, Jawa Barat, Indonesia', latitude: -6.9175, longitude: 107.6191 },
          { name: 'Surabaya', address: 'Surabaya, Jawa Timur, Indonesia', latitude: -7.2575, longitude: 112.7521 },
          { name: 'Yogyakarta', address: 'Yogyakarta, DI Yogyakarta, Indonesia', latitude: -7.7956, longitude: 110.3695 },
          { name: 'Medan', address: 'Medan, Sumatera Utara, Indonesia', latitude: 3.5952, longitude: 98.6722 },
          { name: 'Semarang', address: 'Semarang, Jawa Tengah, Indonesia', latitude: -6.9667, longitude: 110.4167 },
          { name: 'Makassar', address: 'Makassar, Sulawesi Selatan, Indonesia', latitude: -5.1477, longitude: 119.4327 },
          { name: 'Palembang', address: 'Palembang, Sumatera Selatan, Indonesia', latitude: -2.9761, longitude: 104.7754 },
          { name: 'Tangerang', address: 'Tangerang, Banten, Indonesia', latitude: -6.1783, longitude: 106.6319 },
          { name: 'Bekasi', address: 'Bekasi, Jawa Barat, Indonesia', latitude: -6.2383, longitude: 106.9756 },
          { name: 'Depok', address: 'Depok, Jawa Barat, Indonesia', latitude: -6.4025, longitude: 106.7942 },
          { name: 'Bogor', address: 'Bogor, Jawa Barat, Indonesia', latitude: -6.5971, longitude: 106.8060 },
          { name: 'Malang', address: 'Malang, Jawa Timur, Indonesia', latitude: -7.9666, longitude: 112.6326 },
          { name: 'Denpasar', address: 'Denpasar, Bali, Indonesia', latitude: -8.6705, longitude: 115.2126 },
          { name: 'Balikpapan', address: 'Balikpapan, Kalimantan Timur, Indonesia', latitude: -1.2379, longitude: 116.8529 },
          { name: 'Banjarmasin', address: 'Banjarmasin, Kalimantan Selatan, Indonesia', latitude: -3.3194, longitude: 114.5906 },
          // Popular Malls and Landmarks
          { name: 'Mall Taman Anggrek', address: 'Mall Taman Anggrek, Jakarta Barat, Indonesia', latitude: -6.1782, longitude: 106.7920 },
          { name: 'Grand Indonesia', address: 'Grand Indonesia, Jakarta Pusat, Indonesia', latitude: -6.1944, longitude: 106.8231 },
          { name: 'Plaza Indonesia', address: 'Plaza Indonesia, Jakarta Pusat, Indonesia', latitude: -6.1944, longitude: 106.8231 },
          { name: 'Senayan City', address: 'Senayan City, Jakarta Selatan, Indonesia', latitude: -6.2297, longitude: 106.8019 },
          { name: 'Pondok Indah Mall', address: 'Pondok Indah Mall, Jakarta Selatan, Indonesia', latitude: -6.2659, longitude: 106.7844 },
          { name: 'Kelapa Gading Mall', address: 'Kelapa Gading Mall, Jakarta Utara, Indonesia', latitude: -6.1588, longitude: 106.9056 },
          { name: 'Bandara Soekarno-Hatta', address: 'Bandara Soekarno-Hatta, Tangerang, Banten, Indonesia', latitude: -6.1256, longitude: 106.6559 },
          { name: 'Bandara Halim Perdanakusuma', address: 'Bandara Halim Perdanakusuma, Jakarta Timur, Indonesia', latitude: -6.2665, longitude: 106.8911 },
          { name: 'Stasiun Gambir', address: 'Stasiun Gambir, Jakarta Pusat, Indonesia', latitude: -6.1754, longitude: 106.8308 },
          { name: 'Stasiun Pasar Senen', address: 'Stasiun Pasar Senen, Jakarta Pusat, Indonesia', latitude: -6.1722, longitude: 106.8417 },
        ];
        
        const index = parseInt(placeId.replace('fallback_', ''));
        const location = enhancedLocations[index];
        if (location) {
          const newLocation = {
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address,
          };
          setSelectedLocation(newLocation);
          onChange(newLocation);
        }
        setModalVisible(false);
        return;
      }

      if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "your_google_maps_api_key_here") {
        console.warn('Google Maps API key not configured for place details');
        // Enhanced fallback using Geocoding API alternative
        const prediction = predictions.find(p => p.place_id === placeId);
        if (prediction) {
          // Try to extract coordinates from description using a simple geocoding fallback
          const newLocation = await geocodeAddress(prediction.description);
          setSelectedLocation(newLocation);
          onChange(newLocation);
        }
        setModalVisible(false);
        return;
      }

      // Enhanced Google Places Details API request with comprehensive fields
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name,address_components,types,place_id&key=${GOOGLE_MAPS_API_KEY}&language=id`;
      console.log('Making comprehensive Google Places Details API request for place_id:', placeId);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.result && data.result.geometry) {
        const location = data.result.geometry.location;
        const result = data.result;
        
        // Create a comprehensive address from the result
        let formattedAddress = result.formatted_address;
        
        // If formatted_address is not available, construct from address_components
        if (!formattedAddress && result.address_components) {
          const components = result.address_components;
          const streetNumber = components.find((c: any) => c.types.includes('street_number'))?.long_name || '';
          const route = components.find((c: any) => c.types.includes('route'))?.long_name || '';
          const locality = components.find((c: any) => c.types.includes('locality'))?.long_name || '';
          const adminLevel1 = components.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name || '';
          const country = components.find((c: any) => c.types.includes('country'))?.long_name || '';
          
          formattedAddress = [streetNumber, route, locality, adminLevel1, country]
            .filter(Boolean)
            .join(', ');
        }
        
        const newLocation = {
          latitude: location.lat,
          longitude: location.lng,
          address: formattedAddress || result.name || 'Lokasi yang dipilih',
        };
        
        console.log('Google Places Details comprehensive success:', newLocation);
        setSelectedLocation(newLocation);
        onChange(newLocation);
        setModalVisible(false);
      } else {
        console.error('Google Places Details error:', data.error_message || data.status);
        // Enhanced fallback with geocoding
        const prediction = predictions.find(p => p.place_id === placeId);
        if (prediction) {
          const newLocation = await geocodeAddress(prediction.description);
          setSelectedLocation(newLocation);
          onChange(newLocation);
        }
        setModalVisible(false);
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      // Enhanced fallback with geocoding
      const prediction = predictions.find(p => p.place_id === placeId);
      if (prediction) {
        const newLocation = await geocodeAddress(prediction.description);
        setSelectedLocation(newLocation);
        onChange(newLocation);
      }
      setModalVisible(false);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced geocoding fallback function
  const geocodeAddress = async (address: string): Promise<Location> => {
    try {
      if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "your_google_maps_api_key_here") {
        // Use Google Geocoding API as fallback
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&language=id&region=id`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const result = data.results[0];
          return {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng,
            address: result.formatted_address || address,
          };
        }
      }
    } catch (error) {
      console.error('Geocoding fallback error:', error);
    }
    
    // Final fallback to Jakarta center
    return {
      latitude: -6.2088,
      longitude: 106.8456,
      address: address,
    };
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

      setSelectedLocation(currentLoc);
      onChange(currentLoc);
      setModalVisible(false);
    } catch (error) {
      console.error('Error getting current location:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMapLocationChange = useCallback((pickup: Location | null, dropoff: Location | null) => {
    // For location picker, we only care about the pickup location
    if (pickup) {
      setSelectedLocation(pickup);
    }
  }, []);

  const handleSelectFromMap = () => {
    if (selectedLocation) {
      onChange(selectedLocation);
      setModalVisible(false);
    }
  };

  const handleSelectLocation = (location: typeof jakartaLandmarks[0]) => {
    const newLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    };
    setSelectedLocation(newLocation);
    onChange(newLocation);
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
              <Text style={[styles.modalTitle, { color: theme.textDark }]}>Pilih Lokasi</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Tab buttons */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  !showMapView && styles.activeTab,
                  { borderColor: theme.border }
                ]}
                onPress={() => setShowMapView(false)}
              >
                <Search size={16} color={!showMapView ? theme.primary : theme.textLight} />
                <Text style={[
                  styles.tabText,
                  { color: !showMapView ? theme.primary : theme.textLight }
                ]}>Cari</Text>
              </TouchableOpacity>
              
              {showMap && (
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    showMapView && styles.activeTab,
                    { borderColor: theme.border }
                  ]}
                  onPress={() => setShowMapView(true)}
                >
                  <MapPin size={16} color={showMapView ? theme.primary : theme.textLight} />
                  <Text style={[
                    styles.tabText,
                    { color: showMapView ? theme.primary : theme.textLight }
                  ]}>Peta</Text>
                </TouchableOpacity>
              )}
            </View>

            {!showMapView ? (
              <>
                <Input
                  placeholder="Cari lokasi (desa, jalan, gedung, landmark)..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  leftIcon={<Search size={20} color={theme.primary} />}
                  containerStyle={styles.searchContainer}
                  autoFocus={true}
                  returnKeyType="search"
                />

                {/* Current Location Button */}
                <Button
                  title="Gunakan Lokasi Saat Ini"
                  onPress={getCurrentLocation}
                  variant="outline"
                  size="medium"
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
                        style={[
                          styles.locationItem,
                          { backgroundColor: theme.card }
                        ]}
                        onPress={() => getPlaceDetails(item.place_id)}
                        activeOpacity={0.7}
                      >
                        <MapPin size={20} color={theme.primary} style={styles.locationIcon} />
                        <View style={styles.locationInfo}>
                          <Text style={[styles.locationName, { color: theme.textDark }]}>
                            {item.structured_formatting.main_text}
                          </Text>
                          <Text style={[styles.locationAddress, { color: theme.textLight }]} numberOfLines={2}>
                            {item.structured_formatting.secondary_text || item.description}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                    style={styles.locationsList}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  />
                ) : searchQuery.length === 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Lokasi Populer</Text>
                    <FlatList
                      data={filteredLocations.slice(0, 8)}
                      keyExtractor={(item) => item.name}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={[
                            styles.locationItem,
                            { backgroundColor: theme.card }
                          ]}
                          onPress={() => handleSelectLocation(item)}
                          activeOpacity={0.7}
                        >
                          <MapPin size={20} color={theme.primary} style={styles.locationIcon} />
                          <View style={styles.locationInfo}>
                            <Text style={[styles.locationName, { color: theme.textDark }]}>{item.name}</Text>
                            <Text style={[styles.locationAddress, { color: theme.textLight }]} numberOfLines={2}>{item.address}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                      style={styles.locationsList}
                      showsVerticalScrollIndicator={false}
                    />
                  </>
                ) : (
                  <View style={styles.noResults}>
                    <Text style={[styles.noResultsText, { color: theme.textLight }]}>
                      {loading ? 'Mencari lokasi di seluruh Indonesia...' : searchQuery.length < 2 ? 'Ketik minimal 2 karakter untuk mencari lokasi apa saja di Indonesia' : 'Tidak ada hasil ditemukan. Coba kata kunci lain.'}
                    </Text>
                    {!loading && searchQuery.length >= 2 && (
                      <Text style={[styles.searchHint, { color: theme.textLight }]}>
                        Tip: Coba cari dengan nama desa, jalan, gedung, atau landmark
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.mapContainer}>
                <InteractiveMapView
                  pickup={selectedLocation}
                  dropoff={null}
                  style={styles.mapView}
                  interactive={true}
                  onLocationChange={handleMapLocationChange}
                />
                
                <View style={styles.mapFooter}>
                  <Text style={[styles.mapInstructions, { color: theme.textLight }]}>
                    Seret penanda untuk memilih lokasi Anda
                  </Text>
                  <Button
                    title="Pilih Lokasi Ini"
                    onPress={handleSelectFromMap}
                    variant="primary"
                    size="medium"
                    disabled={!selectedLocation}
                  />
                </View>
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
    maxHeight: "90%",
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
  tabContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    gap: 8,
  },
  activeTab: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  searchContainer: {
    marginBottom: 12,
  },
  currentLocationButton: {
    marginBottom: 16,
  },
  locationsList: {
    maxHeight: 350,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  noResults: {
    padding: 20,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    textAlign: 'center',
  },
  searchHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  locationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginVertical: 2,
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
  mapContainer: {
    height: 400,
  },
  mapView: {
    flex: 1,
    marginBottom: 16,
  },
  mapFooter: {
    gap: 12,
  },
  mapInstructions: {
    fontSize: 14,
    textAlign: "center",
  },
});

export default EnhancedLocationPicker;