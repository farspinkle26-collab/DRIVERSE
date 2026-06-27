import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useThemeStore';
import Chat from '@/components/Chat';

export default function ChatScreen() {
  const { theme } = useTheme();
  const { requestId, receiverId } = useLocalSearchParams<{
    requestId: string;
    receiverId: string;
  }>();

  if (!requestId || !receiverId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Chat Error' }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.textDark }]}>Missing chat parameters</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{ 
          title: 'Chat',
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.textDark,
        }} 
      />
      
      <Chat 
        requestId={requestId}
        receiverId={receiverId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});