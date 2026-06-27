import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Star, Heart, MessageCircle, Clock, Car, X } from 'lucide-react-native';
import { TowRequest, Driver } from '@/types';
import { useRatingTip } from '@/hooks/useRatingTipStore';
import colors from '@/constants/colors';

const { width } = Dimensions.get('window');

interface RatingTipScreenProps {
  visible: boolean;
  onClose: () => void;
  towRequest: TowRequest;
  driver: Driver;
  onComplete?: () => void;
}

const RatingTipScreen: React.FC<RatingTipScreenProps> = ({
  visible,
  onClose,
  towRequest,
  driver,
  onComplete,
}) => {
  const { submitRating, submitTip, tipOptions, loading } = useRatingTip();
  const [currentStep, setCurrentStep] = useState<'rating' | 'tip'>('rating');
  
  // Rating state
  const [overallRating, setOverallRating] = useState<number>(5);
  const [feedback, setFeedback] = useState<string>('');
  const [categoryRatings, setCategoryRatings] = useState({
    punctuality: 5,
    professionalism: 5,
    vehicleCondition: 5,
    communication: 5,
  });

  // Tip state
  const [selectedTipAmount, setSelectedTipAmount] = useState<number>(0);
  const [customTipAmount, setCustomTipAmount] = useState<string>('');
  const [showCustomTip, setShowCustomTip] = useState<boolean>(false);

  const handleComplete = useCallback(() => {
    onComplete?.();
    onClose();
    // Reset state
    setCurrentStep('rating');
    setOverallRating(5);
    setFeedback('');
    setCategoryRatings({
      punctuality: 5,
      professionalism: 5,
      vehicleCondition: 5,
      communication: 5,
    });
    setSelectedTipAmount(0);
    setCustomTipAmount('');
    setShowCustomTip(false);
  }, [onComplete, onClose]);

  const handleRatingSubmit = useCallback(async () => {
    if (!towRequest.driverId) return;

    const ratingResult = await submitRating({
      towRequestId: towRequest.id,
      driverId: towRequest.driverId,
      rating: overallRating,
      feedback: feedback.trim() || undefined,
      categories: categoryRatings,
    });

    if (ratingResult) {
      setCurrentStep('tip');
    } else {
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    }
  }, [towRequest, overallRating, feedback, categoryRatings, submitRating]);

  const handleTipSubmit = useCallback(async () => {
    if (!towRequest.driverId) return;

    let tipAmount = selectedTipAmount;
    if (showCustomTip && customTipAmount) {
      tipAmount = parseInt(customTipAmount.replace(/[^0-9]/g, ''), 10) || 0;
    }

    if (tipAmount > 0) {
      const tipResult = await submitTip({
        towRequestId: towRequest.id,
        driverId: towRequest.driverId,
        amount: tipAmount,
        paymentMethod: 'same_as_service',
      });

      if (tipResult) {
        Alert.alert(
          'Thank You!',
          `Your rating and tip of Rp${tipAmount.toLocaleString('id-ID')} have been submitted successfully.`,
          [{ text: 'OK', onPress: handleComplete }]
        );
      } else {
        Alert.alert('Error', 'Failed to process tip. Please try again.');
      }
    } else {
      Alert.alert(
        'Thank You!',
        'Your rating has been submitted successfully.',
        [{ text: 'OK', onPress: handleComplete }]
      );
    }
  }, [towRequest, selectedTipAmount, customTipAmount, showCustomTip, submitTip, handleComplete]);

  const handleSkipTip = useCallback(() => {
    Alert.alert(
      'Thank You!',
      'Your rating has been submitted successfully.',
      [{ text: 'OK', onPress: handleComplete }]
    );
  }, [handleComplete]);

  const renderStars = (rating: number, onPress: (rating: number) => void, size: number = 24) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onPress(star)}
            style={styles.starButton}
          >
            <Star
              size={size}
              color={star <= rating ? colors.warning : colors.textLight}
              fill={star <= rating ? colors.warning : 'transparent'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderRatingStep = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>How was your experience?</Text>
        <Text style={styles.subtitle}>Rate your driver and service</Text>
      </View>

      <View style={styles.driverInfo}>
        <View style={styles.driverAvatar}>
          <Text style={styles.driverInitial}>
            {driver.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.driverDetails}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <Text style={styles.driverVehicle}>
            {driver.vehicleType} • {driver.licensePlate}
          </Text>
        </View>
      </View>

      <View style={styles.ratingSection}>
        <Text style={styles.sectionTitle}>Overall Rating</Text>
        {renderStars(overallRating, setOverallRating, 32)}
      </View>

      <View style={styles.categoryRatings}>
        <Text style={styles.sectionTitle}>Rate by Category</Text>
        
        <View style={styles.categoryItem}>
          <View style={styles.categoryHeader}>
            <Clock size={20} color={colors.primary} />
            <Text style={styles.categoryLabel}>Punctuality</Text>
          </View>
          {renderStars(categoryRatings.punctuality, (rating) => 
            setCategoryRatings(prev => ({ ...prev, punctuality: rating }))
          )}
        </View>

        <View style={styles.categoryItem}>
          <View style={styles.categoryHeader}>
            <MessageCircle size={20} color={colors.primary} />
            <Text style={styles.categoryLabel}>Communication</Text>
          </View>
          {renderStars(categoryRatings.communication, (rating) => 
            setCategoryRatings(prev => ({ ...prev, communication: rating }))
          )}
        </View>

        <View style={styles.categoryItem}>
          <View style={styles.categoryHeader}>
            <Heart size={20} color={colors.primary} />
            <Text style={styles.categoryLabel}>Professionalism</Text>
          </View>
          {renderStars(categoryRatings.professionalism, (rating) => 
            setCategoryRatings(prev => ({ ...prev, professionalism: rating }))
          )}
        </View>

        <View style={styles.categoryItem}>
          <View style={styles.categoryHeader}>
            <Car size={20} color={colors.primary} />
            <Text style={styles.categoryLabel}>Vehicle Condition</Text>
          </View>
          {renderStars(categoryRatings.vehicleCondition, (rating) => 
            setCategoryRatings(prev => ({ ...prev, vehicleCondition: rating }))
          )}
        </View>
      </View>

      <View style={styles.feedbackSection}>
        <Text style={styles.sectionTitle}>Additional Feedback (Optional)</Text>
        <TextInput
          style={styles.feedbackInput}
          placeholder="Share your experience with other customers..."
          placeholderTextColor={colors.textLight}
          value={feedback}
          onChangeText={setFeedback}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleRatingSubmit}
        disabled={loading}
      >
        <Text style={styles.submitButtonText}>
          {loading ? 'Submitting...' : 'Continue to Tip'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderTipStep = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Show Your Appreciation</Text>
        <Text style={styles.subtitle}>Add a tip for excellent service</Text>
      </View>

      <View style={styles.driverInfo}>
        <View style={styles.driverAvatar}>
          <Text style={styles.driverInitial}>
            {driver.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.driverDetails}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <View style={styles.ratingDisplay}>
            <Star size={16} color={colors.warning} fill={colors.warning} />
            <Text style={styles.ratingText}>{overallRating}.0</Text>
          </View>
        </View>
      </View>

      <View style={styles.tipSection}>
        <Text style={styles.sectionTitle}>Choose Tip Amount</Text>
        
        <View style={styles.tipOptions}>
          {tipOptions.filter(option => option.id !== 'tip_custom').map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.tipOption,
                selectedTipAmount === option.amount && styles.tipOptionSelected,
                option.isPopular && styles.tipOptionPopular,
              ]}
              onPress={() => {
                setSelectedTipAmount(option.amount);
                setShowCustomTip(false);
                setCustomTipAmount('');
              }}
            >
              {option.isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Popular</Text>
                </View>
              )}
              <Text style={[
                styles.tipOptionText,
                selectedTipAmount === option.amount && styles.tipOptionTextSelected,
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.customTipButton,
            showCustomTip && styles.customTipButtonSelected,
          ]}
          onPress={() => {
            setShowCustomTip(true);
            setSelectedTipAmount(0);
          }}
        >
          <Text style={[
            styles.customTipButtonText,
            showCustomTip && styles.customTipButtonTextSelected,
          ]}>
            Custom Amount
          </Text>
        </TouchableOpacity>

        {showCustomTip && (
          <View style={styles.customTipInput}>
            <Text style={styles.currencySymbol}>Rp</Text>
            <TextInput
              style={styles.customTipTextInput}
              placeholder="0"
              placeholderTextColor={colors.textLight}
              value={customTipAmount}
              onChangeText={(text) => {
                const numericValue = text.replace(/[^0-9]/g, '');
                const formattedValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                setCustomTipAmount(formattedValue);
              }}
              keyboardType="numeric"
            />
          </View>
        )}
      </View>

      <View style={styles.tipActions}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkipTip}
        >
          <Text style={styles.skipButtonText}>Skip Tip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tipSubmitButton,
            (selectedTipAmount > 0 || (showCustomTip && customTipAmount)) && styles.tipSubmitButtonActive,
            loading && styles.submitButtonDisabled,
          ]}
          onPress={handleTipSubmit}
          disabled={loading}
        >
          <Text style={[
            styles.tipSubmitButtonText,
            (selectedTipAmount > 0 || (showCustomTip && customTipAmount)) && styles.tipSubmitButtonTextActive,
          ]}>
            {loading ? 'Processing...' : 'Add Tip'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.modalHeader}>
          <View style={styles.stepIndicator}>
            <View style={[
              styles.stepDot,
              currentStep === 'rating' && styles.stepDotActive,
            ]} />
            <View style={styles.stepLine} />
            <View style={[
              styles.stepDot,
              currentStep === 'tip' && styles.stepDotActive,
            ]} />
          </View>
          
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <X size={24} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {currentStep === 'rating' ? renderRatingStep() : renderTipStep()}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.inactive,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.inactive,
    marginHorizontal: 8,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  driverInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  driverVehicle: {
    fontSize: 14,
    color: colors.textLight,
  },
  ratingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 4,
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starButton: {
    padding: 4,
    marginHorizontal: 2,
  },
  categoryRatings: {
    marginBottom: 24,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryLabel: {
    fontSize: 16,
    color: colors.textLight,
    marginLeft: 8,
  },
  feedbackSection: {
    marginBottom: 32,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  tipSection: {
    marginBottom: 32,
  },
  tipOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 12,
  },
  tipOption: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minWidth: (width - 64) / 2,
    alignItems: 'center',
    position: 'relative',
  },
  tipOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  tipOptionPopular: {
    borderColor: colors.success,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  popularText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  tipOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textLight,
  },
  tipOptionTextSelected: {
    color: colors.primary,
  },
  customTipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    marginBottom: 16,
  },
  customTipButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  customTipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textLight,
  },
  customTipButtonTextSelected: {
    color: colors.primary,
  },
  customTipInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textLight,
    marginRight: 8,
  },
  customTipTextInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  tipActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textLight,
  },
  tipSubmitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: colors.disabled,
    alignItems: 'center',
  },
  tipSubmitButtonActive: {
    backgroundColor: colors.primary,
  },
  tipSubmitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.inactive,
  },
  tipSubmitButtonTextActive: {
    color: colors.white,
  },
});

export default RatingTipScreen;