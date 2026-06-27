import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Truck, CheckCircle, XCircle, Clock, Copy, Share2 } from 'lucide-react-native';
import { OrderService } from '@/services/orderService';
import { SupabaseTowRequest } from '@/types';
import * as Clipboard from 'expo-clipboard';

export default function TrackOrderScreen() {
  const { orderId: paramOrderId } = useLocalSearchParams<{ orderId?: string }>();
  const insets = useSafeAreaInsets();
  
  const [orderId, setOrderId] = useState<string>(paramOrderId || '');
  const [order, setOrder] = useState<SupabaseTowRequest | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  const loadOrder = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const orderData = await OrderService.getOrderById(id);
      
      if (!orderData) {
        setError('Order not found. Please check the Order ID and try again.');
        setOrder(null);
        return;
      }

      setOrder(orderData);
      
      if (subscription) {
        subscription.unsubscribe();
      }
      
      const sub = OrderService.subscribeToOrder(id, (updatedOrder) => {
        console.log('Order updated in real-time:', updatedOrder);
        setOrder(updatedOrder);
      });
      
      setSubscription(sub);
    } catch (err) {
      console.error('Failed to load order:', err);
      setError('Failed to load order. Please try again.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [subscription]);

  useEffect(() => {
    if (paramOrderId) {
      loadOrder(paramOrderId);
    }
  }, [paramOrderId, loadOrder]);

  useEffect(() => {
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [subscription]);

  const handleTrackOrder = () => {
    if (!orderId.trim()) {
      Alert.alert('Error', 'Please enter an Order ID');
      return;
    }
    loadOrder(orderId.trim());
  };

  const handleCopyOrderId = async () => {
    if (order) {
      await Clipboard.setStringAsync(order.id);
      Alert.alert('Copied', 'Order ID copied to clipboard');
    }
  };

  const handleShareOrderId = async () => {
    if (order) {
      try {
        const shareText = OrderService.generateShareableTrackingText(order.id);
        await Share.share({
          message: shareText,
        });
      } catch (err) {
        console.error('Failed to share:', err);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#F59E0B';
      case 'accepted':
        return '#3B82F6';
      case 'in_progress':
        return '#8B5CF6';
      case 'completed':
        return '#10B981';
      case 'cancelled':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    const color = getStatusColor(status);
    const size = 24;
    
    switch (status) {
      case 'pending':
        return <Clock size={size} color={color} />;
      case 'accepted':
      case 'in_progress':
        return <Truck size={size} color={color} />;
      case 'completed':
        return <CheckCircle size={size} color={color} />;
      case 'cancelled':
        return <XCircle size={size} color={color} />;
      default:
        return <Clock size={size} color={color} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Waiting for Driver';
      case 'accepted':
        return 'Driver Accepted';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          title: 'Track Order',
          headerStyle: {
            backgroundColor: '#FF6B35',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600' as const,
          },
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.searchSection}>
          <Text style={styles.searchLabel}>Enter Order ID</Text>
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
              value={orderId}
              onChangeText={setOrderId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleTrackOrder}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.searchButtonText}>Track</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <XCircle size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {order && (
          <View style={styles.orderContainer}>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderTop}>
                <Text style={styles.orderTitle}>Order Details</Text>
                <View style={styles.orderActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleCopyOrderId}
                  >
                    <Copy size={20} color="#6B7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleShareOrderId}
                  >
                    <Share2 size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.orderId}>ID: {order.id}</Text>
            </View>

            <View style={styles.statusSection}>
              <View style={styles.statusBadge}>
                {getStatusIcon(order.status)}
                <Text
                  style={[
                    styles.statusText,
                    { color: getStatusColor(order.status) },
                  ]}
                >
                  {getStatusText(order.status)}
                </Text>
              </View>
              
              <View style={styles.timeline}>
                <TimelineItem
                  label="Order Created"
                  time={formatDate(order.created_at)}
                  isCompleted={true}
                />
                {order.accepted_at && (
                  <TimelineItem
                    label="Driver Accepted"
                    time={formatDate(order.accepted_at)}
                    isCompleted={true}
                  />
                )}
                {order.started_at && (
                  <TimelineItem
                    label="Service Started"
                    time={formatDate(order.started_at)}
                    isCompleted={true}
                  />
                )}
                {order.completed_at && (
                  <TimelineItem
                    label="Service Completed"
                    time={formatDate(order.completed_at)}
                    isCompleted={true}
                  />
                )}
                {order.cancelled_at && (
                  <TimelineItem
                    label="Order Cancelled"
                    time={formatDate(order.cancelled_at)}
                    isCompleted={true}
                    isError={true}
                  />
                )}
              </View>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Location Details</Text>
              
              <View style={styles.locationItem}>
                <View style={styles.locationIcon}>
                  <MapPin size={20} color="#10B981" />
                </View>
                <View style={styles.locationContent}>
                  <Text style={styles.locationLabel}>Pickup</Text>
                  <Text style={styles.locationAddress}>
                    {order.pickup_location.address}
                  </Text>
                </View>
              </View>

              <View style={styles.locationItem}>
                <View style={styles.locationIcon}>
                  <MapPin size={20} color="#EF4444" />
                </View>
                <View style={styles.locationContent}>
                  <Text style={styles.locationLabel}>Dropoff</Text>
                  <Text style={styles.locationAddress}>
                    {order.dropoff_location.address}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Service Information</Text>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Service Type</Text>
                <Text style={styles.infoValue}>
                  {order.service_type.toUpperCase()}
                </Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Distance</Text>
                <Text style={styles.infoValue}>{order.distance_km} km</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Price</Text>
                <Text style={[styles.infoValue, styles.priceText]}>
                  {formatCurrency(order.price_idr)}
                </Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment Status</Text>
                <Text
                  style={[
                    styles.infoValue,
                    {
                      color:
                        order.payment_status === 'paid'
                          ? '#10B981'
                          : order.payment_status === 'failed'
                          ? '#EF4444'
                          : '#F59E0B',
                    },
                  ]}
                >
                  {order.payment_status.toUpperCase()}
                </Text>
              </View>
            </View>

            {order.vehicle_info && (
              <View style={styles.detailsSection}>
                <Text style={styles.sectionTitle}>Vehicle Information</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Vehicle</Text>
                  <Text style={styles.infoValue}>
                    {order.vehicle_info.make} {order.vehicle_info.model}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Color</Text>
                  <Text style={styles.infoValue}>{order.vehicle_info.color}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>License Plate</Text>
                  <Text style={styles.infoValue}>
                    {order.vehicle_info.licensePlate}
                  </Text>
                </View>
              </View>
            )}

            {order.cancellation_reason && (
              <View style={[styles.detailsSection, styles.errorSection]}>
                <Text style={styles.sectionTitle}>Cancellation Reason</Text>
                <Text style={styles.cancellationText}>
                  {order.cancellation_reason}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TimelineItem({
  label,
  time,
  isCompleted,
  isError = false,
}: {
  label: string;
  time: string;
  isCompleted: boolean;
  isError?: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineIndicator}>
        <View
          style={[
            styles.timelineDot,
            isCompleted && styles.timelineDotCompleted,
            isError && styles.timelineDotError,
          ]}
        />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineLabel}>{label}</Text>
        <Text style={styles.timelineTime}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  searchSection: {
    marginBottom: 24,
  },
  searchLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#991B1B',
  },
  orderContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  orderHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  orderHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  orderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  orderId: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace' as const,
  },
  statusSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineIndicator: {
    alignItems: 'center',
    width: 20,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    borderWidth: 2,
    borderColor: '#fff',
  },
  timelineDotCompleted: {
    backgroundColor: '#10B981',
  },
  timelineDotError: {
    backgroundColor: '#EF4444',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  detailsSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationContent: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  priceText: {
    fontSize: 16,
    color: '#FF6B35',
  },
  errorSection: {
    backgroundColor: '#FEF2F2',
  },
  cancellationText: {
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
  },
});
