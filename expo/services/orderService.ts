import { supabase } from '@/lib/supabase';
import { TowRequest, Location, VehicleInfo, BreakdownInfo, SupabaseTowRequest } from '@/types';

export class OrderService {
  static async createOrder(
    customerId: string,
    pickup: Location,
    dropoff: Location,
    vehicleInfo: VehicleInfo,
    breakdownInfo: BreakdownInfo,
    serviceType: string,
    distance: number,
    price: number
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .insert({
          customer_id: customerId,
          pickup_location: pickup,
          dropoff_location: dropoff,
          vehicle_info: vehicleInfo,
          breakdown_info: breakdownInfo,
          service_type: serviceType as 'hydraulic' | 'ladder' | 'accident' | 'service' | 'double_deck',
          status: 'pending',
          distance_km: distance,
          price_idr: price,
          payment_status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating order:', error);
        return null;
      }

      console.log('Order created successfully:', data.id);
      return data.id;
    } catch (err) {
      console.error('Failed to create order:', err);
      return null;
    }
  }

  static async getOrderById(orderId: string): Promise<SupabaseTowRequest | null> {
    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error) {
        console.error('Error fetching order:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Failed to fetch order:', err);
      return null;
    }
  }

  static async getCustomerOrders(customerId: string): Promise<SupabaseTowRequest[]> {
    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching customer orders:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Failed to fetch customer orders:', err);
      return [];
    }
  }

  static async getDriverOrders(driverId: string): Promise<SupabaseTowRequest[]> {
    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching driver orders:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Failed to fetch driver orders:', err);
      return [];
    }
  }

  static async getPendingOrders(): Promise<SupabaseTowRequest[]> {
    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .select('*')
        .eq('status', 'pending')
        .is('driver_id', null)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching pending orders:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Failed to fetch pending orders:', err);
      return [];
    }
  }

  static async acceptOrder(orderId: string, driverId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tow_requests')
        .update({
          driver_id: driverId,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('status', 'pending');

      if (error) {
        console.error('Error accepting order:', error);
        return false;
      }

      console.log('Order accepted successfully:', orderId);
      return true;
    } catch (err) {
      console.error('Failed to accept order:', err);
      return false;
    }
  }

  static async updateOrderStatus(
    orderId: string,
    status: 'accepted' | 'in_progress' | 'completed' | 'cancelled',
    additionalData?: {
      driverLocation?: Location;
      estimatedArrival?: string;
      cancellationReason?: string;
      rating?: number;
      review?: string;
    }
  ): Promise<boolean> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      } else if (status === 'in_progress') {
        updateData.started_at = new Date().toISOString();
      } else if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (status === 'cancelled') {
        updateData.cancelled_at = new Date().toISOString();
      }

      if (additionalData) {
        if (additionalData.driverLocation) {
          updateData.driver_location = additionalData.driverLocation;
        }
        if (additionalData.estimatedArrival) {
          updateData.estimated_arrival = additionalData.estimatedArrival;
        }
        if (additionalData.cancellationReason) {
          updateData.cancellation_reason = additionalData.cancellationReason;
        }
        if (additionalData.rating) {
          updateData.rating = additionalData.rating;
        }
        if (additionalData.review) {
          updateData.review = additionalData.review;
        }
      }

      const { error } = await supabase
        .from('tow_requests')
        .update(updateData)
        .eq('id', orderId);

      if (error) {
        console.error('Error updating order status:', error);
        return false;
      }

      console.log('Order status updated successfully:', orderId, status);
      return true;
    } catch (err) {
      console.error('Failed to update order status:', err);
      return false;
    }
  }

  static async updateDriverLocation(
    orderId: string,
    location: Location,
    estimatedArrival?: string
  ): Promise<boolean> {
    try {
      const updateData: any = {
        driver_location: location,
      };

      if (estimatedArrival) {
        updateData.estimated_arrival = estimatedArrival;
      }

      const { error } = await supabase
        .from('tow_requests')
        .update(updateData)
        .eq('id', orderId);

      if (error) {
        console.error('Error updating driver location:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Failed to update driver location:', err);
      return false;
    }
  }

  static subscribeToOrder(
    orderId: string,
    callback: (order: SupabaseTowRequest) => void
  ) {
    const subscription = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tow_requests',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          console.log('Order updated:', payload.new);
          callback(payload.new as SupabaseTowRequest);
        }
      )
      .subscribe();

    return subscription;
  }

  static subscribeToCustomerOrders(
    customerId: string,
    callback: (order: SupabaseTowRequest) => void
  ) {
    const subscription = supabase
      .channel(`customer_orders:${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tow_requests',
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          console.log('Customer order updated:', payload);
          if (payload.new) {
            callback(payload.new as SupabaseTowRequest);
          }
        }
      )
      .subscribe();

    return subscription;
  }

  static subscribeToDriverOrders(
    driverId: string,
    callback: (order: SupabaseTowRequest) => void
  ) {
    const subscription = supabase
      .channel(`driver_orders:${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tow_requests',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          console.log('Driver order updated:', payload);
          if (payload.new) {
            callback(payload.new as SupabaseTowRequest);
          }
        }
      )
      .subscribe();

    return subscription;
  }

  static subscribeToPendingOrders(callback: (order: SupabaseTowRequest) => void) {
    const subscription = supabase
      .channel('pending_orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tow_requests',
          filter: 'status=eq.pending',
        },
        (payload) => {
          console.log('New pending order:', payload.new);
          callback(payload.new as SupabaseTowRequest);
        }
      )
      .subscribe();

    return subscription;
  }

  static convertSupabaseToTowRequest(supabaseOrder: SupabaseTowRequest): TowRequest {
    return {
      id: supabaseOrder.id,
      customerId: supabaseOrder.customer_id,
      driverId: supabaseOrder.driver_id,
      pickup: supabaseOrder.pickup_location,
      dropoff: supabaseOrder.dropoff_location,
      vehicleInfo: supabaseOrder.vehicle_info,
      breakdownInfo: supabaseOrder.breakdown_info,
      serviceType: supabaseOrder.service_type,
      status: supabaseOrder.status,
      distance: supabaseOrder.distance_km,
      price: supabaseOrder.price_idr,
      createdAt: new Date(supabaseOrder.created_at).getTime(),
      completedAt: supabaseOrder.completed_at
        ? new Date(supabaseOrder.completed_at).getTime()
        : undefined,
      rating: supabaseOrder.rating
        ? {
            id: `rating_${supabaseOrder.id}`,
            towRequestId: supabaseOrder.id,
            customerId: supabaseOrder.customer_id,
            driverId: supabaseOrder.driver_id || '',
            rating: supabaseOrder.rating,
            feedback: supabaseOrder.review,
            createdAt: new Date(supabaseOrder.updated_at).getTime(),
          }
        : undefined,
    };
  }

  static generateTrackingUrl(orderId: string): string {
    return `towingonline://track/${orderId}`;
  }

  static generateShareableTrackingText(orderId: string): string {
    const trackingUrl = this.generateTrackingUrl(orderId);
    return `Track your towing service:\nOrder ID: ${orderId}\n\nOpen in Towing Online app:\n${trackingUrl}\n\nOr open the app and enter this Order ID in the tracking screen.`;
  }
}
