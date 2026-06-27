import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  Alert,
  Linking,
  ActivityIndicator 
} from 'react-native';
import { Send, MapPin, Phone, MessageCircle, MessageSquare } from 'lucide-react-native';
import { useTheme } from '@/hooks/useThemeStore';
import { useChat } from '@/hooks/useChatStore';
import { useAuth } from '@/hooks/useAuthStore';
import { ChatMessage } from '@/types';

interface ChatProps {
  requestId: string;
  receiverId: string;
  onClose?: () => void;
}

export default function Chat({ requestId, receiverId, onClose }: ChatProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { 
    messages, 
    sendMessage, 
    sendLocationMessage, 
    loadMessages, 
    setTypingStatus,
    getTypingUsers,
    loading,
    error 
  } = useChat();
  const [message, setMessage] = useState<string>('');
  const [showQuickReplies, setShowQuickReplies] = useState<boolean>(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Get typing users (excluding current user)
  const typingUsers = getTypingUsers(requestId);
  const isOtherUserTyping = typingUsers.length > 0;
  
  // Quick reply messages based on user role
  const getQuickReplies = () => {
    if (!user) return [];
    
    if (user.role === 'customer') {
      return [
        'Saya sudah di lokasi pickup',
        'Berapa lama lagi driver sampai?',
        'Tolong hubungi saya jika ada masalah',
        'Terima kasih atas bantuannya',
        'Apakah ada biaya tambahan?',
        'Saya tunggu di tempat yang mudah diakses',
        'Mohon info estimasi waktu tiba',
        'Kendaraan saya warna [sebutkan warna]'
      ];
    } else {
      return [
        'Saya sedang dalam perjalanan ke lokasi Anda',
        'Saya akan tiba dalam 10-15 menit',
        'Mohon tunggu di tempat yang mudah diakses',
        'Saya sudah sampai di lokasi',
        'Kendaraan derek sudah siap',
        'Proses derek sedang berlangsung',
        'Kendaraan sudah dimuat, kita berangkat',
        'Kita sudah sampai di tujuan',
        'Terima kasih, semoga harinya menyenangkan'
      ];
    }
  };

  // Get the other user's phone number for calling
  const getOtherUserPhone = () => {
    if (!user) return null;
    
    if (user.role === 'customer') {
      // Customer wants to call driver - get driver phone from mock data
      return '+62812345678'; // Mock driver phone
    } else {
      // Driver wants to call customer - get customer phone
      return '+62812345679'; // Mock customer phone
    }
  };

  useEffect(() => {
    loadMessages(requestId);
    
    // Cleanup typing timeout on unmount
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      // Stop typing when leaving chat
      setTypingStatus(requestId, false);
    };
  }, [requestId, loadMessages, typingTimeout, setTypingStatus]);

  useEffect(() => {
    // Auto scroll to bottom when new messages arrive
    if (scrollViewRef.current && messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || message.trim();
    if (!textToSend || loading) return;

    if (!messageText) {
      setMessage('');
    }
    setShowQuickReplies(false);
    
    // Clear typing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }

    try {
      const success = await sendMessage(requestId, receiverId, textToSend);
      if (!success) {
        if (!messageText) {
          setMessage(textToSend); // Restore message if failed
        }
        Alert.alert('Error', 'Gagal mengirim pesan. Silakan coba lagi.');
      }
    } catch (err) {
      console.error('Error in handleSendMessage:', err);
      if (!messageText) {
        setMessage(textToSend); // Restore message if failed
      }
      Alert.alert('Error', 'Gagal mengirim pesan. Silakan coba lagi.');
    }
  };

  const handleQuickReply = (quickMessage: string) => {
    handleSendMessage(quickMessage);
  };

  const handleSendLocation = async () => {
    if (loading) return;

    const success = await sendLocationMessage(requestId, receiverId);
    if (!success) {
      Alert.alert('Error', 'Gagal mengirim lokasi. Silakan coba lagi.');
    }
  };

  const handlePhoneCall = async () => {
    const phoneNumber = getOtherUserPhone();
    if (!phoneNumber) {
      Alert.alert("Error", "Nomor telepon tidak tersedia");
      return;
    }

    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    const phoneUrl = Platform.select({
      ios: `tel:${cleanPhoneNumber}`,
      android: `tel:${cleanPhoneNumber}`,
      web: `tel:${cleanPhoneNumber}`
    });

    try {
      const canOpen = await Linking.canOpenURL(phoneUrl!);
      if (canOpen) {
        await Linking.openURL(phoneUrl!);
      } else {
        Alert.alert("Error", "Tidak dapat membuka aplikasi telepon");
      }
    } catch (error) {
      console.error('Error opening phone app:', error);
      Alert.alert("Error", "Gagal membuka aplikasi telepon");
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const isMyMessage = (senderId: string) => {
    return senderId === user?.id;
  };

  const isSystemMessage = (senderId: string) => {
    return senderId === '00000000-0000-0000-0000-000000000000';
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.textDark }]}>Chat</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textLight }]}>
            {user?.role === 'customer' ? 'dengan Driver' : 'dengan Pelanggan'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            onPress={handlePhoneCall} 
            style={[styles.phoneButton, { backgroundColor: theme.primary + '20' }]}
          >
            <Phone size={20} color={theme.primary} />
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: theme.primary }]}>Tutup</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <MessageCircle size={48} color={theme.textLight} />
            <Text style={[styles.emptyChatText, { color: theme.textLight }]}>
              Mulai percakapan dengan {user?.role === 'customer' ? 'driver' : 'pelanggan'}
            </Text>
            <Text style={[styles.emptyChatSubtext, { color: theme.textLight }]}>
              Pesan akan muncul di sini secara real-time
            </Text>
          </View>
        ) : (
          messages.map((chatMessage: ChatMessage) => (
          <View
            key={chatMessage.id}
            style={[
              styles.messageContainer,
              chatMessage.message_type === 'system' || isSystemMessage(chatMessage.sender_id)
                ? styles.systemMessage
                : isMyMessage(chatMessage.sender_id)
                ? styles.myMessage
                : styles.otherMessage
            ]}
          >
            {chatMessage.message_type === 'system' || isSystemMessage(chatMessage.sender_id) ? (
              <View style={[styles.systemMessageContent, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.systemMessageText, { color: theme.primary }]}>
                  {chatMessage.content}
                </Text>
                <Text style={[styles.messageTime, { color: theme.textLight }]}>
                  {formatTime(chatMessage.created_at)}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.messageContent,
                  {
                    backgroundColor: isMyMessage(chatMessage.sender_id) 
                      ? theme.primary 
                      : theme.card,
                    borderColor: theme.border
                  }
                ]}
              >
                {!isMyMessage(chatMessage.sender_id) && (
                  <Text style={[styles.senderName, { color: theme.textLight }]}>
                    {user?.role === 'customer' ? 'Driver' : 'Pelanggan'}
                  </Text>
                )}
                <Text
                  style={[
                    styles.messageText,
                    {
                      color: isMyMessage(chatMessage.sender_id) 
                        ? theme.white 
                        : theme.textDark
                    }
                  ]}
                >
                  {chatMessage.content}
                </Text>
                {chatMessage.message_type === 'location' && chatMessage.metadata && (
                  <Text style={[styles.locationInfo, { color: isMyMessage(chatMessage.sender_id) ? theme.white + '80' : theme.textLight }]}>
                    📍 Lat: {chatMessage.metadata.latitude?.toFixed(6)}, Lng: {chatMessage.metadata.longitude?.toFixed(6)}
                  </Text>
                )}
                <Text
                  style={[
                    styles.messageTime,
                    {
                      color: isMyMessage(chatMessage.sender_id) 
                        ? theme.white + '80' 
                        : theme.textLight
                    }
                  ]}
                >
                  {formatTime(chatMessage.created_at)}
                </Text>
              </View>
            )}
          </View>
        ))
        )}
        
        {/* Typing indicator - only show when OTHER user is typing */}
        {isOtherUserTyping && (
          <View style={styles.typingContainer}>
            <View style={[styles.typingBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.typingText, { color: theme.textLight }]}>
                {user?.role === 'customer' ? 'Driver' : 'Pelanggan'} sedang mengetik...
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick Replies */}
      {showQuickReplies && (
        <View style={[styles.quickRepliesContainer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRepliesContent}
          >
            {getQuickReplies().map((reply, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.quickReplyButton, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => handleQuickReply(reply)}
              >
                <Text style={[styles.quickReplyText, { color: theme.textDark }]} numberOfLines={2}>
                  {reply}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={[styles.quickReplyToggle, { backgroundColor: theme.primary + '20' }]}
            onPress={() => setShowQuickReplies(!showQuickReplies)}
          >
            <MessageSquare size={20} color={theme.primary} />
          </TouchableOpacity>
          
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                color: theme.textDark
              }
            ]}
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              
              // Handle typing indicator
              if (text.length > 0) {
                // Start typing
                setTypingStatus(requestId, true);
                
                // Clear existing timeout
                if (typingTimeout) {
                  clearTimeout(typingTimeout);
                }
                
                // Set new timeout to stop typing after 2 seconds of inactivity
                const newTimeout = setTimeout(() => {
                  setTypingStatus(requestId, false);
                }, 2000);
                
                setTypingTimeout(newTimeout as ReturnType<typeof setTimeout>);
              } else {
                // Stop typing immediately when text is empty
                setTypingStatus(requestId, false);
                if (typingTimeout) {
                  clearTimeout(typingTimeout);
                  setTypingTimeout(null);
                }
              }
            }}
            placeholder="Ketik pesan..."
            placeholderTextColor={theme.textLight}
            multiline
            maxLength={500}
          />
          
          {user?.role === 'driver' && (
            <TouchableOpacity
              style={[styles.locationButton, { backgroundColor: theme.primary + '20' }]}
              onPress={handleSendLocation}
              disabled={loading}
            >
              <MapPin size={20} color={theme.primary} />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: message.trim() ? theme.primary : theme.border,
                opacity: loading ? 0.5 : 1
              }
            ]}
            onPress={() => handleSendMessage()}
            disabled={!message.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size={20} color={theme.white} />
            ) : (
              <Send size={20} color={theme.white} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phoneButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    marginBottom: 12,
  },
  systemMessage: {
    alignItems: 'center',
  },
  myMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  systemMessageContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '80%',
  },
  systemMessageText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  messageContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '80%',
    borderWidth: 1,
  },
  senderName: {
    fontSize: 12,
    marginBottom: 2,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 11,
    textAlign: 'right',
  },
  inputContainer: {
    padding: 16,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  quickReplyToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickRepliesContainer: {
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  quickRepliesContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickReplyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 120,
    maxWidth: 200,
  },
  quickReplyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 18,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
  },
  locationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyChatText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyChatSubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  typingContainer: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  typingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  locationInfo: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
});