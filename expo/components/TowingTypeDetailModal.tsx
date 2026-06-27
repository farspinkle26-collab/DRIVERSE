import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
} from 'react-native';
import { X, Info, Car } from 'lucide-react-native';
import { useTheme } from '@/hooks/useThemeStore';
import { TowingType } from '@/types';
import Button from './Button';

interface TowingTypeDetailModalProps {
  visible: boolean;
  onClose: () => void;
  towingType: TowingType | null;
  onSelectService?: (serviceId: string) => void;
}

export default function TowingTypeDetailModal({
  visible,
  onClose,
  towingType,
  onSelectService,
}: TowingTypeDetailModalProps) {
  const { theme } = useTheme();

  if (!towingType) return null;

  const handleSelectService = () => {
    if (onSelectService) {
      onSelectService(towingType.id);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
              <Info size={20} color={theme.primary} />
            </View>
            <Text style={[styles.headerTitle, { color: theme.textDark }]}>Detail Layanan</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: theme.card }]}
            activeOpacity={0.7}
          >
            <X size={20} color={theme.textLight} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Service Image */}
          <View style={[styles.imageContainer, { backgroundColor: theme.card }]}>
            <Image
              source={{ uri: towingType.icon }}
              style={styles.serviceImage}
              resizeMode="contain"
              onError={(error) => {
                console.log('Image loading error:', error.nativeEvent.error);
                console.log('Image URL:', towingType.icon);
              }}
              onLoad={() => {
                console.log('Image loaded successfully:', towingType.icon);
              }}
            />
            {/* Car icon overlay for Derek Basement */}
            {towingType.name === 'Derek Basement' && (
              <View style={[styles.carIconOverlay, { backgroundColor: theme.primary }]}>
                <Car size={20} color="white" />
              </View>
            )}
          </View>

          {/* Service Info */}
          <View style={styles.serviceInfo}>
            <Text style={[styles.serviceName, { color: theme.textDark }]}>
              {towingType.name}
            </Text>
            <Text style={[styles.servicePrice, { color: theme.primary }]}>
              {towingType.price}
            </Text>
            <Text style={[styles.shortDescription, { color: theme.textLight }]}>
              {towingType.description}
            </Text>
          </View>

          {/* Detailed Description */}
          <View style={[styles.descriptionContainer, { backgroundColor: theme.card }]}>
            <Text style={[styles.descriptionTitle, { color: theme.textDark }]}>
              Penjelasan Lengkap
            </Text>
            <Text style={[styles.detailedDescription, { color: theme.textLight }]}>
              {towingType.detailedDescription.replace(/\\n/g, '\n')}
            </Text>
          </View>

          {/* Action Button */}
          {onSelectService && (
            <View style={styles.actionContainer}>
              <Button
                title={`Pilih ${towingType.name}`}
                onPress={handleSelectService}
                variant="primary"
                size="large"
                style={styles.selectButton}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  serviceImage: {
    width: 120,
    height: 120,
  },
  carIconOverlay: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'white',
  },
  serviceInfo: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  serviceName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  servicePrice: {
    fontSize: 18,
    fontWeight: '600',
  },
  shortDescription: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  descriptionContainer: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  descriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailedDescription: {
    fontSize: 15,
    lineHeight: 24,
  },
  actionContainer: {
    paddingTop: 8,
  },
  selectButton: {
    width: '100%',
  },
});