import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, Circle, ArrowRight, Car, Truck, AlertTriangle, Wrench } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useTheme } from '@/hooks/useThemeStore';
import { towingTypes } from '@/constants/mockData';
import { TowingType } from '@/types';

interface Question {
  id: string;
  question: string;
  options: {
    id: string;
    text: string;
    icon?: React.ReactNode;
    weight: { [key: string]: number };
  }[];
}

const questions: Question[] = [
  {
    id: 'vehicle_type',
    question: 'Jenis kendaraan apa yang perlu diderek?',
    options: [
      {
        id: 'luxury_car',
        text: 'Mobil mewah/sport',
        icon: <Car size={24} color="#FF9500" />,
        weight: { '1': 10, '2': 8, '3': 2, '4': 1, '5': 3, '6': 1, '7': 1, '8': 0, '9': 5, '10': 6 }
      },
      {
        id: 'regular_car',
        text: 'Mobil biasa/sedan/hatchback',
        icon: <Car size={24} color="#007AFF" />,
        weight: { '1': 6, '2': 8, '3': 5, '4': 8, '5': 6, '6': 8, '7': 3, '8': 0, '9': 7, '10': 5 }
      },
      {
        id: 'suv_mpv',
        text: 'SUV/MPV',
        icon: <Truck size={24} color="#34C759" />,
        weight: { '1': 7, '2': 9, '3': 6, '4': 6, '5': 5, '6': 6, '7': 4, '8': 0, '9': 6, '10': 7 }
      },
      {
        id: 'motorcycle',
        text: 'Motor besar (Moge)',
        icon: <Car size={24} color="#FF3B30" />,
        weight: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 10, '9': 0, '10': 0 }
      }
    ]
  },
  {
    id: 'location_type',
    question: 'Di mana lokasi kendaraan yang mogok?',
    options: [
      {
        id: 'main_road',
        text: 'Jalan raya utama',
        icon: <ArrowRight size={24} color="#007AFF" />,
        weight: { '1': 6, '2': 8, '3': 7, '4': 8, '5': 6, '6': 8, '7': 5, '8': 6, '9': 3, '10': 6 }
      },
      {
        id: 'narrow_street',
        text: 'Jalan sempit/gang',
        icon: <ArrowRight size={24} color="#FF9500" />,
        weight: { '1': 4, '2': 6, '3': 5, '4': 9, '5': 7, '6': 7, '7': 2, '8': 5, '9': 8, '10': 9 }
      },
      {
        id: 'basement',
        text: 'Basement/parkir bawah tanah',
        icon: <ArrowRight size={24} color="#8E44AD" />,
        weight: { '1': 2, '2': 3, '3': 2, '4': 6, '5': 4, '6': 4, '7': 1, '8': 3, '9': 10, '10': 5 }
      },
      {
        id: 'difficult_terrain',
        text: 'Medan sulit (parit/tanjakan)',
        icon: <AlertTriangle size={24} color="#FF3B30" />,
        weight: { '1': 3, '2': 4, '3': 10, '4': 2, '5': 5, '6': 3, '7': 2, '8': 2, '9': 4, '10': 6 }
      }
    ]
  },
  {
    id: 'problem_type',
    question: 'Apa masalah yang terjadi pada kendaraan?',
    options: [
      {
        id: 'wont_start',
        text: 'Mesin tidak mau hidup',
        icon: <Wrench size={24} color="#FF3B30" />,
        weight: { '1': 6, '2': 7, '3': 5, '4': 9, '5': 6, '6': 7, '7': 4, '8': 6, '9': 6, '10': 6 }
      },
      {
        id: 'flat_tire',
        text: 'Ban kempes/rusak',
        icon: <Circle size={24} color="#34C759" />,
        weight: { '1': 5, '2': 6, '3': 4, '4': 10, '5': 8, '6': 6, '7': 3, '8': 5, '9': 5, '10': 5 }
      },
      {
        id: 'accident',
        text: 'Kecelakaan/tabrakan',
        icon: <AlertTriangle size={24} color="#FF3B30" />,
        weight: { '1': 8, '2': 9, '3': 10, '4': 2, '5': 7, '6': 4, '7': 6, '8': 4, '9': 5, '10': 7 }
      },
      {
        id: 'transmission',
        text: 'Masalah transmisi/kopling',
        icon: <Wrench size={24} color="#FF9500" />,
        weight: { '1': 7, '2': 8, '3': 6, '4': 3, '5': 9, '6': 3, '7': 5, '8': 6, '9': 6, '10': 8 }
      }
    ]
  },
  {
    id: 'urgency',
    question: 'Seberapa mendesak situasi Anda?',
    options: [
      {
        id: 'very_urgent',
        text: 'Sangat mendesak (darurat)',
        icon: <AlertTriangle size={24} color="#FF3B30" />,
        weight: { '1': 5, '2': 6, '3': 9, '4': 8, '5': 6, '6': 7, '7': 4, '8': 5, '9': 7, '10': 8 }
      },
      {
        id: 'moderate',
        text: 'Cukup mendesak',
        icon: <Circle size={24} color="#FF9500" />,
        weight: { '1': 7, '2': 8, '3': 6, '4': 7, '5': 7, '6': 8, '7': 6, '8': 7, '9': 6, '10': 7 }
      },
      {
        id: 'not_urgent',
        text: 'Tidak terlalu mendesak',
        icon: <CheckCircle size={24} color="#34C759" />,
        weight: { '1': 9, '2': 9, '3': 4, '4': 6, '5': 6, '6': 6, '7': 8, '8': 6, '9': 5, '10': 6 }
      }
    ]
  },
  {
    id: 'budget',
    question: 'Berapa budget yang Anda siapkan?',
    options: [
      {
        id: 'budget_low',
        text: 'Di bawah Rp 600.000',
        weight: { '1': 2, '2': 8, '3': 1, '4': 10, '5': 1, '6': 9, '7': 1, '8': 9, '9': 3, '10': 1 }
      },
      {
        id: 'budget_medium',
        text: 'Rp 600.000 - Rp 1.500.000',
        weight: { '1': 7, '2': 9, '3': 6, '4': 8, '5': 3, '6': 8, '7': 2, '8': 8, '9': 8, '10': 4 }
      },
      {
        id: 'budget_high',
        text: 'Di atas Rp 1.500.000',
        weight: { '1': 9, '2': 6, '3': 8, '4': 3, '5': 8, '6': 4, '7': 9, '8': 4, '9': 6, '10': 9 }
      },
      {
        id: 'budget_flexible',
        text: 'Fleksibel (yang penting sesuai kebutuhan)',
        weight: { '1': 8, '2': 8, '3': 8, '4': 7, '5': 7, '6': 7, '7': 7, '8': 7, '9': 7, '10': 8 }
      }
    ]
  }
];

export default function TowingRecommendationScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [showResult, setShowResult] = useState(false);
  const [recommendedTowing, setRecommendedTowing] = useState<TowingType[]>([]);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const canProceed = answers[currentQuestion?.id];

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answerId }));
  };

  const calculateRecommendation = () => {
    const scores: { [key: string]: number } = {};
    
    // Initialize scores
    towingTypes.forEach(type => {
      scores[type.id] = 0;
    });

    // Calculate scores based on answers
    questions.forEach(question => {
      const answerId = answers[question.id];
      if (answerId) {
        const selectedOption = question.options.find(opt => opt.id === answerId);
        if (selectedOption) {
          Object.entries(selectedOption.weight).forEach(([towingId, weight]) => {
            scores[towingId] = (scores[towingId] || 0) + weight;
          });
        }
      }
    });

    // Sort by score and get top 3
    const sortedTowing = towingTypes
      .map(type => ({ ...type, score: scores[type.id] || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    setRecommendedTowing(sortedTowing);
    setShowResult(true);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      calculateRecommendation();
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResult(false);
    setRecommendedTowing([]);
  };

  const handleSelectTowing = (towingId: string) => {
    // Map towing type ID to service ID
    const serviceMap: { [key: string]: string } = {
      '1': 'hydraulic',
      '2': 'ladder',
      '3': 'accident',
      '4': 'service',
      '5': 'roller_tire',
      '6': 'free_wheel',
      '7': 'double_deck',
      '8': 'moge_transport',
      '9': 'basement_towing',
      '10': 'selfloader'
    };
    
    const serviceId = serviceMap[towingId];
    if (serviceId) {
      router.push({
        pathname: '/request-tow',
        params: { serviceType: serviceId }
      });
    }
  };

  if (showResult) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={theme.textDark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.textDark }]}>Rekomendasi Derek</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.resultHeader}>
            <LinearGradient
              colors={[theme.gradientStart, theme.gradientEnd]}
              style={styles.resultHeaderGradient}
            >
              <CheckCircle size={48} color="white" />
              <Text style={styles.resultTitle}>Rekomendasi Terbaik Untuk Anda</Text>
              <Text style={styles.resultSubtitle}>
                Berdasarkan jawaban Anda, berikut adalah jenis derek yang paling sesuai:
              </Text>
            </LinearGradient>
          </View>

          {recommendedTowing.map((towing, index) => (
            <Card key={towing.id} style={[styles.recommendationCard, index === 0 && styles.topRecommendation]}>
              {index === 0 && (
                <View style={[styles.bestBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.bestBadgeText}>TERBAIK</Text>
                </View>
              )}
              <View style={styles.recommendationContent}>
                <View style={styles.recommendationHeader}>
                  <View style={[styles.towingIconContainer, towing.id === '9' && styles.basementIconContainer]}>
                    <Image 
                      source={{ uri: towing.icon }} 
                      style={[styles.towingIcon, towing.id === '9' && styles.basementIcon]}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.towingInfo}>
                    <Text style={[styles.towingName, { color: theme.textDark }]}>{towing.name}</Text>
                    <Text style={[styles.towingPrice, { color: theme.primary }]}>{towing.price}</Text>
                  </View>
                  <View style={[styles.rankBadge, { backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32' }]}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                </View>
                <Text style={[styles.towingDescription, { color: theme.textLight }]}>
                  {towing.detailedDescription}
                </Text>
                <Button
                  title="Pilih Derek Ini"
                  onPress={() => handleSelectTowing(towing.id)}
                  variant={index === 0 ? 'primary' : 'outline'}
                  style={styles.selectButton}
                />
              </View>
            </Card>
          ))}

          <View style={styles.actionButtons}>
            <Button
              title="Coba Lagi"
              onPress={handleRestart}
              variant="outline"
              style={styles.actionButton}
            />
            <Button
              title="Lihat Semua Derek"
              onPress={() => router.back()}
              variant="text"
              style={styles.actionButton}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textDark }]}>Cari Derek Yang Tepat</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                backgroundColor: theme.primary,
                width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`
              }
            ]} 
          />
        </View>
        <Text style={[styles.progressText, { color: theme.textLight }]}>
          {currentQuestionIndex + 1} dari {questions.length}
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.questionCard}>
          <Text style={[styles.questionTitle, { color: theme.textDark }]}>
            {currentQuestion?.question}
          </Text>
          
          <View style={styles.optionsContainer}>
            {currentQuestion?.options.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.optionButton,
                  {
                    borderColor: answers[currentQuestion.id] === option.id ? theme.primary : theme.border,
                    backgroundColor: answers[currentQuestion.id] === option.id ? theme.primary + '10' : 'transparent'
                  }
                ]}
                onPress={() => handleAnswerSelect(currentQuestion.id, option.id)}
                activeOpacity={0.7}
              >
                <View style={styles.optionContent}>
                  {option.icon && (
                    <View style={styles.optionIcon}>
                      {option.icon}
                    </View>
                  )}
                  <Text style={[
                    styles.optionText,
                    {
                      color: answers[currentQuestion.id] === option.id ? theme.primary : theme.textDark
                    }
                  ]}>
                    {option.text}
                  </Text>
                  <View style={[
                    styles.radioButton,
                    {
                      borderColor: answers[currentQuestion.id] === option.id ? theme.primary : theme.border
                    }
                  ]}>
                    {answers[currentQuestion.id] === option.id && (
                      <View style={[styles.radioButtonInner, { backgroundColor: theme.primary }]} />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </ScrollView>

      <View style={styles.navigationButtons}>
        {currentQuestionIndex > 0 && (
          <Button
            title="Sebelumnya"
            onPress={handlePrevious}
            variant="outline"
            style={styles.navButton}
          />
        )}
        <Button
          title={isLastQuestion ? "Lihat Rekomendasi" : "Selanjutnya"}
          onPress={handleNext}
          variant="primary"
          style={[styles.navButton, !canProceed && styles.disabledButton]}
          disabled={!canProceed}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  questionCard: {
    padding: 20,
    marginBottom: 16,
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    lineHeight: 28,
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  navigationButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  navButton: {
    flex: 1,
  },
  disabledButton: {
    opacity: 0.5,
  },
  resultHeader: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  resultHeaderGradient: {
    padding: 24,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  resultSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
    lineHeight: 22,
  },
  recommendationCard: {
    marginBottom: 16,
    position: 'relative',
  },
  topRecommendation: {
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  bestBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  bestBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  recommendationContent: {
    padding: 20,
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  towingIconContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  basementIconContainer: {
    backgroundColor: '#FFF3E0',
  },
  towingIcon: {
    width: 48,
    height: 48,
  },
  basementIcon: {
    width: 56,
    height: 56,
  },
  towingInfo: {
    flex: 1,
  },
  towingName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  towingPrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  towingDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  selectButton: {
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
  },
});