import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { X, MessageCircle, Bell } from 'lucide-react-native';
import { useTheme } from '@/hooks/useThemeStore';
import { useNotifications } from '@/hooks/useNotificationStore';
import { router } from 'expo-router';

interface NotificationBannerProps {
  onPress?: (data: any) => void;
}

export default function NotificationBanner({ onPress }: NotificationBannerProps) {
  const { theme } = useTheme();
  const { notifications, markAsRead } = useNotifications();
  const [currentNotification, setCurrentNotification] = useState<any>(null);
  const [slideAnim] = useState(new Animated.Value(-100));

  // Get the latest unread notification
  const latestUnreadNotification = notifications.find(notif => !notif.read);

  const showBanner = useCallback(() => {
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(4000), // Show for 4 seconds
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentNotification(null);
    });
  }, [slideAnim]);

  useEffect(() => {
    if (latestUnreadNotification && latestUnreadNotification.id !== currentNotification?.id) {
      setCurrentNotification(latestUnreadNotification);
      showBanner();
    }
  }, [latestUnreadNotification, currentNotification, showBanner]);

  const handlePress = () => {
    if (currentNotification) {
      markAsRead(currentNotification.id);
      
      // Navigate to chat if it's a chat notification
      if (currentNotification.type === 'chat' && currentNotification.data?.requestId) {
        router.push({
          pathname: '/chat',
          params: {
            requestId: currentNotification.data.requestId,
            receiverId: currentNotification.data.senderId,
          },
        });
      }
      
      onPress?.(currentNotification.data);
      hideBanner();
    }
  };

  const handleDismiss = () => {
    if (currentNotification) {
      markAsRead(currentNotification.id);
      hideBanner();
    }
  };

  const hideBanner = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setCurrentNotification(null);
    });
  };

  const getIcon = () => {
    if (!currentNotification) return null;
    
    switch (currentNotification.type) {
      case 'chat':
        return <MessageCircle size={20} color={theme.white} />;
      case 'request':
      case 'system':
      default:
        return <Bell size={20} color={theme.white} />;
    }
  };

  if (!currentNotification) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.primary,
          transform: [{ translateY: slideAnim }],
          top: Platform.OS === 'ios' ? 50 : 30, // Account for status bar
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          {getIcon()}
        </View>
        
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: theme.white }]} numberOfLines={1}>
            {currentNotification.title}
          </Text>
          <Text style={[styles.message, { color: theme.white + 'CC' }]} numberOfLines={2}>
            {currentNotification.message}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={18} color={theme.white} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    padding: 4,
  },
});