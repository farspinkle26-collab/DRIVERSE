import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Modal, Image } from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { MapPin, Car, Truck, Wrench, AlertTriangle, CheckSquare, Square, X, Navigation, Wallet, CreditCard, Info } from "lucide-react-native";
import Button from "@/components/Button";
import InteractiveMapView from "@/components/InteractiveMapView";
import Card from "@/components/Card";
import Input from "@/components/Input";
import VehicleProblemSelector from "@/components/VehicleProblemSelector";
import { useTheme } from "@/hooks/useThemeStore";
import MultiImagePicker from "@/components/MultiImagePicker";
import { useTowing } from "@/hooks/useTowingStore";
import { useRealtime } from "@/hooks/useRealtimeStore";
import { VehicleInfo, BreakdownInfo } from "@/types";

import { SERVICE_TYPES, towingTypes } from "@/constants/mockData";
import { useAuth } from "@/hooks/useAuthStore";
import { useTransactions } from "@/hooks/useTransactionStore";
import TowingTypeDetailModal from "@/components/TowingTypeDetailModal";

export default function RequestTowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { user, isDriver } = useAuth();
  const { createPaymentTransaction, createVirtualAccount, formatCurrency: formatTransactionCurrency } = useTransactions();
  const { sendRequestToNearestDriver } = useRealtime();
  const { 
    setLocations, 
    pickupLocation, 
    dropoffLocation,
    vehicleInfo,
    breakdownInfo,
    setVehicleInfo,
    setBreakdownInfo,
    estimatedDistance, 
    estimatedPrice, 
    availableDrivers,
    selectedDriver,
    setSelectedDriver,
    selectedServiceType,
    setSelectedServiceType,
    createTowRequest,
    calculatePrice,
    priceAdjustment,
    setPriceAdjustment,
    loading
  } = useTowing();
  
  const [step, setStep] = useState<number>(1); // 1: Towing Type, 2: Location, 3: Car Details, 4: Checklist
  const [vehicleForm, setVehicleForm] = useState<VehicleInfo>({
    make: "",
    model: "",
    color: "",
    licensePlate: "",
    photos: [],
  });
  const [breakdownForm, setBreakdownForm] = useState<BreakdownInfo>({
    type: "engine_wont_start",
    notes: "",
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'virtual_account' | 'cash'>('virtual_account');
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [selectedTowingType, setSelectedTowingType] = useState<any>(null);

  // Redirect drivers away from this page
  useEffect(() => {
    if (user && isDriver) {
      Alert.alert(
        "Akses Ditolak",
        "Halaman ini hanya untuk pelanggan. Driver tidak dapat membuat permintaan towing.",
        [{ text: "OK", onPress: () => router.replace('/(tabs)/orders' as any) }]
      );
    }
  }, [user, isDriver, router]);

  // Set service type from params if provided
  useEffect(() => {
    if (params.serviceType && typeof params.serviceType === 'string') {
      console.log('🔧 Setting service type from params:', params.serviceType);
      setSelectedServiceType(params.serviceType);
    }
  }, [params.serviceType, setSelectedServiceType]);

  // Handle step advancement based on completed sections
  useEffect(() => {
    // If step is provided in params, use it directly
    if (params.step && typeof params.step === 'string') {
      const stepNumber = parseInt(params.step, 10);
      if (stepNumber >= 1 && stepNumber <= 4) {
        console.log('🚗 Setting step from params:', stepNumber);
        setStep(stepNumber);
        return;
      }
    }
    
    // If coming back from location selection with both locations set, advance to step 3 (car details)
    if (params.fromLocationSelection === 'true' && pickupLocation && dropoffLocation && selectedServiceType) {
      console.log('🚗 Returning from location selection, advancing to car details');
      setStep(3);
    }
  }, [params.step, params.fromLocationSelection, pickupLocation, dropoffLocation, selectedServiceType]);

  // Don't render if user is driver
  if (isDriver) {
    return null;
  }
  
  // Check if user is insurance member
  const isInsuranceMember = params.isInsuranceMember === 'true';
  const insuranceProvider = typeof params.insuranceProvider === 'string' ? params.insuranceProvider : '';

  const breakdownOptions = [
    { label: "Mesin Tidak Mau Hidup", value: "engine_wont_start" },
    { label: "Kecelakaan", value: "accident" },
    { label: "Ban Kempes", value: "flat_tire" },
    { label: "Kendaraan Terjebak", value: "stuck" },
    { label: "Aki Soak", value: "battery_dead" },
    { label: "Overheat", value: "overheating" },
    { label: "Lainnya", value: "other" },
  ];

  const serviceTypeOptions = [
    {
      id: 'hydraulic',
      title: 'Hidraulik',
      description: 'Mulai Rp800.000 (10 km pertama), +Rp20.000/km setelah 10 km',
      iconUrl: towingTypes[0].icon,
      color: '#FF3B30'
    },
    {
      id: 'ladder',
      title: 'Tangga',
      description: 'Dalam kota (1-10km): Flat Rp595.000, +Rp15.000/km (maks 160km). Luar kota (>160km): Rp7.000/km tanpa tarif flat',
      iconUrl: towingTypes[1].icon,
      color: '#007AFF'
    },
    {
      id: 'accident',
      title: 'Katrol',
      description: 'Mulai Rp1.200.000 (10 km pertama), +Rp50.000/km setelah 10 km',
      iconUrl: towingTypes[2].icon,
      color: '#FF9500'
    },
    {
      id: 'service',
      title: 'Service Car',
      description: 'Rp350.000 (maks. 8 km), termasuk: Jumper aki, Lock switch, Bensin, Ban',
      iconUrl: towingTypes[3].icon,
      color: '#34C759'
    },
    {
      id: 'roller_tire',
      title: 'Derek Sepatu Roda',
      description: 'Mulai Rp2.000.000 (10 km pertama), +Rp30.000/km setelah 10 km',
      iconUrl: towingTypes[4].icon,
      color: '#8E44AD'
    },
    {
      id: 'free_wheel',
      title: 'Free Wheel',
      description: 'Rp600.000 maksimal per kasus (khusus DKI Jakarta)',
      iconUrl: towingTypes[5].icon,
      color: '#E67E22'
    },
    {
      id: 'selfloader',
      title: 'Selfloader',
      description: 'Mulai Rp2.500.000 (10 km pertama), +Rp50.000/km setelah 10 km',
      iconUrl: towingTypes[9].icon,
      color: '#D35400'
    },
    {
      id: 'dolly',
      title: 'Dolly',
      description: 'Mulai Rp5.000.000 (10 km pertama), +Rp100.000/km setelah 10 km',
      iconUrl: towingTypes[4].icon,
      color: '#C0392B'
    },
    {
      id: 'double_deck',
      title: 'Double Deck',
      description: 'Jakarta-Surabaya: Rp4.000.000 | Jakarta-Medan: Rp8.000.000 | Jakarta-Aceh: Rp15.000.000 | Event Khusus: Mulai Rp14.000.000 PP',
      iconUrl: towingTypes[6].icon,
      color: '#2980B9'
    },
    {
      id: 'moge_transport',
      title: 'Moge',
      description: 'Mulai Rp500.000 (10 km pertama), +Rp8.000/km setelah 10 km',
      iconUrl: towingTypes[7].icon,
      color: '#27AE60'
    },
    {
      id: 'basement_towing',
      title: 'Derek Basement',
      description: 'Rp1.000.000 per kasus',
      iconUrl: towingTypes[8].icon,
      color: '#7F8C8D'
    }
  ];

  const validateStep = (currentStep: number): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (currentStep === 1) {
      if (!selectedServiceType) newErrors.serviceType = "Silakan pilih jenis layanan";
    } else if (currentStep === 2) {
      if (!pickupLocation) newErrors.pickup = "Silakan pilih lokasi penjemputan";
      if (!dropoffLocation) newErrors.dropoff = "Silakan pilih lokasi tujuan";
    } else if (currentStep === 3) {
      if (!vehicleForm.make.trim()) newErrors.make = "Merek kendaraan wajib diisi";
      if (!vehicleForm.model.trim()) newErrors.model = "Model kendaraan wajib diisi";
      if (!vehicleForm.color.trim()) newErrors.color = "Warna kendaraan wajib diisi";
      if (!vehicleForm.licensePlate.trim()) newErrors.licensePlate = "Nomor plat wajib diisi";
      if (vehicleForm.photos.length === 0) newErrors.photos = "Minimal 1 foto kendaraan diperlukan";
      if (!breakdownForm.type) newErrors.breakdownType = "Silakan pilih jenis kerusakan";
    } else if (currentStep === 4) {
      if (!termsAccepted) newErrors.terms = "Anda harus menyetujui ketentuan perjalanan";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(step)) {
      return;
    }
    
    if (step === 1) {
      // Move to location step
      setStep(2);
    } else if (step === 2) {
      // Navigate to map selection page with selected service type
      router.push({
        pathname: "/map-selection",
        params: { 
          serviceType: selectedServiceType,
          returnTo: 'request-tow'
        }
      });
    } else if (step === 3) {
      // Save vehicle and breakdown info and move to checklist
      setVehicleInfo(vehicleForm);
      setBreakdownInfo(breakdownForm);
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleConfirm = async () => {
    if (!validateStep(4)) {
      return;
    }
    

    
    const request = await createTowRequest();
    if (request && user && pickupLocation && dropoffLocation && vehicleInfo && breakdownInfo) {
      try {
        if (paymentMethod === 'virtual_account') {
          // Create payment transaction
          const transaction = await createPaymentTransaction({
            towRequestId: request.id,
            companyId: 'company_1', // This should come from the selected driver/company
            driverId: selectedDriver?.id,
            amount: estimatedPrice,
            paymentMethod: 'bank_transfer'
          });

          if (!transaction) {
            Alert.alert(
              'Gagal Membuat Transaksi',
              'Terjadi kesalahan saat membuat transaksi pembayaran.',
              [{ text: 'OK' }]
            );
            return;
          }

          // Create Xendit Virtual Account
          const vaResult = await createVirtualAccount(transaction);
          
          if (!vaResult.success) {
            Alert.alert(
              'Gagal Membuat Virtual Account',
              vaResult.error || 'Terjadi kesalahan saat membuat virtual account.',
              [{ text: 'OK' }]
            );
            return;
          }

          // Show payment instructions with Virtual Account details
          Alert.alert(
            'Pembayaran Virtual Account Berhasil Dibuat',
            `Permintaan derek Anda telah dibuat!\n\nDetail Pembayaran:\nNomor VA: ${vaResult.virtualAccountNumber || 'Lihat di halaman transaksi'}\nJumlah: ${formatPrice(estimatedPrice)}\n\nSilakan lakukan pembayaran melalui Virtual Account. Pembayaran akan otomatis terverifikasi setelah transfer berhasil.\n\nAnda dapat melihat detail pembayaran di halaman Transaksi.`,
            [
              {
                text: 'Lihat Detail Transaksi',
                onPress: () => {
                  router.replace('/(tabs)/transactions');
                }
              },
              {
                text: 'OK',
                style: 'cancel',
                onPress: () => {
                  router.replace({
                    pathname: "/request-details",
                    params: { id: request.id, transactionId: transaction.id }
                  });
                }
              }
            ]
          );
        } else {
          // Cash payment - just send the request
          const success = await sendRequestToNearestDriver(request);
          
          if (success) {
            Alert.alert(
              'Permintaan Terkirim',
              'Permintaan Anda telah dikirim ke driver terdekat. Anda akan mendapat notifikasi ketika driver menerima permintaan.',
              [
                { 
                  text: 'OK', 
                  onPress: () => {
                    router.replace({
                      pathname: "/request-details",
                      params: { id: request.id }
                    });
                  }
                }
              ]
            );
          } else {
            Alert.alert(
              'Gagal Mengirim Permintaan',
              'Terjadi kesalahan saat mengirim permintaan. Silakan coba lagi.',
              [{ text: 'OK' }]
            );
          }
        }
      } catch (error) {
        console.error('Error processing request:', error);
        Alert.alert(
          'Gagal Memproses Permintaan',
          'Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const findNearestDriver = async () => {
    if (!pickupLocation) return;
    
    // Simulate finding nearest driver
    setTimeout(() => {
      // In a real app, this would use GPS to find the nearest available driver
      // and ping them one by one until one accepts
      const nearestDriver = availableDrivers[0]; // Mock: first available driver
      if (nearestDriver) {
        setSelectedDriver(nearestDriver);
      }
    }, 2000); // Simulate 2 second search
  };

  const renderPriceBreakdown = () => {
    const serviceConfig = SERVICE_TYPES[selectedServiceType as keyof typeof SERVICE_TYPES];
    if (!serviceConfig) return null;
    
    const roundedDistance = Math.ceil(estimatedDistance);
    
    if (serviceConfig.isFixed) {
      return (
        <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
          Tarif tetap untuk {serviceConfig.name}
        </Text>
      );
    }
    
    // Special handling for ladder towing with long distance rates
    if (selectedServiceType === 'ladder') {
      const ladderService = serviceConfig as typeof SERVICE_TYPES.ladder;
      
      if (roundedDistance > (ladderService.longDistanceThreshold || 160)) {
        return (
          <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
            Luar kota ({roundedDistance} km × Rp{ladderService.longDistanceRate?.toLocaleString('id-ID') || '7.000'}): {formatPrice(roundedDistance * (ladderService.longDistanceRate || 7000))}
          </Text>
        );
      }
      
      return (
        <>
          <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
            Tarif dasar ({ladderService.baseDistance}km pertama): {formatPrice(ladderService.baseFare)}
          </Text>
          {roundedDistance > ladderService.baseDistance && (
            <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
              Tambahan ({roundedDistance - ladderService.baseDistance} km): {formatPrice((roundedDistance - ladderService.baseDistance) * ladderService.pricePerKm)}
            </Text>
          )}
        </>
      );
    }
    
    return (
      <>
        <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
          Tarif dasar ({serviceConfig.baseDistance}km pertama): {formatPrice(serviceConfig.baseFare)}
        </Text>
        {roundedDistance > serviceConfig.baseDistance && (
          <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>
            Tambahan ({roundedDistance - serviceConfig.baseDistance} km): {formatPrice((roundedDistance - serviceConfig.baseDistance) * serviceConfig.pricePerKm)}
          </Text>
        )}
      </>
    );
  };

  // Step 1: Towing Type Selection
  const renderStepOne = () => (
    <>
      <Text style={[styles.subtitle, { color: theme.textLight }]}>Pilih jenis layanan derek yang Anda butuhkan</Text>
      
      {/* Service Type Selection */}
      <Card style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.formSectionTitle, { color: theme.textDark }]}>Pilih Jenis Layanan</Text>
        {serviceTypeOptions.map((service) => {
          const isSelected = selectedServiceType === service.id;
          const serviceConfig = SERVICE_TYPES[service.id as keyof typeof SERVICE_TYPES];
          
          return (
            <TouchableOpacity
              key={service.id}
              style={[
                styles.serviceTypeCard,
                {
                  backgroundColor: isSelected ? theme.primary + '10' : theme.background,
                  borderColor: isSelected ? theme.primary : theme.border,
                }
              ]}
              onPress={() => setSelectedServiceType(service.id)}
            >
              <View style={styles.serviceTypeHeader}>
                <View style={[styles.serviceTypeIcon, { backgroundColor: service.color + '20' }]}>
                  {service.iconUrl ? (
                    <Image 
                      source={{ uri: service.iconUrl }} 
                      style={styles.serviceTypeImage}
                      resizeMode="contain"
                      defaultSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' }}
                    />
                  ) : (
                    <Truck size={24} color={service.color} />
                  )}
                </View>
                <View style={styles.serviceTypeInfo}>
                  <Text style={[styles.serviceTypeTitle, { color: theme.textDark }]}>{service.title}</Text>
                  <Text style={[styles.serviceTypePrice, { color: service.color }]}>
                    {service.id === 'service' ? formatPrice(serviceConfig.baseFare) : `Mulai ${formatPrice(serviceConfig.baseFare)}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.infoButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={() => {
                    const towingType = towingTypes.find(t => {
                      if (service.id === 'hydraulic') return t.id === '1';
                      if (service.id === 'ladder') return t.id === '2';
                      if (service.id === 'accident') return t.id === '3';
                      if (service.id === 'service') return t.id === '4';
                      if (service.id === 'roller_tire') return t.id === '5';
                      if (service.id === 'free_wheel') return t.id === '6';
                      if (service.id === 'double_deck') return t.id === '7';
                      if (service.id === 'moge_transport') return t.id === '8';
                      if (service.id === 'basement_towing') return t.id === '9';
                      if (service.id === 'selfloader') return t.id === '10';
                      if (service.id === 'dolly') return t.id === '5'; // Same as roller_tire
                      return false;
                    });
                    if (towingType) {
                      setSelectedTowingType(towingType);
                      setShowDetailModal(true);
                    }
                  }}
                >
                  <Info size={16} color={theme.primary} />
                </TouchableOpacity>
                <View style={[
                  styles.radioButton,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? theme.primary : 'transparent'
                  }
                ]}>
                  {isSelected && <View style={styles.radioButtonInner} />}
                </View>
              </View>
              <Text style={[styles.serviceTypeDescription, { color: theme.textLight }]}>
                {service.description}
                {service.id === 'free_wheel' && ' (*Syarat & ketentuan berlaku)'}
                {service.id === 'double_deck' && ' (*Syarat & ketentuan berlaku)'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Card>
      {errors.serviceType && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.serviceType}</Text>}
      

    </>
  );

  // Step 2: Location Selection
  const renderStepTwo = () => (
    <>
      <Text style={[styles.subtitle, { color: theme.textLight }]}>Pilih lokasi penjemputan dan tujuan</Text>
      
      <Card style={[styles.locationCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.formSectionTitle, { color: theme.textDark }]}>Lokasi Perjalanan</Text>
        
        {/* Pickup Location */}
        <View style={styles.locationItem}>
          <View style={[styles.locationIcon, { backgroundColor: theme.success + '20' }]}>
            <MapPin size={20} color={theme.success} />
          </View>
          <View style={styles.locationInfo}>
            <Text style={[styles.locationLabel, { color: theme.textLight }]}>Penjemputan</Text>
            <Text style={[styles.locationAddress, { color: pickupLocation ? theme.textDark : theme.textLight }]} numberOfLines={2}>
              {pickupLocation ? pickupLocation.address : "Belum dipilih"}
            </Text>
          </View>
        </View>
        
        <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
        
        {/* Dropoff Location */}
        <View style={styles.locationItem}>
          <View style={[styles.locationIcon, { backgroundColor: theme.primary + '20' }]}>
            <Navigation size={20} color={theme.primary} />
          </View>
          <View style={styles.locationInfo}>
            <Text style={[styles.locationLabel, { color: theme.textLight }]}>Tujuan</Text>
            <Text style={[styles.locationAddress, { color: dropoffLocation ? theme.textDark : theme.textLight }]} numberOfLines={2}>
              {dropoffLocation ? dropoffLocation.address : "Belum dipilih"}
            </Text>
          </View>
        </View>
        
        <Button
          title="Pilih Lokasi di Peta"
          onPress={() => {
            router.push({
              pathname: "/map-selection",
              params: { 
                serviceType: selectedServiceType,
                returnTo: 'request-tow'
              }
            });
          }}
          variant="outline"
          size="medium"
          style={styles.mapButton}
        />
      </Card>
      
      {/* Price Preview */}
      {pickupLocation && dropoffLocation && estimatedDistance > 0 && (
        <Card style={[styles.pricePreviewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.pricePreviewContainer}>
            <Text style={[styles.pricePreviewLabel, { color: theme.textLight }]}>Estimasi Harga</Text>
            <Text style={[styles.pricePreviewValue, { color: theme.primary }]}>
              {formatPrice(estimatedPrice)}
            </Text>
          </View>
          <View style={styles.pricePreviewDetails}>
            <Text style={[styles.pricePreviewText, { color: theme.textLight }]}>Jarak: {Math.ceil(estimatedDistance)} km</Text>
            {renderPriceBreakdown()}
          </View>
        </Card>
      )}
      
      {errors.pickup && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.pickup}</Text>}
      {errors.dropoff && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.dropoff}</Text>}
    </>
  );

  // Step 3: Car Details
  const renderStepThree = () => (
    <>
      <Text style={[styles.subtitle, { color: theme.textLight }]}>Informasi kendaraan dan detail kerusakan</Text>
      
      <Card style={[styles.formCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.formSectionTitle, { color: theme.textDark }]}>Informasi Kendaraan</Text>
        
        <Input
          label="Merek Kendaraan"
          placeholder="contoh: Toyota, Honda, Suzuki"
          value={vehicleForm.make}
          onChangeText={(text) => setVehicleForm({...vehicleForm, make: text})}
          error={errors.make}
        />
        
        <Input
          label="Model Kendaraan"
          placeholder="contoh: Avanza, Jazz, Ertiga"
          value={vehicleForm.model}
          onChangeText={(text) => setVehicleForm({...vehicleForm, model: text})}
          error={errors.model}
        />
        
        <Input
          label="Warna Kendaraan"
          placeholder="contoh: Putih, Hitam, Silver"
          value={vehicleForm.color}
          onChangeText={(text) => setVehicleForm({...vehicleForm, color: text})}
          error={errors.color}
        />
        
        <Input
          label="Nomor Plat"
          placeholder="contoh: B 1234 ABC"
          value={vehicleForm.licensePlate}
          onChangeText={(text) => setVehicleForm({...vehicleForm, licensePlate: text.toUpperCase()})}
          error={errors.licensePlate}
        />
        
        <MultiImagePicker
          label="Foto Kendaraan"
          placeholder="Ambil foto kendaraan Anda"
          value={vehicleForm.photos}
          onChange={(photos) => {
            console.log('Photos updated:', photos);
            setVehicleForm({...vehicleForm, photos});
          }}
          error={errors.photos}
          minImages={1}
          maxImages={3}
        />
      </Card>
      
      <Card style={[styles.formCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.formSectionTitle, { color: theme.textDark }]}>Informasi Kerusakan</Text>
        
        <VehicleProblemSelector
          value={breakdownForm}
          onChange={setBreakdownForm}
          error={errors.breakdownType}
        />
      </Card>
    </>
  );

  // Step 4: Checklist and Confirmation
  const renderStepFour = () => (
    <>
      <Text style={[styles.subtitle, { color: theme.textLight }]}>Konfirmasi permintaan Anda</Text>
      
      <InteractiveMapView
        pickup={pickupLocation}
        dropoff={dropoffLocation}
        style={styles.map}
        interactive={false}
      />
      
      <Card style={[styles.summaryCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.summaryTitle, { color: theme.textDark }]}>Ringkasan Permintaan</Text>
        
        <View style={styles.summarySection}>
          <Text style={[styles.summarySectionTitle, { color: theme.textDark }]}>Lokasi</Text>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Penjemputan</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]} numberOfLines={1}>{pickupLocation?.address}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Tujuan</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]} numberOfLines={1}>{dropoffLocation?.address}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Jarak</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]}>{Math.ceil(estimatedDistance)} km</Text>
          </View>
        </View>
        
        <View style={styles.summarySection}>
          <Text style={[styles.summarySectionTitle, { color: theme.textDark }]}>Kendaraan</Text>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Kendaraan</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]}>{vehicleForm.make} {vehicleForm.model} ({vehicleForm.color})</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Nomor Plat</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]}>{vehicleForm.licensePlate}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Masalah</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]}>
              {breakdownOptions.find(opt => opt.value === breakdownForm.type)?.label}
              {breakdownForm.notes && ` - ${breakdownForm.notes}`}
            </Text>
          </View>
        </View>
        
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        
        <View style={styles.priceContainer}>
          <Text style={[styles.priceLabel, { color: theme.textDark }]}>Total Harga</Text>
          <View style={styles.priceValueContainer}>
            {priceAdjustment < 0 && (
              <Text style={[styles.originalPrice, { color: theme.textLight }]}>
                {formatPrice(calculatePrice(estimatedDistance, selectedServiceType))}
              </Text>
            )}
            <Text style={[styles.priceValue, { color: theme.primary }]}>{formatPrice(estimatedPrice)}</Text>
            {priceAdjustment < 0 && (
              <Text style={[styles.discountBadge, { color: theme.success, backgroundColor: theme.success + '20' }]}>
                {priceAdjustment}% OFF
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.priceBreakdown}>
          {renderPriceBreakdown()}
        </View>
      </Card>
      
      {/* Terms and Conditions */}
      <Card style={[styles.termsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.termsTitle, { color: theme.textDark }]}>Ketentuan Perjalanan</Text>
        
        <TouchableOpacity 
          style={styles.termsCheckbox}
          onPress={() => setTermsAccepted(!termsAccepted)}
        >
          {termsAccepted ? (
            <CheckSquare size={24} color={theme.primary} />
          ) : (
            <Square size={24} color={theme.textLight} />
          )}
          <Text style={[styles.termsCheckboxText, { color: theme.textDark }]}>
            Saya telah membaca dan menyetujui{" "}
            <Text 
              style={[styles.termsLink, { color: theme.primary }]}
              onPress={() => setShowTermsModal(true)}
            >
              ketentuan perjalanan
            </Text>
          </Text>
        </TouchableOpacity>
        
        {errors.terms && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.terms}</Text>}
      </Card>
      
      {/* Payment Method Selection */}
      <Card style={[styles.paymentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.paymentTitle, { color: theme.textDark }]}>Metode Pembayaran</Text>
        
        {/* Virtual Account Payment */}
        <TouchableOpacity 
          style={[
            styles.paymentMethod,
            {
              backgroundColor: paymentMethod === 'virtual_account' ? theme.primary + '10' : theme.background,
              borderColor: paymentMethod === 'virtual_account' ? theme.primary : theme.border,
            }
          ]}
          onPress={() => setPaymentMethod('virtual_account')}
        >
          <View style={styles.paymentMethodLeft}>
            <View style={[styles.paymentMethodIcon, { backgroundColor: '#007AFF' + '20' }]}>
              <CreditCard size={20} color="#007AFF" />
            </View>
            <View style={styles.paymentMethodInfo}>
              <Text style={[styles.paymentMethodName, { color: theme.textDark }]}>Virtual Account</Text>
              <Text style={[styles.paymentMethodBalance, { color: theme.textLight }]}>Transfer bank via Virtual Account</Text>
              <Text style={[styles.paymentMethodBalance, { color: theme.textLight }]}>Pembayaran otomatis terverifikasi</Text>
            </View>
          </View>
          <View
            style={[
              styles.radioButton,
              {
                borderColor: paymentMethod === 'virtual_account' ? theme.primary : theme.border,
                backgroundColor: paymentMethod === 'virtual_account' ? theme.primary : 'transparent'
              }
            ]}
          >
            {paymentMethod === 'virtual_account' && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>
        
        {/* Cash Payment */}
        <TouchableOpacity 
          style={[
            styles.paymentMethod,
            {
              backgroundColor: paymentMethod === 'cash' ? theme.primary + '10' : theme.background,
              borderColor: paymentMethod === 'cash' ? theme.primary : theme.border,
            }
          ]}
          onPress={() => setPaymentMethod('cash')}
        >
          <View style={styles.paymentMethodLeft}>
            <View style={[styles.paymentMethodIcon, { backgroundColor: '#34C759' + '20' }]}>
              <CreditCard size={20} color="#34C759" />
            </View>
            <View style={styles.paymentMethodInfo}>
              <Text style={[styles.paymentMethodName, { color: theme.textDark }]}>Bayar Tunai</Text>
              <Text style={[styles.paymentMethodBalance, { color: theme.textLight }]}>Bayar langsung ke driver</Text>
            </View>
          </View>
          <View
            style={[
              styles.radioButton,
              {
                borderColor: paymentMethod === 'cash' ? theme.primary : theme.border,
                backgroundColor: paymentMethod === 'cash' ? theme.primary : 'transparent'
              }
            ]}
          >
            {paymentMethod === 'cash' && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>
      </Card>
    </>
  );



  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: "Permintaan Derek",
          headerTitleStyle: {
            fontWeight: "600",
            color: theme.textDark,
          },
          headerStyle: {
            backgroundColor: theme.card,
          },
          headerTintColor: theme.textDark,
        }} 
      />
      
      <View style={[styles.stepsContainer, { borderBottomColor: theme.border }]}>
        {/* Step 1: Towing Type */}
        <View style={[
          styles.stepIndicator, 
          {
            backgroundColor: step >= 1 ? theme.primary : theme.background,
            borderColor: step >= 1 ? theme.primary : theme.border
          }
        ]}>
          <Truck size={16} color={step >= 1 ? theme.white : theme.textLight} />
        </View>
        <View style={[styles.stepConnector, { backgroundColor: step >= 2 ? theme.primary : theme.border }]} />
        
        {/* Step 2: Location */}
        <View style={[
          styles.stepIndicator,
          {
            backgroundColor: step >= 2 ? theme.primary : theme.background,
            borderColor: step >= 2 ? theme.primary : theme.border
          }
        ]}>
          <MapPin size={16} color={step >= 2 ? theme.white : theme.textLight} />
        </View>
        <View style={[styles.stepConnector, { backgroundColor: step >= 3 ? theme.primary : theme.border }]} />
        
        {/* Step 3: Car Details */}
        <View style={[
          styles.stepIndicator,
          {
            backgroundColor: step >= 3 ? theme.primary : theme.background,
            borderColor: step >= 3 ? theme.primary : theme.border
          }
        ]}>
          <Car size={16} color={step >= 3 ? theme.white : theme.textLight} />
        </View>
        <View style={[styles.stepConnector, { backgroundColor: step >= 4 ? theme.primary : theme.border }]} />
        
        {/* Step 4: Checklist */}
        <View style={[
          styles.stepIndicator,
          {
            backgroundColor: step >= 4 ? theme.primary : theme.background,
            borderColor: step >= 4 ? theme.primary : theme.border
          }
        ]}>
          <Text style={[
            styles.stepText,
            { color: step >= 4 ? theme.white : theme.textLight }
          ]}>✓</Text>
        </View>
      </View>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.textDark }]}>
          {step === 1 ? "Pilih Jenis Layanan" : 
           step === 2 ? "Pilih Lokasi" :
           step === 3 ? "Info Kendaraan & Kerusakan" : "Konfirmasi Permintaan"}
        </Text>
        
        {step === 1 && renderStepOne()}
        {step === 2 && renderStepTwo()}
        {step === 3 && renderStepThree()}
        {step === 4 && renderStepFour()}
      </ScrollView>
      
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <Button
          title="Kembali"
          onPress={handleBack}
          variant="outline"
          size="medium"
          style={styles.footerButton}
        />
        
        {step < 4 ? (
          <Button
            title={step === 1 ? "Lanjut" : 
                   step === 2 ? "Pilih di Peta" :
                   "Lanjut"}
            onPress={handleNext}
            variant="primary"
            size="medium"
            style={styles.footerButton}
            disabled={step === 2 && (!pickupLocation || !dropoffLocation)}
          />
        ) : (
          <Button
            title="Konfirmasi Permintaan"
            onPress={handleConfirm}
            variant="primary"
            size="medium"
            style={styles.footerButton}
            loading={loading}
          />
        )}
      </View>
      
      {/* Terms and Conditions Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textDark }]}>Ketentuan Perjalanan</Text>
            <TouchableOpacity onPress={() => setShowTermsModal(false)}>
              <X size={24} color={theme.textDark} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.termsText, { color: theme.textDark }]}>
              <Text style={styles.termsHeader}>*KETENTUAN PERJALANAN*</Text>
              {"\n"}
              <Text style={styles.termsSubheader}>(MOHON DIBACA SEBELUM PERJALANAN BERLANGSUNG)</Text>
              {"\n\n"}
              
              <Text style={styles.termsBold}>1. </Text>
              <Text style={styles.termsUnderline}>pembatalan sepihak ditengah jalan dikenakan charges 50%</Text>
              <Text> lakukan transfer setelah towing tiba menjemput/Loading (luar kota payment dimuka H-1)</Text>
              {"\n\n"}
              
              <Text style={styles.termsBold}>2. </Text>
              <Text style={styles.termsUnderline}>Pastikan ceklist ulang setelah mobil tiba, komplain setelah derek/towing meninggalkan lokasi dianggap nihil</Text>
              {"\n"}
              <Text>(seluruh klaim perjalanan maksimal penggantian senilai transaksi (part standar bukan aksesoris tambahan) atau ongkos dianggap free)</Text>
              {"\n"}
              <Text style={styles.termsBold}>No claim jika force majeur (huru hara/tawuran/bencana alam)</Text>
              {"\n\n"}
              
              <Text style={styles.termsBold}>3. SUATU SAAT ORDER KEMBALI MELALUI HP DRIVER MAKA </Text>
              <Text>(DJAKS tidak bertanggung jawab jika terjadi sesuatu/Segala komplain dianggap nihil)</Text>
              {"\n\n"}
              
              <Text style={styles.termsBold}>4. </Text>
              <Text>Jika towing sudah sampai tempat jemput & tujuan maksimal </Text>
              <Text style={styles.termsBold}>durasi turun naik 30 sd 40 menit</Text>
              {"\n"}
              <Text>jika ada menunggu karena faktor mobil belum siap/tidak ada penerima/pemberi order maka </Text>
              <Text style={styles.termsBold}>ada over charges 1jam 120rb dst</Text>
              {"\n\n"}
              
              <Text style={styles.termsBold}>5. </Text>
              <Text>Payment jika dilakukan </Text>
              <Text style={styles.termsBold}>cash</Text>
              <Text> maka ada selisih </Text>
              <Text style={styles.termsBold}>25rb</Text>
              {"\n"}
              <Text style={styles.termsBold}>(Prioritas by transfer)</Text>
              {"\n"}
              <Text style={styles.termsBold}>Payment luar kota dilakukan H-1 dimuka</Text>
              {"\n\n"}
              
              <Text style={styles.termsBold}>6. </Text>
              <Text>Jika memasuki pelataran </Text>
              <Text style={styles.termsBold}>parkir mall/gedung & masuk tol seluruh biaya dibebankan kepada konsumen</Text>
              {"\n\n"}
              
              <Text style={styles.termsHeader}>*NOTED*</Text>
              {"\n"}
              <Text style={styles.termsBold}>Selanjutnya jika lanjut order maka secara otomatis menyetujui semua point yang ada</Text>
              {"\n"}
              <Text style={styles.termsBold}>Informasikan jujur isi barang di mobil & wajib di dokumentasi foto/video sewaktu serah & terima</Text>
              {"\n"}
              <Text style={styles.termsBold}>Insurance cargo (luar kota) nilai Mobil x 0.03% = nilai premi</Text>
              {"\n\n"}
              
              <Text style={styles.termsFooter}>*SAFETY FIRST | EXPERIENCE | ONTIME*</Text>
            </Text>
          </ScrollView>
          
          <View style={[styles.modalFooter, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
            <Button
              title="Tutup"
              onPress={() => setShowTermsModal(false)}
              variant="outline"
              size="medium"
              style={styles.modalButton}
            />
            <Button
              title="Setuju"
              onPress={() => {
                setTermsAccepted(true);
                setShowTermsModal(false);
              }}
              variant="primary"
              size="medium"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
      
      {/* Towing Type Detail Modal */}
      <TowingTypeDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        towingType={selectedTowingType}
        onSelectService={(serviceId) => {
          // Map towing type ID back to service ID
          const serviceMapping: { [key: string]: string } = {
            '1': 'hydraulic',
            '2': 'ladder', 
            '3': 'accident',
            '4': 'service',
            '5': 'roller_tire', // Also used for dolly
            '6': 'free_wheel',
            '7': 'double_deck',
            '8': 'moge_transport',
            '9': 'basement_towing',
            '10': 'selfloader'
          };
          const mappedServiceId = serviceMapping[serviceId];
          if (mappedServiceId) {
            setSelectedServiceType(mappedServiceId);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  serviceTypeCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  serviceTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  serviceTypeImage: {
    width: 30,
    height: 30,
  },
  serviceTypeInfo: {
    flex: 1,
  },
  serviceTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  serviceTypePrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  currentPrice: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  serviceTypeDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
  },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  stepsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  stepText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  stepConnector: {
    height: 2,
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  map: {
    marginVertical: 16,
    height: 300,
  },
  driverSearchCard: {
    marginTop: 16,
    padding: 24,
  },
  searchingContainer: {
    alignItems: "center",
  },
  searchingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  searchingTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  searchingText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  driverFoundContainer: {
    width: "100%",
    marginTop: 16,
  },
  driverFoundTitle: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  formCard: {
    marginBottom: 16,
  },
  formSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    marginTop: -12,
    marginBottom: 16,
  },
  summarySection: {
    marginBottom: 16,
  },
  summarySectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  priceBreakdown: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  summaryCard: {
    marginTop: 16,
    padding: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  priceContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "bold",
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  pricePreviewCard: {
    marginTop: 16,
    padding: 16,
  },
  pricePreviewContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  pricePreviewLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  pricePreviewValue: {
    fontSize: 20,
    fontWeight: "bold",
  },
  pricePreviewDetails: {
    gap: 4,
  },
  pricePreviewText: {
    fontSize: 12,
    lineHeight: 16,
  },
  termsCard: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  termsCheckbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  termsCheckboxText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  termsLink: {
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  termsText: {
    fontSize: 14,
    lineHeight: 22,
  },
  termsHeader: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  termsSubheader: {
    fontWeight: '500',
    fontSize: 14,
  },
  termsBold: {
    fontWeight: 'bold',
  },
  termsUnderline: {
    textDecorationLine: 'underline',
    fontWeight: 'bold',
  },
  termsFooter: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  priceAdjustmentCard: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
  },
  priceAdjustmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  priceAdjustmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  priceAdjustmentInfo: {
    flex: 1,
  },
  priceAdjustmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  priceAdjustmentSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  adjustmentControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  adjustmentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustmentDisplay: {
    alignItems: 'center',
    minWidth: 120,
  },
  adjustmentValue: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  adjustmentLabel: {
    fontSize: 12,
  },
  priceValueContainer: {
    alignItems: 'flex-end',
  },
  originalPrice: {
    fontSize: 14,
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  discountBadge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  paymentCard: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentMethodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  paymentMethodBalance: {
    fontSize: 12,
  },
  paymentMethodWarning: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  pricingNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  locationSummaryCard: {
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
  },
  locationSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  locationSummaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  locationSummaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  locationSummaryAddress: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  locationCard: {
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  routeConnector: {
    height: 2,
    marginLeft: 32,
    marginRight: 16,
    marginVertical: 8,
  },
  mapButton: {
    marginTop: 16,
  },
});