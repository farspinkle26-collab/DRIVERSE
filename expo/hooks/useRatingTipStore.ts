import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { DriverRating, TipTransaction, DriverStats, TipOption } from '@/types';
import { useAuth } from './useAuthStore';
import { usePaymentStore } from './usePaymentStore';

const DEFAULT_TIP_OPTIONS: TipOption[] = [
  { id: 'tip_10k', amount: 10000, label: 'Rp10.000' },
  { id: 'tip_20k', amount: 20000, label: 'Rp20.000', isPopular: true },
  { id: 'tip_50k', amount: 50000, label: 'Rp50.000' },
  { id: 'tip_100k', amount: 100000, label: 'Rp100.000' },
  { id: 'tip_custom', amount: 0, label: 'Custom Amount' },
];

export const [RatingTipContext, useRatingTip] = createContextHook(() => {
  const { user } = useAuth();
  const { processPayment } = usePaymentStore();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<DriverRating[]>([]);
  const [tips, setTips] = useState<TipTransaction[]>([]);
  const [driverStats, setDriverStats] = useState<DriverStats[]>([]);
  const [tipOptions] = useState<TipOption[]>(DEFAULT_TIP_OPTIONS);

  const updateDriverStats = useCallback(async (
    driverId: string,
    newRating: DriverRating
  ): Promise<void> => {
    try {
      const existingStatsIndex = driverStats.findIndex(stats => stats.driverId === driverId);
      let updatedStats: DriverStats;

      if (existingStatsIndex >= 0) {
        const existingStats = driverStats[existingStatsIndex];
        const newTotalRatings = existingStats.totalRatings + 1;
        const newAverageRating = (
          (existingStats.averageRating * existingStats.totalRatings + newRating.rating) /
          newTotalRatings
        );

        const newRatingBreakdown = { ...existingStats.ratingBreakdown };
        newRatingBreakdown[newRating.rating as keyof typeof newRatingBreakdown]++;

        const newCategoryAverages = { ...existingStats.categoryAverages };
        if (newRating.categories) {
          Object.keys(newRating.categories).forEach(category => {
            const categoryKey = category as keyof typeof newRating.categories;
            const currentAvg = newCategoryAverages[categoryKey];
            const newValue = newRating.categories![categoryKey];
            newCategoryAverages[categoryKey] = (
              (currentAvg * existingStats.totalRatings + newValue) / newTotalRatings
            );
          });
        }

        updatedStats = {
          ...existingStats,
          totalRatings: newTotalRatings,
          averageRating: Math.round(newAverageRating * 10) / 10,
          ratingBreakdown: newRatingBreakdown,
          categoryAverages: newCategoryAverages,
          updatedAt: Date.now(),
        };
      } else {
        // Create new stats for driver
        const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        ratingBreakdown[newRating.rating as keyof typeof ratingBreakdown] = 1;

        updatedStats = {
          driverId,
          totalRatings: 1,
          averageRating: newRating.rating,
          ratingBreakdown,
          totalTips: 0,
          averageTip: 0,
          totalEarnings: 0,
          completedJobs: 1,
          categoryAverages: newRating.categories || {
            punctuality: 0,
            professionalism: 0,
            vehicleCondition: 0,
            communication: 0,
          },
          updatedAt: Date.now(),
        };
      }

      const updatedDriverStats = existingStatsIndex >= 0
        ? driverStats.map((stats, index) => index === existingStatsIndex ? updatedStats : stats)
        : [...driverStats, updatedStats];

      setDriverStats(updatedDriverStats);
      await AsyncStorage.setItem('driverStats', JSON.stringify(updatedDriverStats));
    } catch (err) {
      console.error('Error updating driver stats:', err);
    }
  }, [driverStats]);

  const updateDriverStatsWithTip = useCallback(async (
    driverId: string,
    newTip: TipTransaction
  ): Promise<void> => {
    try {
      const existingStatsIndex = driverStats.findIndex(stats => stats.driverId === driverId);
      
      if (existingStatsIndex >= 0) {
        const existingStats = driverStats[existingStatsIndex];
        const newTotalTips = existingStats.totalTips + newTip.amount;
        const tipCount = tips.filter(tip => tip.driverId === driverId && tip.status === 'completed').length + 1;
        const newAverageTip = newTotalTips / tipCount;

        const updatedStats: DriverStats = {
          ...existingStats,
          totalTips: newTotalTips,
          averageTip: Math.round(newAverageTip),
          totalEarnings: existingStats.totalEarnings + newTip.amount,
          updatedAt: Date.now(),
        };

        const updatedDriverStats = driverStats.map((stats, index) => 
          index === existingStatsIndex ? updatedStats : stats
        );

        setDriverStats(updatedDriverStats);
        await AsyncStorage.setItem('driverStats', JSON.stringify(updatedDriverStats));
      }
    } catch (err) {
      console.error('Error updating driver stats with tip:', err);
    }
  }, [driverStats, tips]);

  const submitRating = useCallback(async (ratingData: {
    towRequestId: string;
    driverId: string;
    rating: number;
    feedback?: string;
    categories?: {
      punctuality: number;
      professionalism: number;
      vehicleCondition: number;
      communication: number;
    };
  }): Promise<DriverRating | null> => {
    if (!user) {
      setError('User not authenticated');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const newRating: DriverRating = {
        id: `rating_${Date.now()}`,
        towRequestId: ratingData.towRequestId,
        customerId: user.id,
        driverId: ratingData.driverId,
        rating: ratingData.rating,
        feedback: ratingData.feedback,
        categories: ratingData.categories,
        createdAt: Date.now(),
      };

      // Save rating to local storage
      const updatedRatings = [...ratings, newRating];
      setRatings(updatedRatings);
      await AsyncStorage.setItem(`ratings_${user.id}`, JSON.stringify(updatedRatings));

      // Update driver stats
      await updateDriverStats(ratingData.driverId, newRating);

      console.log('Rating submitted successfully:', newRating.id);
      return newRating;
    } catch (err) {
      console.error('Error submitting rating:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, ratings, updateDriverStats]);

  const submitTip = useCallback(async (tipData: {
    towRequestId: string;
    driverId: string;
    amount: number;
    paymentMethod?: 'same_as_service' | 'separate_payment';
  }): Promise<TipTransaction | null> => {
    if (!user) {
      setError('User not authenticated');
      return null;
    }

    if (tipData.amount <= 0) {
      setError('Tip amount must be greater than 0');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const newTip: TipTransaction = {
        id: `tip_${Date.now()}`,
        towRequestId: tipData.towRequestId,
        customerId: user.id,
        driverId: tipData.driverId,
        amount: tipData.amount,
        currency: 'IDR',
        status: 'pending',
        paymentMethod: tipData.paymentMethod || 'same_as_service',
        createdAt: Date.now(),
      };

      // Process tip payment through Xendit
      if (tipData.paymentMethod === 'separate_payment') {
        // For separate payment, create a new payment transaction
        const paymentResult = await processPayment({
          towRequestId: tipData.towRequestId,
          customerId: user.id,
          companyId: 'platform', // Tips go directly to platform for distribution
          driverId: tipData.driverId,
          amount: tipData.amount,
          payerEmail: user.email,
          description: `Tip for driver - Order #${tipData.towRequestId}`,
          paymentMethod: 'e_wallet',
        });

        if (paymentResult) {
          newTip.xenditPaymentId = paymentResult.xenditPaymentId;
          newTip.status = 'processing';
        } else {
          throw new Error('Failed to process tip payment');
        }
      } else {
        // For same_as_service, tip is processed with the main payment
        newTip.status = 'completed';
        newTip.completedAt = Date.now();
      }

      // Save tip to local storage
      const updatedTips = [...tips, newTip];
      setTips(updatedTips);
      await AsyncStorage.setItem(`tips_${user.id}`, JSON.stringify(updatedTips));

      // Update driver stats with tip
      await updateDriverStatsWithTip(tipData.driverId, newTip);

      console.log('Tip submitted successfully:', newTip.id);
      return newTip;
    } catch (err) {
      console.error('Error submitting tip:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit tip');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, tips, processPayment, updateDriverStatsWithTip]);

  const getDriverStats = useCallback((driverId: string): DriverStats | null => {
    return driverStats.find(stats => stats.driverId === driverId) || null;
  }, [driverStats]);

  const getRatingsByDriver = useCallback((driverId: string): DriverRating[] => {
    return ratings.filter(rating => rating.driverId === driverId);
  }, [ratings]);

  const getTipsByDriver = useCallback((driverId: string): TipTransaction[] => {
    return tips.filter(tip => tip.driverId === driverId);
  }, [tips]);

  const getRatingByTowRequest = useCallback((towRequestId: string): DriverRating | null => {
    return ratings.find(rating => rating.towRequestId === towRequestId) || null;
  }, [ratings]);

  const getTipByTowRequest = useCallback((towRequestId: string): TipTransaction | null => {
    return tips.find(tip => tip.towRequestId === towRequestId) || null;
  }, [tips]);

  const updateTipStatus = useCallback(async (
    tipId: string,
    status: TipTransaction['status'],
    xenditPaymentId?: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const updatedTips = tips.map(tip => {
        if (tip.id === tipId) {
          const updatedTip = {
            ...tip,
            status,
            xenditPaymentId: xenditPaymentId || tip.xenditPaymentId,
          };
          
          if (status === 'completed') {
            updatedTip.completedAt = Date.now();
          }
          
          return updatedTip;
        }
        return tip;
      });

      setTips(updatedTips);
      if (user) {
        await AsyncStorage.setItem(`tips_${user.id}`, JSON.stringify(updatedTips));
      }

      console.log('Tip status updated successfully:', tipId, status);
      return true;
    } catch (err) {
      console.error('Error updating tip status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update tip status');
      return false;
    } finally {
      setLoading(false);
    }
  }, [tips, user]);

  // Load data from storage
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        setLoading(true);

        // Load ratings
        const storedRatings = await AsyncStorage.getItem(`ratings_${user.id}`);
        if (storedRatings) {
          setRatings(JSON.parse(storedRatings));
        }

        // Load tips
        const storedTips = await AsyncStorage.getItem(`tips_${user.id}`);
        if (storedTips) {
          setTips(JSON.parse(storedTips));
        }

        // Load driver stats (global)
        const storedDriverStats = await AsyncStorage.getItem('driverStats');
        if (storedDriverStats) {
          setDriverStats(JSON.parse(storedDriverStats));
        }
      } catch (err) {
        console.error('Error loading rating/tip data:', err);
        setError('Failed to load rating and tip data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  return useMemo(() => ({
    loading,
    error,
    ratings,
    tips,
    driverStats,
    tipOptions,
    submitRating,
    submitTip,
    updateTipStatus,
    getDriverStats,
    getRatingsByDriver,
    getTipsByDriver,
    getRatingByTowRequest,
    getTipByTowRequest,
  }), [
    loading,
    error,
    ratings,
    tips,
    driverStats,
    tipOptions,
    submitRating,
    submitTip,
    updateTipStatus,
    getDriverStats,
    getRatingsByDriver,
    getTipsByDriver,
    getRatingByTowRequest,
    getTipByTowRequest,
  ]);
});