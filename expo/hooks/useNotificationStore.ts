import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './useAuthStore';

interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: 'chat' | 'request' | 'system';
  data?: any;
  timestamp: string;
  read: boolean;
}

interface NotificationState {
  notifications: NotificationData[];
  unreadCount: number;
  permissionGranted: boolean;
}

// Configure notification behavior for mobile.
//
// LAUNCH SAFETY — the native foreground handler is registered from a mount
// effect (`ensureNotificationHandler`), never here at module scope. Module
// scope runs while Hermes is still evaluating the bundle, before the app's
// first frame. A native TurboModule call that throws in that window raises an
// Objective-C exception on `com.meta.react.turbomodulemanager.queue`, which no
// JavaScript `try/catch` can catch — it aborts the process on launch. Loading
// the module (a JS-only `require`) is cheap and safe here; touching the native
// side is deferred until the tree has mounted.
let Notifications: any = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch (error) {
    console.log('expo-notifications not available');
  }
}

let notificationHandlerConfigured = false;

/**
 * Registers the foreground-presentation handler exactly once. Called from a
 * mount effect rather than at import time — see the note above.
 */
function ensureNotificationHandler() {
  if (notificationHandlerConfigured || !Notifications) return;
  notificationHandlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (error) {
    console.log('Failed to configure notification handler', error);
  }
}

export const [NotificationContext, useNotifications] = createContextHook(() => {
  const { user } = useAuth();
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    permissionGranted: false,
  });

  // Request notification permissions
  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'web') {
      // For web, use browser notifications
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        setState(prev => ({ ...prev, permissionGranted: permission === 'granted' }));
        return permission === 'granted';
      }
      return false;
    } else {
      // For mobile, use expo-notifications if available
      if (Notifications) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        const granted = finalStatus === 'granted';
        setState(prev => ({ ...prev, permissionGranted: granted }));
        return granted;
      } else {
        setState(prev => ({ ...prev, permissionGranted: false }));
        return false;
      }
    }
  }, []);

  // Show notification
  const showNotification = useCallback(async (
    title: string,
    message: string,
    type: 'chat' | 'request' | 'system' = 'chat',
    data?: any
  ) => {
    // The in-app banner/list must not depend on OS push permission — most
    // drivers never grant that, and it's the in-app toast (not a system
    // push) that has to appear on any screen. Permission only gates the
    // native/browser notification below.
    const notificationData: NotificationData = {
      id: Date.now().toString(),
      title,
      message,
      type,
      data,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Add to local notifications list
    setState(prev => ({
      ...prev,
      notifications: [notificationData, ...prev.notifications.slice(0, 49)], // Keep last 50
      unreadCount: prev.unreadCount + 1,
    }));

    if (Platform.OS === 'web') {
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body: message,
          icon: '/assets/images/icon.png',
          tag: notificationData.id,
        });
        
        // Auto close after 5 seconds
        setTimeout(() => notification.close(), 5000);
      }
    } else if (Notifications) {
      // Show mobile notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: message,
          data,
          sound: true,
        },
        trigger: null, // Show immediately
      });
    }
  }, []);

  // Show chat notification
  const showChatNotification = useCallback(async (
    senderName: string,
    message: string,
    requestId: string,
    senderId: string
  ) => {
    await showNotification(
      `Pesan dari ${senderName}`,
      message,
      'chat',
      { requestId, senderId }
    );
  }, [showNotification]);

  // Show request notification
  const showRequestNotification = useCallback(async (
    title: string,
    message: string,
    requestId: string
  ) => {
    await showNotification(
      title,
      message,
      'request',
      { requestId }
    );
  }, [showNotification]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
      ),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.map(notif => ({ ...notif, read: true })),
      unreadCount: 0,
    }));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: [],
      unreadCount: 0,
    }));
  }, []);

  // Initialize permissions on mount
  useEffect(() => {
    requestPermissions();
  }, [requestPermissions]);

  // Listen for notification responses (when user taps notification)
  useEffect(() => {
    if (Platform.OS !== 'web' && Notifications) {
      // Register the foreground handler now that the tree has mounted, well
      // clear of the bundle-evaluation window where a native throw would
      // abort launch.
      ensureNotificationHandler();

      const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped:', data);
        
        // Handle notification tap - could navigate to chat or request
        if (data?.requestId) {
          // You can add navigation logic here
          console.log('Navigate to request:', data.requestId);
        }
      });

      return () => subscription.remove();
    }
  }, []);

  return useMemo(() => ({
    // State
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    permissionGranted: state.permissionGranted,
    
    // Actions
    requestPermissions,
    showNotification,
    showChatNotification,
    showRequestNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  }), [
    state.notifications,
    state.unreadCount,
    state.permissionGranted,
    requestPermissions,
    showNotification,
    showChatNotification,
    showRequestNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  ]);
});