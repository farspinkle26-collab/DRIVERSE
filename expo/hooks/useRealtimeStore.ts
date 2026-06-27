import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';
import { TowRequest, Driver, Location } from '@/types';
import { mockDrivers } from '@/constants/mockData';

export const [RealtimeContext, useRealtime] = createContextHook(() => {
  const [connectedDrivers, setConnectedDrivers] = useState<Driver[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [driverLocation, setDriverLocation] = useState<Location | null>(null);
  const [connectedUserId, setConnectedUserId] = useState<string | null>(null);

  // Simulate sending request to nearest driver
  const sendRequestToNearestDriver = useCallback(async (request: TowRequest): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('🚗 Sending request to nearest driver:', request.id);
      
      // Simulate finding nearest available driver
      const availableDrivers = mockDrivers.filter(driver => driver.isAvailable);
      
      if (availableDrivers.length === 0) {
        console.log('❌ No available drivers found');
        return false;
      }

      // Find nearest driver based on pickup location
      const driversWithDistance = availableDrivers.map(driver => {
        if (!driver.location) return { driver, distance: Infinity };
        
        const R = 6371; // Earth's radius in km
        const dLat = (request.pickup.latitude - driver.location.latitude) * Math.PI / 180;
        const dLon = (request.pickup.longitude - driver.location.longitude) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(driver.location.latitude * Math.PI / 180) * Math.cos(request.pickup.latitude * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return { driver, distance };
      });
      
      driversWithDistance.sort((a, b) => a.distance - b.distance);
      const nearestDriver = driversWithDistance[0]?.driver;
      
      if (!nearestDriver) {
        console.log('❌ No suitable driver found');
        return false;
      }

      // Simulate sending request to driver (in real app, this would be via WebSocket/Push notification)
      console.log(`✅ Request sent to driver: ${nearestDriver.name} (${nearestDriver.id})`);
      console.log(`📍 Driver location: ${nearestDriver.location?.address}`);
      console.log(`📏 Distance to pickup: ${driversWithDistance[0].distance.toFixed(2)} km`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('❌ Error sending request to driver:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Simulate connecting to realtime service
  const connect = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('🔌 Connecting to realtime service...');
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setIsConnected(true);
      setConnectedDrivers(mockDrivers.filter(driver => driver.isAvailable));
      
      console.log('✅ Connected to realtime service');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to realtime service:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Simulate disconnecting from realtime service
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting from realtime service...');
    setIsConnected(false);
    setConnectedDrivers([]);
    console.log('✅ Disconnected from realtime service');
  }, []);

  // Simulate updating driver status
  const updateDriverStatus = useCallback(async (driverId: string, isAvailable: boolean): Promise<boolean> => {
    try {
      console.log(`🚗 Updating driver ${driverId} availability to: ${isAvailable}`);
      
      setConnectedDrivers(prev => 
        prev.map(driver => 
          driver.id === driverId 
            ? { ...driver, isAvailable }
            : driver
        )
      );
      
      return true;
    } catch (error) {
      console.error('❌ Failed to update driver status:', error);
      return false;
    }
  }, []);

  const loadChatMessages = useCallback(async (requestId: string) => {
    console.log('💬 Loading chat messages for request:', requestId);
  }, []);

  return useMemo(() => ({
    connectedDrivers,
    isConnected,
    loading,
    driverLocation,
    connectedUserId,
    setConnectedUserId,
    loadChatMessages,
    sendRequestToNearestDriver,
    connect,
    disconnect,
    updateDriverStatus,
  }), [
    connectedDrivers,
    isConnected,
    loading,
    driverLocation,
    connectedUserId,
    loadChatMessages,
    sendRequestToNearestDriver,
    connect,
    disconnect,
    updateDriverStatus,
  ]);
});