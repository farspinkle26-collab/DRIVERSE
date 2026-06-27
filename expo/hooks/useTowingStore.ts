import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Location, TowRequest, Driver, VehicleInfo, BreakdownInfo } from "@/types";
import { mockDrivers, mockTowRequests, BASE_FARE, SERVICE_TYPES } from "@/constants/mockData";
import { useAuth } from "./useAuthStore";
import { OrderService } from "@/services/orderService";

export const [TowingContext, useTowing] = createContextHook(() => {
  const { user } = useAuth();
  const [activeRequest, setActiveRequest] = useState<TowRequest | null>(null);
  const [requestHistory, setRequestHistory] = useState<TowRequest[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverLocation, setDriverLocation] = useState<Location | null>(null);
  const [isDriverAvailable, setIsDriverAvailable] = useState<boolean>(false);
  const [nearbyRequests, setNearbyRequests] = useState<TowRequest[]>([]);
  const [pickupLocation, setPickupLocation] = useState<Location | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<Location | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number>(0);
  const [estimatedPrice, setEstimatedPrice] = useState<number>(0);
  const [selectedServiceType, setSelectedServiceType] = useState<string>('ladder');
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [breakdownInfo, setBreakdownInfo] = useState<BreakdownInfo | null>(null);
  const [priceAdjustment, setPriceAdjustment] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadNearbyRequests = useCallback(async () => {
    if (!user || user.role !== "driver") return;
    
    try {
      const allRequests = mockTowRequests.filter(req => req.status === "pending");
      setNearbyRequests(allRequests);
    } catch (err) {
      console.error("Failed to load nearby requests:", err);
    }
  }, [user]);

  const calculatePrice = useCallback((distance: number, serviceTypeId: string, routeType?: string): number => {
    const serviceType = SERVICE_TYPES[serviceTypeId as keyof typeof SERVICE_TYPES];
    if (!serviceType) return BASE_FARE;
    
    const roundedDistance = Math.ceil(distance);
    
    if (serviceTypeId === 'double_deck') {
      const doubleDeckService = serviceType as typeof SERVICE_TYPES.double_deck;
      if (doubleDeckService.specialPricing) {
        if (routeType && doubleDeckService.specialPricing[routeType as keyof typeof doubleDeckService.specialPricing]) {
          return doubleDeckService.specialPricing[routeType as keyof typeof doubleDeckService.specialPricing] || 0;
        }
        return doubleDeckService.specialPricing.event_special || 14000000;
      }
    }
    
    if (serviceTypeId === 'ladder') {
      const ladderService = serviceType as typeof SERVICE_TYPES.ladder;
      
      if (roundedDistance > (ladderService.longDistanceThreshold || 160)) {
        return roundedDistance * (ladderService.longDistanceRate || 7000);
      }
      
      let totalPrice = ladderService.baseFare;
      
      if (roundedDistance > ladderService.baseDistance) {
        const additionalKm = roundedDistance - ladderService.baseDistance;
        totalPrice += additionalKm * ladderService.pricePerKm;
      }
      
      return totalPrice;
    }
    
    if (serviceType.isFixed) {
      const fixedService = serviceType as typeof SERVICE_TYPES.service;
      if (fixedService.maxDistance && roundedDistance > fixedService.maxDistance) {
        return -1;
      }
      return serviceType.baseFare;
    }
    
    let totalPrice = serviceType.baseFare;
    
    if (roundedDistance > serviceType.baseDistance) {
      const additionalKm = roundedDistance - serviceType.baseDistance;
      totalPrice += additionalKm * serviceType.pricePerKm;
    }
    
    return totalPrice;
  }, []);

  const calculateDistance = useCallback(async (pickup: Location, dropoff: Location): Promise<number> => {
    const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLEMAPS || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "AIzaSyD_DU3RnAjfkIubXCfRpApH5usllH7O628";
    
    try {
      const originStr = `${pickup.latitude},${pickup.longitude}`;
      const destinationStr = `${dropoff.latitude},${dropoff.longitude}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&key=${GOOGLE_MAPS_API_KEY}`;
      
      console.log('🗺️ useTowingStore - Fetching distance from Directions API...');
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('🗺️ useTowingStore - Directions API status:', data.status);
      
      if (data.status !== 'OK') {
        console.warn('🗺️ useTowingStore - Directions API non-OK:', data.status, data.error_message || '');
      } else if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        return leg.distance.value / 1000;
      }
    } catch (error) {
      console.error('🗺️ Error calculating distance with Google API:', error);
    }
    
    const R = 6371;
    const dLat = (dropoff.latitude - pickup.latitude) * Math.PI / 180;
    const dLon = (dropoff.longitude - pickup.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pickup.latitude * Math.PI / 180) * Math.cos(dropoff.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return Math.round(distance * 10) / 10;
  }, []);

  const setLocations = useCallback(async (pickup: Location | null, dropoff: Location | null) => {
    const pickupCopy = pickup ? {
      latitude: pickup.latitude,
      longitude: pickup.longitude,
      address: pickup.address
    } : null;
    
    const dropoffCopy = dropoff ? {
      latitude: dropoff.latitude,
      longitude: dropoff.longitude,
      address: dropoff.address
    } : null;
    
    setPickupLocation(pickupCopy);
    setDropoffLocation(dropoffCopy);
    
    if (pickupCopy && dropoffCopy) {
      try {
        const distance = await calculateDistance(pickupCopy, dropoffCopy);
        setEstimatedDistance(distance);
      } catch (error) {
        console.error('Error calculating distance:', error);
        setEstimatedDistance(5);
      }
    } else {
      setEstimatedDistance(0);
    }
  }, [calculateDistance]);

  const findNearestDriver = useCallback((pickupLocation: Location): Driver | null => {
    if (availableDrivers.length === 0) return null;
    
    const driversWithDistance = availableDrivers.map(driver => {
      if (!driver.location) return { driver, distance: Infinity };
      
      const R = 6371;
      const dLat = (pickupLocation.latitude - driver.location.latitude) * Math.PI / 180;
      const dLon = (pickupLocation.longitude - driver.location.longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(driver.location.latitude * Math.PI / 180) * Math.cos(pickupLocation.latitude * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      return { driver, distance };
    });
    
    driversWithDistance.sort((a, b) => a.distance - b.distance);
    return driversWithDistance[0]?.driver || null;
  }, [availableDrivers]);

  // Get request by ID from active request or history
  const getRequestById = useCallback((requestId: string): TowRequest | null => {
    // Check active request first
    if (activeRequest && activeRequest.id === requestId) {
      return activeRequest;
    }
    
    // Check request history
    const foundRequest = requestHistory.find(req => req.id === requestId);
    return foundRequest || null;
  }, [activeRequest, requestHistory]);

  const createTowRequest = useCallback(async (sendRequestToDriver?: (request: TowRequest) => Promise<boolean>) => {
    if (!user || !pickupLocation || !dropoffLocation || !vehicleInfo || !breakdownInfo) {
      setError("Missing required information for tow request");
      return null;
    }

    try {
      setLoading(true);
      
      const orderId = await OrderService.createOrder(
        user.id,
        pickupLocation,
        dropoffLocation,
        vehicleInfo,
        breakdownInfo,
        selectedServiceType,
        Math.ceil(estimatedDistance),
        estimatedPrice
      );

      if (!orderId) {
        setError("Failed to create order in database");
        return null;
      }

      const newRequest: TowRequest = {
        id: orderId,
        customerId: user.id,
        pickup: pickupLocation,
        dropoff: dropoffLocation,
        vehicleInfo,
        breakdownInfo,
        serviceType: selectedServiceType,
        status: "pending",
        distance: Math.ceil(estimatedDistance),
        price: estimatedPrice,
        createdAt: Date.now(),
      };

      setActiveRequest(newRequest);
      await AsyncStorage.setItem(`activeRequest_${user.id}`, JSON.stringify(newRequest));
      
      console.log('Order created with ID:', orderId);
      console.log('Tracking URL:', OrderService.generateTrackingUrl(orderId));
      
      if (sendRequestToDriver) {
        const success = await sendRequestToDriver(newRequest);
        if (success) {
          console.log('Request sent to nearest driver via realtime system');
        } else {
          console.log('Failed to send request to driver, will retry...');
        }
      }
      
      setPickupLocation(null);
      setDropoffLocation(null);
      setVehicleInfo(null);
      setBreakdownInfo(null);
      setSelectedServiceType('ladder');
      
      return newRequest;
    } catch (err) {
      console.error("Failed to create tow request:", err);
      setError("Failed to create tow request");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, pickupLocation, dropoffLocation, vehicleInfo, breakdownInfo, selectedServiceType, estimatedDistance, estimatedPrice]);

  const toggleDriverAvailability = useCallback(async () => {
    if (!user || user.role !== "driver") return false;
    
    try {
      const newAvailability = !isDriverAvailable;
      setIsDriverAvailable(newAvailability);
      await AsyncStorage.setItem(`driverAvailable_${user.id}`, JSON.stringify(newAvailability));
      
      if (newAvailability) {
        await loadNearbyRequests();
      } else {
        setNearbyRequests([]);
      }
      
      return true;
    } catch (err) {
      console.error("Failed to toggle driver availability:", err);
      setError("Failed to update availability");
      return false;
    }
  }, [user, isDriverAvailable, loadNearbyRequests]);

  const updateDriverLocation = useCallback(async (location: Location) => {
    if (!user || user.role !== "driver") return false;
    
    try {
      setDriverLocation(location);
      await AsyncStorage.setItem(`driverLocation_${user.id}`, JSON.stringify(location));
      return true;
    } catch (err) {
      console.error("Failed to update driver location:", err);
      return false;
    }
  }, [user]);

  const acceptTowRequest = useCallback(async (requestId: string) => {
    if (!user || user.role !== "driver") {
      setError("Only drivers can accept requests");
      return false;
    }

    try {
      setLoading(true);
      
      const success = await OrderService.acceptOrder(requestId, user.id);
      
      if (!success) {
        setError("Failed to accept order in database");
        return false;
      }

      let requestToAccept = nearbyRequests.find(req => req.id === requestId);
      if (!requestToAccept && activeRequest?.id === requestId) {
        requestToAccept = activeRequest;
      }
      
      if (!requestToAccept) {
        setError("Request not found");
        return false;
      }
      
      const updatedRequest = {
        ...requestToAccept,
        driverId: user.id,
        status: "accepted" as const,
      };
      
      setActiveRequest(updatedRequest);
      await AsyncStorage.setItem(`activeRequest_${user.id}`, JSON.stringify(updatedRequest));
      await AsyncStorage.setItem(`activeRequest_${updatedRequest.customerId}`, JSON.stringify(updatedRequest));
      
      setNearbyRequests(prev => prev.filter(req => req.id !== requestId));
      
      console.log('Order accepted in database:', requestId);
      
      return true;
    } catch (err) {
      console.error("Failed to accept tow request:", err);
      setError("Failed to accept tow request");
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, nearbyRequests, activeRequest]);

  const completeTowRequest = useCallback(async (showRatingScreen?: () => void) => {
    if (!activeRequest) {
      setError("No active request to complete");
      return false;
    }

    try {
      setLoading(true);
      
      const success = await OrderService.updateOrderStatus(activeRequest.id, "completed");
      
      if (!success) {
        setError("Failed to update order status in database");
        return false;
      }

      const completedRequest = {
        ...activeRequest,
        status: "completed" as const,
        completedAt: Date.now(),
      };
      
      const updatedHistory = [...requestHistory, completedRequest];
      setRequestHistory(updatedHistory);
      await AsyncStorage.setItem(`towHistory_${user?.id}`, JSON.stringify(updatedHistory));
      
      setActiveRequest(null);
      await AsyncStorage.removeItem(`activeRequest_${user?.id}`);
      
      if (user?.role === "driver" && activeRequest.customerId) {
        const customerHistory = JSON.parse(await AsyncStorage.getItem(`towHistory_${activeRequest.customerId}`) || "[]");
        const updatedCustomerHistory = [...customerHistory, completedRequest];
        await AsyncStorage.setItem(`towHistory_${activeRequest.customerId}`, JSON.stringify(updatedCustomerHistory));
        await AsyncStorage.removeItem(`activeRequest_${activeRequest.customerId}`);
      }
      
      console.log('Order completed in database:', activeRequest.id);
      
      if (user?.role === "customer" && showRatingScreen) {
        setTimeout(() => {
          showRatingScreen();
        }, 1000);
      }
      
      return true;
    } catch (err) {
      console.error("Failed to complete tow request:", err);
      setError("Failed to complete tow request");
      return false;
    } finally {
      setLoading(false);
    }
  }, [activeRequest, requestHistory, user]);

  const cancelTowRequest = useCallback(async () => {
    if (!activeRequest) {
      setError("No active request to cancel");
      return false;
    }

    try {
      setLoading(true);
      
      const success = await OrderService.updateOrderStatus(
        activeRequest.id,
        "cancelled",
        { cancellationReason: "Cancelled by user" }
      );
      
      if (!success) {
        setError("Failed to update order status in database");
        return false;
      }

      setActiveRequest(null);
      await AsyncStorage.removeItem(`activeRequest_${user?.id}`);
      
      if (activeRequest.driverId && user?.role === "customer") {
        await AsyncStorage.removeItem(`activeRequest_${activeRequest.driverId}`);
      }
      
      if (activeRequest.customerId && user?.role === "driver" && activeRequest.driverId) {
        await AsyncStorage.removeItem(`activeRequest_${activeRequest.customerId}`);
      }
      
      console.log('Order cancelled in database:', activeRequest.id);
      
      return true;
    } catch (err) {
      console.error("Failed to cancel tow request:", err);
      setError("Failed to cancel tow request");
      return false;
    } finally {
      setLoading(false);
    }
  }, [activeRequest, user]);

  // Load history from storage
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        
        const storedHistory = await AsyncStorage.getItem(`towHistory_${user.id}`);
        if (storedHistory) {
          setRequestHistory(JSON.parse(storedHistory));
        } else {
          // Create sample orders for the current user
          const sampleOrders: TowRequest[] = [];
          
          if (user.role === "customer") {
            // Create sample customer orders
            sampleOrders.push(
              {
                id: `request_${user.id}_1`,
                customerId: user.id,
                driverId: "driver1",
                pickup: {
                  latitude: -6.1751,
                  longitude: 106.8650,
                  address: "Jl. Sudirman No. 123, Jakarta",
                },
                dropoff: {
                  latitude: -6.2088,
                  longitude: 106.8456,
                  address: "Jl. Gatot Subroto No. 456, Jakarta",
                },
                status: "completed",
                distance: 5.2,
                vehicleInfo: {
                  make: "Toyota",
                  model: "Avanza",
                  color: "Silver",
                  licensePlate: "B 1234 ABC",
                  photos: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?q=80&w=400&auto=format&fit=crop"],
                },
                breakdownInfo: {
                  type: "engine_wont_start",
                  notes: "Engine suddenly stopped working",
                },
                serviceType: "ladder",
                price: 670000,
                createdAt: Date.now() - 86400000, // 1 day ago
                completedAt: Date.now() - 82800000, // 23 hours ago
              },
              {
                id: `request_${user.id}_2`,
                customerId: user.id,
                pickup: {
                  latitude: -6.2297,
                  longitude: 106.8251,
                  address: "Jl. Kemang Raya No. 789, Jakarta",
                },
                dropoff: {
                  latitude: -6.1751,
                  longitude: 106.8650,
                  address: "Jl. Sudirman No. 123, Jakarta",
                },
                status: "accepted",
                distance: 7.8,
                driverId: "driver2",
                vehicleInfo: {
                  make: "Honda",
                  model: "Jazz",
                  color: "White",
                  licensePlate: "B 5678 DEF",
                  photos: ["https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=400&auto=format&fit=crop"],
                },
                breakdownInfo: {
                  type: "flat_tire",
                  notes: "Front left tire is flat",
                },
                serviceType: "ladder",
                price: 715000,
                createdAt: Date.now() - 3600000, // 1 hour ago
              }
            );
          } else if (user.role === "driver") {
            // Create sample driver orders
            sampleOrders.push(
              {
                id: `request_driver_${user.id}_1`,
                customerId: "customer1",
                driverId: user.id,
                pickup: {
                  latitude: -6.1950,
                  longitude: 106.8219,
                  address: "Grand Indonesia, Jakarta Pusat",
                },
                dropoff: {
                  latitude: -6.2275,
                  longitude: 106.7975,
                  address: "Senayan City, Jakarta Selatan",
                },
                status: "completed",
                distance: 4.5,
                vehicleInfo: {
                  make: "Mitsubishi",
                  model: "Xpander",
                  color: "Black",
                  licensePlate: "B 9876 XYZ",
                  photos: ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?q=80&w=400&auto=format&fit=crop"],
                },
                breakdownInfo: {
                  type: "battery_dead",
                  notes: "Car won't start, battery seems dead",
                },
                serviceType: "ladder",
                price: 650000,
                createdAt: Date.now() - 172800000, // 2 days ago
                completedAt: Date.now() - 169200000, // 47 hours ago
              },
              {
                id: `request_driver_${user.id}_2`,
                customerId: "customer2",
                driverId: user.id,
                pickup: {
                  latitude: -6.1376,
                  longitude: 106.8133,
                  address: "Kota Tua, Jakarta Barat",
                },
                dropoff: {
                  latitude: -6.1754,
                  longitude: 106.8272,
                  address: "Monas, Jakarta Pusat",
                },
                status: "in_progress",
                distance: 6.2,
                vehicleInfo: {
                  make: "Daihatsu",
                  model: "Ayla",
                  color: "Red",
                  licensePlate: "B 5432 DEF",
                  photos: ["https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?q=80&w=400&auto=format&fit=crop"],
                },
                breakdownInfo: {
                  type: "overheating",
                  notes: "Engine overheating, steam coming from hood",
                },
                serviceType: "ladder",
                price: 688000,
                createdAt: Date.now() - 1800000, // 30 minutes ago
              }
            );
          }
          
          setRequestHistory(sampleOrders);
          await AsyncStorage.setItem(`towHistory_${user.id}`, JSON.stringify(sampleOrders));
        }

        const storedActiveRequest = await AsyncStorage.getItem(`activeRequest_${user.id}`);
        if (storedActiveRequest) {
          setActiveRequest(JSON.parse(storedActiveRequest));
        }

        setAvailableDrivers(mockDrivers.filter(driver => driver.isAvailable));
        
        if (user.role === "driver") {
          const storedAvailability = await AsyncStorage.getItem(`driverAvailable_${user.id}`);
          if (storedAvailability) {
            setIsDriverAvailable(JSON.parse(storedAvailability));
          }
          
          const storedLocation = await AsyncStorage.getItem(`driverLocation_${user.id}`);
          if (storedLocation) {
            setDriverLocation(JSON.parse(storedLocation));
          }
          
          await loadNearbyRequests();
        }
      } catch (err) {
        console.error("Failed to load towing data:", err);
        setError("Failed to load towing data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, loadNearbyRequests]);

  // Calculate price when distance, service type, or price adjustment changes
  useEffect(() => {
    let basePrice = 0;
    
    if (estimatedDistance > 0) {
      const price = calculatePrice(estimatedDistance, selectedServiceType);
      basePrice = price > 0 ? price : BASE_FARE;
    } else {
      const serviceType = SERVICE_TYPES[selectedServiceType as keyof typeof SERVICE_TYPES];
      if (selectedServiceType === 'double_deck') {
        const doubleDeckService = serviceType as typeof SERVICE_TYPES.double_deck;
        basePrice = doubleDeckService.specialPricing?.event_special || 14000000;
      } else {
        basePrice = serviceType?.baseFare || BASE_FARE;
      }
    }
    
    const adjustedPrice = basePrice * (1 + priceAdjustment / 100);
    setEstimatedPrice(Math.max(adjustedPrice, basePrice * 0.7));
  }, [estimatedDistance, selectedServiceType, priceAdjustment, calculatePrice]);

  return useMemo(() => ({
    activeRequest,
    requestHistory,
    availableDrivers,
    selectedDriver,
    pickupLocation,
    dropoffLocation,
    vehicleInfo,
    breakdownInfo,
    estimatedDistance,
    estimatedPrice,
    selectedServiceType,
    loading,
    error,
    driverLocation,
    isDriverAvailable,
    nearbyRequests,
    setLocations,
    setSelectedDriver,
    setSelectedServiceType,
    setVehicleInfo,
    setBreakdownInfo,
    createTowRequest,
    acceptTowRequest,
    completeTowRequest,
    cancelTowRequest,
    calculatePrice,
    priceAdjustment,
    setPriceAdjustment,
    toggleDriverAvailability,
    updateDriverLocation,
    loadNearbyRequests,
    findNearestDriver,
    getRequestById,
  }), [
    activeRequest,
    requestHistory,
    availableDrivers,
    selectedDriver,
    pickupLocation,
    dropoffLocation,
    vehicleInfo,
    breakdownInfo,
    estimatedDistance,
    estimatedPrice,
    selectedServiceType,
    loading,
    error,
    driverLocation,
    isDriverAvailable,
    nearbyRequests,
    setLocations,
    createTowRequest,
    acceptTowRequest,
    completeTowRequest,
    cancelTowRequest,
    calculatePrice,
    priceAdjustment,
    toggleDriverAvailability,
    updateDriverLocation,
    loadNearbyRequests,
    findNearestDriver,
    getRequestById,
  ]);
});