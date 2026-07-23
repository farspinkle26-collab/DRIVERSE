import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { Search, MapPin, Navigation, Clock, Star, Building, Car } from "lucide-react-native";
import * as Location from "expo-location";
import { Location as LocationType } from "@/types";
import Card from "./Card";
import { useTheme } from "@/hooks/useThemeStore";
import { jakartaLandmarks } from "@/constants/mockData";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";
import { searchPlaces, PlaceSuggestion } from "@/lib/mapboxApi";

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  category?: string;
  latitude?: number;
  longitude?: number;
}

interface MapboxSearchProps {
  onLocationSelect: (location: LocationType) => void;
  placeholder?: string;
  currentLocation?: LocationType | null;
  style?: any;
  autoFocus?: boolean;
}

const SEARCH_CONFIG = {
  debounceMs: 200,
  minQueryLength: 1,
};

// Store real coordinates for fallback locations
const fallbackCoordinatesMap = new Map<string, { latitude: number; longitude: number; address: string }>();

const toPrediction = (place: PlaceSuggestion): PlacePrediction => ({
  place_id: place.id,
  description: place.fullAddress,
  structured_formatting: {
    main_text: place.name,
    secondary_text: place.fullAddress.replace(`${place.name}, `, "").replace(place.name, ""),
  },
  category: place.category,
  latitude: place.latitude,
  longitude: place.longitude,
});

const MapboxSearch: React.FC<MapboxSearchProps> = ({
  onLocationSelect,
  placeholder = "Cari lokasi, jalan, gedung, atau landmark...",
  currentLocation,
  style,
  autoFocus = false,
}) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [recentSearches, setRecentSearches] = useState<LocationType[]>([]);
  const [popularPlaces, setPopularPlaces] = useState<LocationType[]>([]);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = () => {
    const popular = jakartaLandmarks.slice(0, 8).map(landmark => ({
      latitude: landmark.latitude,
      longitude: landmark.longitude,
      address: landmark.address,
    }));
    setPopularPlaces(popular);
    setRecentSearches([]);
  };

  const runSearch = useCallback(async (query: string) => {
    if (query.length < SEARCH_CONFIG.minQueryLength) {
      setPredictions([]);
      return;
    }

    try {
      setLoading(true);

      if (!MAPBOX_ACCESS_TOKEN) {
        handleComprehensiveFallbackSearch(query);
        return;
      }

      const results = await searchPlaces(query, currentLocation ?? undefined);

      if (results.length > 0) {
        setPredictions(results.map(toPrediction));
      } else {
        handleComprehensiveFallbackSearch(query);
      }
    } catch (error) {
      console.error('Error searching places:', error);
      handleComprehensiveFallbackSearch(query);
    } finally {
      setLoading(false);
    }
  }, [currentLocation]);

  // Comprehensive fallback search with extensive Indonesian locations
  const handleComprehensiveFallbackSearch = (query: string) => {
    const comprehensiveLocations = [
      // Jakarta landmarks
      ...jakartaLandmarks,

      // Major Indonesian cities with enhanced coverage
      { name: 'Jakarta', address: 'Jakarta, DKI Jakarta, Indonesia', latitude: -6.2088, longitude: 106.8456 },
      { name: 'Surabaya', address: 'Surabaya, Jawa Timur, Indonesia', latitude: -7.2575, longitude: 112.7521 },
      { name: 'Bandung', address: 'Bandung, Jawa Barat, Indonesia', latitude: -6.9175, longitude: 107.6191 },
      { name: 'Medan', address: 'Medan, Sumatera Utara, Indonesia', latitude: 3.5952, longitude: 98.6722 },
      { name: 'Semarang', address: 'Semarang, Jawa Tengah, Indonesia', latitude: -6.9667, longitude: 110.4167 },
      { name: 'Makassar', address: 'Makassar, Sulawesi Selatan, Indonesia', latitude: -5.1477, longitude: 119.4327 },
      { name: 'Palembang', address: 'Palembang, Sumatera Selatan, Indonesia', latitude: -2.9761, longitude: 104.7754 },
      { name: 'Yogyakarta', address: 'Yogyakarta, DI Yogyakarta, Indonesia', latitude: -7.7956, longitude: 110.3695 },
      { name: 'Denpasar', address: 'Denpasar, Bali, Indonesia', latitude: -8.6705, longitude: 115.2126 },
      { name: 'Balikpapan', address: 'Balikpapan, Kalimantan Timur, Indonesia', latitude: -1.2379, longitude: 116.8529 },
      { name: 'Malang', address: 'Malang, Jawa Timur, Indonesia', latitude: -7.9666, longitude: 112.6326 },
      { name: 'Batam', address: 'Batam, Kepulauan Riau, Indonesia', latitude: 1.1307, longitude: 104.0530 },
      { name: 'Pekanbaru', address: 'Pekanbaru, Riau, Indonesia', latitude: 0.5071, longitude: 101.4478 },
      { name: 'Banjarmasin', address: 'Banjarmasin, Kalimantan Selatan, Indonesia', latitude: -3.3194, longitude: 114.5906 },
      { name: 'Padang', address: 'Padang, Sumatera Barat, Indonesia', latitude: -0.9471, longitude: 100.4172 },
      { name: 'Manado', address: 'Manado, Sulawesi Utara, Indonesia', latitude: 1.4748, longitude: 124.8421 },
      { name: 'Samarinda', address: 'Samarinda, Kalimantan Timur, Indonesia', latitude: -0.5022, longitude: 117.1536 },
      { name: 'Pontianak', address: 'Pontianak, Kalimantan Barat, Indonesia', latitude: -0.0263, longitude: 109.3425 },

      // Jakarta areas
      { name: 'Jakarta Pusat', address: 'Jakarta Pusat, DKI Jakarta, Indonesia', latitude: -6.1745, longitude: 106.8227 },
      { name: 'Jakarta Selatan', address: 'Jakarta Selatan, DKI Jakarta, Indonesia', latitude: -6.2615, longitude: 106.8106 },
      { name: 'Jakarta Utara', address: 'Jakarta Utara, DKI Jakarta, Indonesia', latitude: -6.1388, longitude: 106.8650 },
      { name: 'Jakarta Barat', address: 'Jakarta Barat, DKI Jakarta, Indonesia', latitude: -6.1352, longitude: 106.7674 },
      { name: 'Jakarta Timur', address: 'Jakarta Timur, DKI Jakarta, Indonesia', latitude: -6.2250, longitude: 106.9004 },

      // Popular malls and landmarks
      { name: 'Grand Indonesia', address: 'Grand Indonesia, Jl. MH Thamrin, Jakarta Pusat', latitude: -6.1944, longitude: 106.8231 },
      { name: 'Plaza Indonesia', address: 'Plaza Indonesia, Jl. MH Thamrin, Jakarta Pusat', latitude: -6.1944, longitude: 106.8231 },
      { name: 'Mall Taman Anggrek', address: 'Mall Taman Anggrek, Jakarta Barat', latitude: -6.1782, longitude: 106.7920 },
      { name: 'Senayan City', address: 'Senayan City, Jakarta Selatan', latitude: -6.2297, longitude: 106.8019 },
      { name: 'Pondok Indah Mall', address: 'Pondok Indah Mall, Jakarta Selatan', latitude: -6.2659, longitude: 106.7844 },
      { name: 'Kelapa Gading Mall', address: 'Kelapa Gading Mall, Jakarta Utara', latitude: -6.1588, longitude: 106.9056 },
      { name: 'Central Park Mall', address: 'Central Park Mall, Jakarta Barat', latitude: -6.1782, longitude: 106.7920 },
      { name: 'Kota Kasablanka', address: 'Kota Kasablanka, Jakarta Selatan', latitude: -6.2297, longitude: 106.8419 },

      // Airports and transportation
      { name: 'Bandara Soekarno-Hatta', address: 'Bandara Soekarno-Hatta, Tangerang, Banten', latitude: -6.1256, longitude: 106.6559 },
      { name: 'Bandara Halim Perdanakusuma', address: 'Bandara Halim Perdanakusuma, Jakarta Timur', latitude: -6.2665, longitude: 106.8911 },
      { name: 'Stasiun Gambir', address: 'Stasiun Gambir, Jakarta Pusat', latitude: -6.1754, longitude: 106.8308 },
      { name: 'Stasiun Pasar Senen', address: 'Stasiun Pasar Senen, Jakarta Pusat', latitude: -6.1722, longitude: 106.8417 },
      { name: 'Terminal Kampung Rambutan', address: 'Terminal Kampung Rambutan, Jakarta Timur', latitude: -6.2833, longitude: 106.8667 },

      // Universities
      { name: 'Universitas Indonesia', address: 'Universitas Indonesia, Depok, Jawa Barat', latitude: -6.3619, longitude: 106.8244 },
      { name: 'ITB Bandung', address: 'Institut Teknologi Bandung, Bandung, Jawa Barat', latitude: -6.8915, longitude: 107.6107 },
      { name: 'UGM Yogyakarta', address: 'Universitas Gadjah Mada, Yogyakarta', latitude: -7.7719, longitude: 110.3756 },

      // Popular streets and areas with enhanced coverage
      { name: 'Jalan Sudirman', address: 'Jalan Jenderal Sudirman, Jakarta', latitude: -6.2088, longitude: 106.8228 },
      { name: 'Jalan Thamrin', address: 'Jalan MH Thamrin, Jakarta Pusat', latitude: -6.1944, longitude: 106.8231 },
      { name: 'Jalan Malioboro', address: 'Jalan Malioboro, Yogyakarta', latitude: -7.7926, longitude: 110.3656 },
      { name: 'Jalan Braga', address: 'Jalan Braga, Bandung, Jawa Barat', latitude: -6.9175, longitude: 107.6088 },
      { name: 'Kemang', address: 'Kemang, Jakarta Selatan', latitude: -6.2659, longitude: 106.8156 },
      { name: 'Menteng', address: 'Menteng, Jakarta Pusat', latitude: -6.1944, longitude: 106.8231 },
      { name: 'Senopati', address: 'Senopati, Jakarta Selatan', latitude: -6.2297, longitude: 106.8019 },
      { name: 'SCBD', address: 'Sudirman Central Business District, Jakarta Selatan', latitude: -6.2297, longitude: 106.8019 },
      { name: 'PIK', address: 'Pantai Indah Kapuk, Jakarta Utara', latitude: -6.1088, longitude: 106.7378 },
      { name: 'BSD City', address: 'BSD City, Tangerang Selatan', latitude: -6.3017, longitude: 106.6519 },
      { name: 'Alam Sutera', address: 'Alam Sutera, Tangerang Selatan', latitude: -6.2378, longitude: 106.6597 },
      { name: 'Gading Serpong', address: 'Gading Serpong, Tangerang', latitude: -6.2422, longitude: 106.6297 },
      { name: 'Kelapa Gading', address: 'Kelapa Gading, Jakarta Utara', latitude: -6.1588, longitude: 106.9056 },
      { name: 'Pluit', address: 'Pluit, Jakarta Utara', latitude: -6.1297, longitude: 106.7897 },
      { name: 'Kuningan', address: 'Kuningan, Jakarta Selatan', latitude: -6.2297, longitude: 106.8297 },
      { name: 'Blok M', address: 'Blok M, Jakarta Selatan', latitude: -6.2447, longitude: 106.7997 },

      // Satellite cities
      { name: 'Tangerang', address: 'Tangerang, Banten, Indonesia', latitude: -6.1783, longitude: 106.6319 },
      { name: 'Bekasi', address: 'Bekasi, Jawa Barat, Indonesia', latitude: -6.2383, longitude: 106.9756 },
      { name: 'Depok', address: 'Depok, Jawa Barat, Indonesia', latitude: -6.4025, longitude: 106.7942 },
      { name: 'Bogor', address: 'Bogor, Jawa Barat, Indonesia', latitude: -6.5971, longitude: 106.8060 },
      { name: 'Tangerang Selatan', address: 'Tangerang Selatan, Banten, Indonesia', latitude: -6.2884, longitude: 106.7317 },
    ];

    // Advanced search algorithm
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);

    const scoredLocations = comprehensiveLocations.map(location => {
      let score = 0;
      const nameWords = location.name.toLowerCase().split(' ');
      const addressWords = location.address.toLowerCase().split(' ');

      // Exact name match gets highest score
      if (location.name.toLowerCase() === query.toLowerCase()) {
        score += 100;
      }

      // Name starts with query
      if (location.name.toLowerCase().startsWith(query.toLowerCase())) {
        score += 80;
      }

      // Name contains query
      if (location.name.toLowerCase().includes(query.toLowerCase())) {
        score += 60;
      }

      // Address contains query
      if (location.address.toLowerCase().includes(query.toLowerCase())) {
        score += 40;
      }

      // Individual word matches
      searchTerms.forEach(term => {
        nameWords.forEach(word => {
          if (word.startsWith(term)) score += 20;
          if (word.includes(term)) score += 10;
        });

        addressWords.forEach(word => {
          if (word.startsWith(term)) score += 15;
          if (word.includes(term)) score += 5;
        });
      });

      return { ...location, score };
    });

    // Filter and sort by score
    const filteredLocations = scoredLocations
      .filter(location => location.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15); // Limit to 15 results

    const mockPredictions: PlacePrediction[] = filteredLocations.map((location, index) => {
      const placeId = `fallback_${index}`;
      // Store real coordinates for later lookup
      fallbackCoordinatesMap.set(placeId, {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
      return {
        place_id: placeId,
        description: location.address,
        structured_formatting: {
          main_text: location.name,
          secondary_text: location.address.replace(location.name + ', ', '').replace(location.name, '').replace(/^, /, ''),
        },
      };
    });

    setPredictions(mockPredictions);
  };

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.length > 0) {
        runSearch(searchQuery);
      } else {
        setPredictions([]);
      }
    }, SEARCH_CONFIG.debounceMs);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, runSearch]);

  const handleLocationSelect = (location: LocationType) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(item => item.address !== location.address);
      return [location, ...filtered].slice(0, 5); // Keep only 5 recent searches
    });

    onLocationSelect(location);
    setSearchQuery("");
    setPredictions([]);
    setShowSuggestions(false);
    searchInputRef.current?.blur();
  };

  const selectPrediction = (prediction: PlacePrediction) => {
    if (prediction.latitude != null && prediction.longitude != null) {
      handleLocationSelect({
        latitude: prediction.latitude,
        longitude: prediction.longitude,
        address: prediction.description,
      });
      return;
    }

    const coords = fallbackCoordinatesMap.get(prediction.place_id);
    if (coords) {
      handleLocationSelect({
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: coords.address,
      });
    }
  };

  const handleCurrentLocation = async () => {
    try {
      setLoading(true);
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
        address: 'Lokasi Saat Ini',
      };

      // Try to get address from coordinates
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (reverseGeocode.length > 0) {
          const addr = reverseGeocode[0];
          const parts = [];
          if (addr.street) parts.push(addr.street);
          if (addr.streetNumber) parts.push(addr.streetNumber);
          if (addr.city) parts.push(addr.city);
          if (addr.region) parts.push(addr.region);
          currentLoc.address = parts.join(', ') || 'Lokasi Saat Ini';
        }
      } catch (error) {
        console.error('Error reverse geocoding:', error);
      }

      handleLocationSelect(currentLoc);
    } catch (error) {
      console.error('Error getting current location:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPlaceIcon = (category?: string) => {
    if (!category) return <MapPin size={16} color={theme.primary} />;
    if (category.includes('airport') || category.includes('address')) return <Car size={16} color={theme.primary} />;
    if (category.includes('poi')) return <Building size={16} color={theme.primary} />;
    return <MapPin size={16} color={theme.primary} />;
  };

  const renderPredictionItem = ({ item }: { item: PlacePrediction }) => (
    <TouchableOpacity
      style={[styles.predictionItem, { backgroundColor: theme.card }]}
      onPress={() => selectPrediction(item)}
      activeOpacity={0.7}
    >
      <View style={styles.predictionIcon}>
        {getPlaceIcon(item.category)}
      </View>
      <View style={styles.predictionInfo}>
        <Text style={[styles.predictionName, { color: theme.textDark }]} numberOfLines={1}>
          {item.structured_formatting.main_text}
        </Text>
        <Text style={[styles.predictionAddress, { color: theme.textLight }]} numberOfLines={2}>
          {item.structured_formatting.secondary_text || item.description}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderRecentSearch = ({ item }: { item: LocationType }) => (
    <TouchableOpacity
      style={[styles.predictionItem, { backgroundColor: theme.card }]}
      onPress={() => handleLocationSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.predictionIcon}>
        <Clock size={16} color={theme.textLight} />
      </View>
      <View style={styles.predictionInfo}>
        <Text style={[styles.predictionName, { color: theme.textDark }]} numberOfLines={1}>
          {item.address.split(',')[0]}
        </Text>
        <Text style={[styles.predictionAddress, { color: theme.textLight }]} numberOfLines={2}>
          {item.address}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderPopularPlace = ({ item }: { item: LocationType }) => (
    <TouchableOpacity
      style={[styles.predictionItem, { backgroundColor: theme.card }]}
      onPress={() => handleLocationSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.predictionIcon}>
        <Star size={16} color={theme.warning} />
      </View>
      <View style={styles.predictionInfo}>
        <Text style={[styles.predictionName, { color: theme.textDark }]} numberOfLines={1}>
          {item.address.split(',')[0]}
        </Text>
        <Text style={[styles.predictionAddress, { color: theme.textLight }]} numberOfLines={2}>
          {item.address}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Search size={20} color={theme.textLight} style={styles.searchIcon} />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay hiding suggestions to allow for item selection
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
        {loading && (
          <ActivityIndicator size="small" color={theme.primary} style={styles.loadingIndicator} />
        )}
      </View>

      {showSuggestions && (
        <Card style={[styles.suggestionsContainer, { backgroundColor: theme.card }]}>
          {/* Current Location Button */}
          <TouchableOpacity
            style={[styles.currentLocationButton, { backgroundColor: theme.primary + '10' }]}
            onPress={handleCurrentLocation}
            activeOpacity={0.7}
          >
            <Navigation size={20} color={theme.primary} />
            <Text style={[styles.currentLocationText, { color: theme.primary }]}>
              Gunakan lokasi saat ini
            </Text>
          </TouchableOpacity>

          {/* Search Results */}
          {predictions.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Hasil Pencarian</Text>
              <FlatList
                data={predictions}
                keyExtractor={(item) => item.place_id}
                renderItem={renderPredictionItem}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                scrollEnabled={true}
                style={{ maxHeight: 300 }}
              />
            </>
          ) : searchQuery.length === 0 ? (
            <>
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Pencarian Terakhir</Text>
                  <FlatList
                    data={recentSearches}
                    keyExtractor={(item, index) => `recent_${index}`}
                    renderItem={renderRecentSearch}
                    ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                    scrollEnabled={true}
                    style={{ maxHeight: 150 }}
                  />
                  <View style={[styles.sectionSeparator, { backgroundColor: theme.border }]} />
                </>
              )}

              {/* Popular Places */}
              <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Lokasi Populer</Text>
              <FlatList
                data={popularPlaces}
                keyExtractor={(item, index) => `popular_${index}`}
                renderItem={renderPopularPlace}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                scrollEnabled={true}
                style={{ maxHeight: 200 }}
              />
            </>
          ) : (
            <View style={styles.noResults}>
              <Text style={[styles.noResultsText, { color: theme.textLight }]}>
                {loading ? 'Mencari lokasi di seluruh Indonesia...' : 'Tidak ada hasil ditemukan. Coba kata kunci lain.'}
              </Text>
            </View>
          )}
        </Card>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 400,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  currentLocationText: {
    fontSize: 16,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  sectionSeparator: {
    height: 1,
    marginVertical: 12,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 1,
  },
  predictionIcon: {
    marginRight: 12,
    width: 24,
    alignItems: 'center',
  },
  predictionInfo: {
    flex: 1,
  },
  predictionName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  predictionAddress: {
    fontSize: 14,
    lineHeight: 18,
  },
  separator: {
    height: 1,
    marginHorizontal: 8,
  },
  noResults: {
    padding: 20,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default MapboxSearch;
