import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useMemo } from "react";
import * as Location from 'expo-location';
import { supabase } from "@/lib/supabase";
import { ChatMessage, ChatConversation, SupabaseTowRequest, Location as LocationType } from "@/types";
import { useAuth } from "./useAuthStore";
import { useNotifications } from "./useNotificationStore";
import { appAlert } from "@/lib/appAlert";

interface ChatState {
  messages: ChatMessage[];
  conversations: ChatConversation[];
  activeConversation: string | null;
  unreadCount: number;
  loading: boolean;
  error: string | null;
  typingUsers: { [requestId: string]: { [userId: string]: boolean } };
}

// Check if a string is a valid UUID format
const isValidUUID = (str: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Convert timestamp-based ID to UUID if needed
const normalizeRequestId = (requestId: string): string => {
  if (isValidUUID(requestId)) {
    return requestId;
  }
  
  // For non-UUID IDs (like timestamp-based), generate a consistent UUID
  // This ensures the same non-UUID ID always maps to the same UUID
  const hash = requestId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  // Use the hash to generate a consistent UUID
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0,8)}-${hex.slice(0,4)}-4${hex.slice(1,4)}-8${hex.slice(2,5)}-${hex}${hex.slice(0,4)}`;
};

export const [ChatContext, useChat] = createContextHook(() => {
  const { user } = useAuth();
  const { showChatNotification } = useNotifications();
  const [state, setState] = useState<ChatState>({
    messages: [],
    conversations: [],
    activeConversation: null,
    unreadCount: 0,
    loading: false,
    error: null,
    typingUsers: {},
  });

  // Set typing status
  const setTypingStatus = useCallback(async (towRequestId: string, isTyping: boolean) => {
    if (!user) return;

    try {
      const channel = supabase.channel(`typing_${towRequestId}`);
      
      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: user.id,
          is_typing: isTyping,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error setting typing status:', error);
    }
  }, [user]);

  // Send a message
  const sendMessage = useCallback(async (
    towRequestId: string,
    receiverId: string,
    content: string,
    messageType: 'text' | 'location' | 'system' | 'image' | 'status_update' = 'text',
    metadata?: any
  ): Promise<boolean> => {
    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // First, stop typing indicator
      await setTypingStatus(towRequestId, false);

      // Normalize the request ID to UUID format
      const normalizedRequestId = normalizeRequestId(towRequestId);

      console.log('Attempting to send message:', {
        original_request_id: towRequestId,
        normalized_request_id: normalizedRequestId,
        sender_id: user.id,
        receiver_id: receiverId,
        message_type: messageType,
        content,
        metadata: metadata || null,
      });

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          tow_request_id: normalizedRequestId,
          sender_id: user.id,
          receiver_id: receiverId,
          message_type: messageType,
          content,
          metadata: metadata || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        setState(prev => ({ ...prev, error: `Gagal mengirim pesan. Silakan coba lagi.`, loading: false }));
        return false;
      }

      console.log('Message sent successfully:', data);
      
      // Add message to local state immediately for better UX
      setState(prev => ({
        ...prev,
        messages: prev.activeConversation === towRequestId 
          ? [...prev.messages, data]
          : prev.messages,
        loading: false,
      }));
      
      return true;
    } catch (error) {
      console.error('Error sending message (catch block):', error);
      setState(prev => ({ ...prev, error: `Gagal mengirim pesan. Silakan coba lagi.`, loading: false }));
      return false;
    }
  }, [user, setTypingStatus]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async (towRequestId: string) => {
    if (!user) return;

    try {
      // Normalize the request ID to UUID format
      const normalizedRequestId = normalizeRequestId(towRequestId);

      // Try to use the RPC function first
      let { error } = await supabase.rpc('mark_messages_as_read', {
        request_id: normalizedRequestId,
        user_id: user.id,
      });

      // If the function doesn't exist, fall back to direct update
      if (error && (error.code === 'PGRST202' || error.message?.includes('function'))) {
        console.log('mark_messages_as_read function not found, using direct update');
        
        const { error: updateError } = await supabase
          .from('chat_messages')
          .update({ 
            is_read: true, 
            read_at: new Date().toISOString() 
          })
          .eq('tow_request_id', normalizedRequestId)
          .eq('receiver_id', user.id)
          .eq('is_read', false);

        if (updateError) {
          console.error('Error marking messages as read with direct update:', updateError);
        }
      } else if (error) {
        console.error('Error marking messages as read:', error);
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [user]);

  // Send location message
  const sendLocationMessage = useCallback(async (
    towRequestId: string,
    receiverId: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        appAlert('Permission Denied', 'Location permission is required to share your location.');
        return false;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const locationMessage = `📍 Lokasi saya: ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`;
      const metadata = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      return await sendMessage(towRequestId, receiverId, locationMessage, 'location', metadata);
    } catch (error) {
      console.error('Error sending location:', error);
      appAlert('Error', 'Failed to get your location. Please try again.');
      return false;
    }
  }, [user, sendMessage]);

  // Load messages for a specific tow request
  const loadMessages = useCallback(async (towRequestId: string) => {
    if (!user) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Normalize the request ID to UUID format
      const normalizedRequestId = normalizeRequestId(towRequestId);

      console.log('Loading messages for request:', {
        original: towRequestId,
        normalized: normalizedRequestId
      });
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('tow_request_id', normalizedRequestId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        setState(prev => ({ ...prev, error: `Gagal memuat pesan. Silakan coba lagi.`, loading: false }));
        return;
      }
      
      console.log('Loaded messages:', data?.length || 0, 'messages');

      setState(prev => ({
        ...prev,
        messages: data || [],
        activeConversation: towRequestId,
        loading: false,
      }));

      // Mark messages as read
      await markMessagesAsRead(towRequestId);
    } catch (error) {
      console.error('Error loading messages:', error);
      setState(prev => ({ ...prev, error: 'Gagal memuat pesan. Silakan coba lagi.', loading: false }));
    }
  }, [user, markMessagesAsRead]);

  const isNetworkError = (err: any): boolean => {
    const msg = err?.message ?? String(err);
    return msg.includes('Load failed') || msg.includes('Network request failed') || msg.includes('TypeError');
  };

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Try to load from chat_conversations view first
      let { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      // If the view doesn't exist, fall back to loading from tow_requests
      if (error && error.code === 'PGRST205') {
        console.log('chat_conversations view not found, falling back to tow_requests');
        
        const { data: requestsData, error: requestsError } = await supabase
          .from('tow_requests')
          .select('*')
          .or(`customer_id.eq.${user.id},driver_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (requestsError) {
          if (isNetworkError(requestsError)) {
            console.log('Network unavailable, skipping conversation load');
          } else {
            console.error('Error loading tow requests:', requestsError);
          }
          setState(prev => ({ ...prev, loading: false }));
          return;
        }

        // Transform tow_requests to conversation format
        data = requestsData?.map(request => ({
          tow_request_id: request.id,
          customer_id: request.customer_id,
          driver_id: request.driver_id,
          request_status: request.status,
          service_type: request.service_type,
          pickup_location: request.pickup_location,
          dropoff_location: request.dropoff_location,
          vehicle_info: request.vehicle_info,
          last_message: 'No messages yet',
          last_message_at: request.created_at,
          unread_count: 0,
        })) || [];
      } else if (error) {
        if (isNetworkError(error)) {
          console.log('Network unavailable, skipping conversation load');
        } else {
          console.error('Error loading conversations:', error);
        }
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      setState(prev => ({
        ...prev,
        conversations: data || [],
        loading: false,
      }));
    } catch (error) {
      if (isNetworkError(error)) {
        console.log('Network unavailable, skipping conversation load');
      } else {
        console.error('Error loading conversations:', error);
      }
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Get unread message count
  const getUnreadCount = useCallback(async () => {
    if (!user) return;

    try {
      // Try to use the RPC function first
      let { data, error } = await supabase.rpc('get_unread_message_count', {
        user_id: user.id,
      });

      // If the function doesn't exist, fall back to direct query
      if (error && (error.code === 'PGRST202' || error.message?.includes('function'))) {
        console.log('get_unread_message_count function not found, using direct query');
        
        const { data: messagesData, error: messagesError } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('receiver_id', user.id)
          .eq('is_read', false);

        if (messagesError) {
          if (isNetworkError(messagesError)) {
            console.log('Network unavailable, skipping unread count');
          } else {
            console.error('Error getting unread count with direct query:', messagesError);
          }
          return;
        }

        data = messagesData?.length || 0;
      } else if (error) {
        if (isNetworkError(error)) {
          console.log('Network unavailable, skipping unread count');
        } else {
          console.error('Error getting unread count:', error);
        }
        return;
      }

      setState(prev => ({ ...prev, unreadCount: data || 0 }));
    } catch (error) {
      if (isNetworkError(error)) {
        console.log('Network unavailable, skipping unread count');
      } else {
        console.error('Error getting unread count:', error);
      }
    }
  }, [user]);

  // Get typing users for a request
  const getTypingUsers = useCallback((towRequestId: string): string[] => {
    const typingInRequest = state.typingUsers[towRequestId] || {};
    return Object.keys(typingInRequest).filter(userId => 
      typingInRequest[userId] && userId !== user?.id
    );
  }, [state.typingUsers, user?.id]);

  // Clear active conversation
  const clearActiveConversation = useCallback(() => {
    setState(prev => ({
      ...prev,
      activeConversation: null,
      messages: [],
    }));
  }, []);

  // Create a new tow request in Supabase
  const createTowRequest = useCallback(async (
    pickupLocation: LocationType,
    dropoffLocation: LocationType,
    vehicleInfo: any,
    breakdownInfo: any,
    serviceType: string,
    distanceKm: number,
    priceIdr: number
  ): Promise<SupabaseTowRequest | null> => {
    if (!user) return null;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase
        .from('tow_requests')
        .insert({
          customer_id: user.id,
          pickup_location: pickupLocation,
          dropoff_location: dropoffLocation,
          vehicle_info: vehicleInfo,
          breakdown_info: breakdownInfo,
          service_type: serviceType,
          distance_km: distanceKm,
          price_idr: priceIdr,
          status: 'pending',
          payment_status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating tow request:', error);
        setState(prev => ({ ...prev, error: 'Failed to create tow request', loading: false }));
        return null;
      }

      console.log('Tow request created successfully:', data);
      return data;
    } catch (error) {
      console.error('Error creating tow request:', error);
      setState(prev => ({ ...prev, error: 'Failed to create tow request', loading: false }));
      return null;
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Accept a tow request (driver)
  const acceptTowRequest = useCallback(async (towRequestId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase
        .from('tow_requests')
        .update({
          driver_id: user.id,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', towRequestId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) {
        console.error('Error accepting tow request:', error);
        setState(prev => ({ ...prev, error: 'Failed to accept tow request', loading: false }));
        return false;
      }

      console.log('Tow request accepted successfully:', data);
      return true;
    } catch (error) {
      console.error('Error accepting tow request:', error);
      setState(prev => ({ ...prev, error: 'Failed to accept tow request', loading: false }));
      return false;
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Update tow request status
  const updateTowRequestStatus = useCallback(async (
    towRequestId: string,
    status: 'in_progress' | 'completed' | 'cancelled',
    cancellationReason?: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const updateData: any = { status };
      
      switch (status) {
        case 'in_progress':
          updateData.started_at = new Date().toISOString();
          break;
        case 'completed':
          updateData.completed_at = new Date().toISOString();
          break;
        case 'cancelled':
          updateData.cancelled_at = new Date().toISOString();
          if (cancellationReason) {
            updateData.cancellation_reason = cancellationReason;
          }
          break;
      }

      const { data, error } = await supabase
        .from('tow_requests')
        .update(updateData)
        .eq('id', towRequestId)
        .select()
        .single();

      if (error) {
        console.error('Error updating tow request status:', error);
        setState(prev => ({ ...prev, error: 'Failed to update request status', loading: false }));
        return false;
      }

      console.log('Tow request status updated successfully:', data);
      return true;
    } catch (error) {
      console.error('Error updating tow request status:', error);
      setState(prev => ({ ...prev, error: 'Failed to update request status', loading: false }));
      return false;
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Get pending tow requests (for drivers)
  const getPendingRequests = useCallback(async (): Promise<SupabaseTowRequest[]> => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .select('*')
        .eq('status', 'pending')
        .is('driver_id', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting pending requests:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting pending requests:', error);
      return [];
    }
  }, [user]);

  // Get user's tow requests
  const getUserRequests = useCallback(async (): Promise<SupabaseTowRequest[]> => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('tow_requests')
        .select('*')
        .or(`customer_id.eq.${user.id},driver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting user requests:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting user requests:', error);
      return [];
    }
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    console.log('Setting up real-time subscriptions for user:', user.id);

    // Subscribe to new messages (both sent and received)
    const messagesSubscription = supabase
      .channel('chat_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          console.log('New message received:', payload);
          
          const newMessage = payload.new as ChatMessage;
          
          // Only add to messages if it's for the current active conversation
          // and it's not already in the messages (to avoid duplicates)
          setState(prev => {
            const isForActiveConversation = prev.activeConversation === newMessage.tow_request_id;
            const isAlreadyInMessages = prev.messages.some(msg => msg.id === newMessage.id);
            const isMyMessage = newMessage.sender_id === user.id;
            const isForMe = newMessage.receiver_id === user.id;
            
            // Show notification for incoming messages (not from current user)
            if (isForMe && !isMyMessage && !isForActiveConversation) {
              const senderName = user.role === 'customer' ? 'Driver' : 'Pelanggan';
              showChatNotification(
                senderName,
                newMessage.content,
                newMessage.tow_request_id,
                newMessage.sender_id
              );
            }
            
            if (isForActiveConversation && !isAlreadyInMessages) {
              return {
                ...prev,
                messages: [...prev.messages, newMessage],
                unreadCount: isForMe && !isMyMessage ? prev.unreadCount + 1 : prev.unreadCount,
              };
            }
            
            return {
              ...prev,
              unreadCount: isForMe && !isMyMessage ? prev.unreadCount + 1 : prev.unreadCount,
            };
          });
        }
      )
      .subscribe();

    // Subscribe to tow request updates
    const requestsSubscription = supabase
      .channel('tow_requests')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tow_requests',
          filter: `customer_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Tow request updated:', payload);
          // Handle tow request status changes
        }
      )
      .subscribe();

    // Subscribe to typing indicators for active conversation
    let typingChannel: any = null;
    
    if (state.activeConversation) {
      typingChannel = supabase.channel(`typing_${state.activeConversation}`);
      
      typingChannel
        .on('broadcast', { event: 'typing' }, (payload: any) => {
          console.log('Typing event received:', payload);
          const { user_id, is_typing } = payload.payload;
          
          if (user_id !== user.id) {
            setState(prev => ({
              ...prev,
              typingUsers: {
                ...prev.typingUsers,
                [state.activeConversation!]: {
                  ...prev.typingUsers[state.activeConversation!],
                  [user_id]: is_typing,
                },
              },
            }));
            
            // Clear typing after 3 seconds if no update
            if (is_typing) {
              setTimeout(() => {
                setState(prev => ({
                  ...prev,
                  typingUsers: {
                    ...prev.typingUsers,
                    [state.activeConversation!]: {
                      ...prev.typingUsers[state.activeConversation!],
                      [user_id]: false,
                    },
                  },
                }));
              }, 3000);
            }
          }
        })
        .subscribe();
    }

    // Load initial data
    loadConversations();
    getUnreadCount();

    return () => {
      console.log('Cleaning up real-time subscriptions');
      messagesSubscription.unsubscribe();
      requestsSubscription.unsubscribe();
      if (typingChannel) {
        typingChannel.unsubscribe();
      }
    };
  }, [user, state.activeConversation, loadConversations, getUnreadCount, showChatNotification]);

  return useMemo(() => ({
    // State
    messages: state.messages,
    conversations: state.conversations,
    activeConversation: state.activeConversation,
    unreadCount: state.unreadCount,
    loading: state.loading,
    error: state.error,
    typingUsers: state.typingUsers,

    // Actions
    sendMessage,
    sendLocationMessage,
    loadMessages,
    markMessagesAsRead,
    loadConversations,
    getUnreadCount,
    clearActiveConversation,
    setTypingStatus,
    getTypingUsers,

    // Tow Request Actions
    createTowRequest,
    acceptTowRequest,
    updateTowRequestStatus,
    getPendingRequests,
    getUserRequests,
  }), [
    state,
    sendMessage,
    sendLocationMessage,
    loadMessages,
    markMessagesAsRead,
    loadConversations,
    getUnreadCount,
    clearActiveConversation,
    setTypingStatus,
    getTypingUsers,
    createTowRequest,
    acceptTowRequest,
    updateTowRequestStatus,
    getPendingRequests,
    getUserRequests,
  ]);
});