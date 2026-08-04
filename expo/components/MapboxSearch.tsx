import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Building, Car, Clock, MapPin, Navigation, Search } from "lucide-react-native";
import * as Location from "expo-location";
import { Location as LocationType } from "@/types";
import Card from "./Card";
import { useTheme } from "@/hooks/useThemeStore";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";
import { reverseGeocodePlace, searchPlaces, type PlaceSuggestion } from "@/lib/mapboxApi";

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  category?: string;
  latitude: number;
  longitude: number;
}

interface MapboxSearchProps {
  onLocationSelect: (location: LocationType) => void;
  placeholder?: string;
  currentLocation?: LocationType | null;
  style?: object;
  autoFocus?: boolean;
}

const SEARCH_CONFIG = {
  debounceMs: 250,
  minQueryLength: 2,
} as const;

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
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const runSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < SEARCH_CONFIG.minQueryLength) {
      setPredictions([]);
      setSearchMessage(null);
      return;
    }

    if (!MAPBOX_ACCESS_TOKEN) {
      setPredictions([]);
      setSearchMessage("Mapbox belum dikonfigurasi untuk pencarian lokasi.");
      return;
    }

    setLoading(true);
    setSearchMessage(null);
    try {
      const results = await searchPlaces(trimmedQuery, currentLocation ?? undefined);
      setPredictions(results.map(toPrediction));
      if (results.length === 0) setSearchMessage("Tidak ada hasil Mapbox. Coba kata kunci lain.");
    } catch (error) {
      console.error("Mapbox search error:", error);
      setPredictions([]);
      setSearchMessage("Pencarian Mapbox gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [currentLocation]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void runSearch(searchQuery);
    }, SEARCH_CONFIG.debounceMs);
    return () => clearTimeout(timeoutId);
  }, [runSearch, searchQuery]);

  const handleLocationSelect = useCallback((location: LocationType) => {
    setRecentSearches((previous) => {
      const filtered = previous.filter((item) => item.address !== location.address);
      return [location, ...filtered].slice(0, 5);
    });
    onLocationSelect(location);
    setSearchQuery("");
    setPredictions([]);
    setSearchMessage(null);
    setShowSuggestions(false);
    searchInputRef.current?.blur();
  }, [onLocationSelect]);

  const selectPrediction = useCallback((prediction: PlacePrediction) => {
    handleLocationSelect({
      latitude: prediction.latitude,
      longitude: prediction.longitude,
      address: prediction.description,
    });
  }, [handleLocationSelect]);

  const handleCurrentLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setSearchMessage("Izinkan akses lokasi untuk memakai posisi Anda.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const { latitude, longitude } = location.coords;
      const mapboxPlace = await reverseGeocodePlace(latitude, longitude);
      const address = mapboxPlace?.address ?? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      handleLocationSelect({ latitude, longitude, address });
    } catch (error) {
      console.error("Mapbox current-location lookup error:", error);
      setSearchMessage("Lokasi saat ini belum tersedia. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [handleLocationSelect]);

  const getPlaceIcon = (category?: string) => {
    if (category?.includes("airport") || category?.includes("address")) {
      return <Car size={16} color={theme.primary} />;
    }
    if (category?.includes("poi")) {
      return <Building size={16} color={theme.primary} />;
    }
    return <MapPin size={16} color={theme.primary} />;
  };

  const renderPredictionItem = ({ item }: { item: PlacePrediction }) => (
    <TouchableOpacity
      style={[styles.predictionItem, { backgroundColor: theme.card }]}
      onPress={() => selectPrediction(item)}
      activeOpacity={0.7}
    >
      <View style={styles.predictionIcon}>{getPlaceIcon(item.category)}</View>
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
          {item.address.split(",")[0]}
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
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={theme.primary} style={styles.loadingIndicator} />}
      </View>

      {showSuggestions && (
        <Card style={[styles.suggestionsContainer, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={[styles.currentLocationButton, { backgroundColor: `${theme.primary}10` }]}
            onPress={handleCurrentLocation}
            activeOpacity={0.7}
          >
            <Navigation size={20} color={theme.primary} />
            <Text style={[styles.currentLocationText, { color: theme.primary }]}>Gunakan lokasi saat ini</Text>
          </TouchableOpacity>

          {predictions.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Hasil Pencarian Mapbox</Text>
              <FlatList
                data={predictions}
                keyExtractor={(item) => item.place_id}
                renderItem={renderPredictionItem}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={styles.resultsList}
              />
            </>
          ) : searchQuery.length === 0 && recentSearches.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Pencarian Terakhir</Text>
              <FlatList
                data={recentSearches}
                keyExtractor={(item, index) => `${item.latitude}:${item.longitude}:${index}`}
                renderItem={renderRecentSearch}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={styles.recentList}
              />
            </>
          ) : searchMessage ? (
            <View style={styles.noResults}>
              <Text style={[styles.noResultsText, { color: theme.textLight }]}>{searchMessage}</Text>
            </View>
          ) : null}
        </Card>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: "relative", zIndex: 1000 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  loadingIndicator: { marginLeft: 8 },
  suggestionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 400,
    borderRadius: 12,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
  },
  currentLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  currentLocationText: { fontSize: 16, fontWeight: "500" },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8, marginTop: 4, paddingHorizontal: 8 },
  predictionItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  predictionIcon: { width: 32, alignItems: "center", marginRight: 8 },
  predictionInfo: { flex: 1 },
  predictionName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  predictionAddress: { fontSize: 13, lineHeight: 18 },
  separator: { height: 1, marginHorizontal: 8 },
  resultsList: { maxHeight: 300 },
  recentList: { maxHeight: 150 },
  noResults: { paddingVertical: 18, paddingHorizontal: 8 },
  noResultsText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});

export default MapboxSearch;
