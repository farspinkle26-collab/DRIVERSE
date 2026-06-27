import React, { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Platform, TouchableOpacity, Linking, Alert, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Car, Truck, Package, Calendar, Users, Calculator, Zap, Wrench, MapPin, Shield, Ambulance } from "lucide-react-native";
import { useTheme } from "@/hooks/useThemeStore";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Dropdown from "@/components/Dropdown";

export default function TowingPlusScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedSeatType, setSelectedSeatType] = useState<string>("");
  const [selectedEVType, setSelectedEVType] = useState<string>("");
  const [numberOfDays, setNumberOfDays] = useState<number>(1);
  const [numberOfHours, setNumberOfHours] = useState<number>(8);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const transportServices = [
    {
      id: "derek_basement",
      title: "Derek Basement",
      description: "Layanan derek khusus untuk kendaraan di basement dengan akses terbatas",
      icon: <Truck size={24} color="#7D3C98" />,
      color: "#7D3C98",
      iconUrl: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/rgm4m2b4uacm3vlp8fzmp"
    },
    {
      id: "motor",
      title: "Antar Jemput Motor",
      description: "Layanan antar jemput motor dengan aman dan terpercaya",
      icon: <Car size={24} color="#FF3B30" />,
      color: "#FF3B30"
    },
    {
      id: "mobil",
      title: "Antar Jemput Mobil",
      description: "Layanan antar jemput mobil untuk berbagai kebutuhan",
      icon: <Car size={24} color="#007AFF" />,
      color: "#007AFF"
    },
    {
      id: "barang",
      title: "Antar Jemput Barang/Dokumen (Go Show / Curah)",
      description: "Pengiriman barang dan dokumen dengan layanan express",
      icon: <Package size={24} color="#34C759" />,
      color: "#34C759"
    },
    {
      id: "box",
      title: "Box / Bak Terbuka / Delvan",
      description: "Layanan transportasi dengan kendaraan box dan bak terbuka",
      icon: <Truck size={24} color="#FF9500" />,
      color: "#FF9500"
    },
    {
      id: "bluebird",
      title: "Bluebird",
      description: "Layanan transportasi Bluebird untuk perjalanan nyaman",
      icon: <Car size={24} color="#0066CC" />,
      color: "#0066CC"
    },
    {
      id: "green",
      title: "Green",
      description: "Layanan transportasi ramah lingkungan",
      icon: <Car size={24} color="#00AA44" />,
      color: "#00AA44"
    },
    {
      id: "transhalim",
      title: "Transhalim",
      description: "Layanan transportasi Transhalim terpercaya",
      icon: <Car size={24} color="#8B4513" />,
      color: "#8B4513"
    },
    {
      id: "gamya",
      title: "Gamya",
      description: "Layanan transportasi Gamya berkualitas",
      icon: <Car size={24} color="#9932CC" />,
      color: "#9932CC"
    },
    {
      id: "embassy-armored",
      title: "Support Embassy Armored",
      description: "Layanan dukungan kendaraan lapis baja kedutaan",
      icon: <Shield size={24} color="#2C3E50" />,
      color: "#2C3E50"
    },
    {
      id: "tni-alutista",
      title: "TNI Unit Alutista",
      description: "Dukungan unit alat utama sistem senjata TNI",
      icon: <Shield size={24} color="#27AE60" />,
      color: "#27AE60"
    },
    {
      id: "polri-taktis",
      title: "POLRI Unit Taktis",
      description: "Dukungan unit taktis kepolisian republik Indonesia",
      icon: <Shield size={24} color="#3498DB" />,
      color: "#3498DB"
    },
    {
      id: "rs-ambulance",
      title: "RS Unit Ambulance",
      description: "Dukungan unit ambulans rumah sakit",
      icon: <Ambulance size={24} color="#E74C3C" />,
      color: "#E74C3C"
    }
  ];

  const golfCarRentals = [
    {
      seats: 6,
      price: 5000000,
      description: "Mobil golf 6 seat untuk keluarga (8 jam)"
    },
    {
      seats: 4,
      price: 4000000,
      description: "Mobil golf 4 seat untuk pasangan (8 jam)"
    }
  ];

  const evRentals = [
    {
      type: "EV Wuling",
      price: 600000,
      duration: "12 jam",
      area: "Jabodetabek",
      description: "Mobil listrik Wuling untuk perjalanan ramah lingkungan"
    }
  ];

  const workshopData = {
    "Jakarta Timur": {
      engine: [
        "Bengkel Mesin Jaya - Jl. Raya Bekasi Km 15",
        "Auto Engine Service - Jl. Kalimalang No. 45",
        "Mesin Prima Motor - Jl. Cipinang Raya 123",
        "Engine Master - Jl. Rawamangun Muka 67",
        "Bengkel Diesel Pro - Jl. Duren Sawit 89",
        "Motor Engine Care - Jl. Klender Baru 34",
        "Precision Engine - Jl. Cakung Timur 56",
        "Turbo Engine Shop - Jl. Pulogadung 78",
        "Engine Specialist - Jl. Jatinegara 90",
        "Power Engine Works - Jl. Matraman 12"
      ],
      body: [
        "Body Repair Center - Jl. Pemuda Raya 23",
        "Cat & Body Shop - Jl. Pramuka 45",
        "Auto Body Works - Jl. Salemba 67",
        "Perfect Body Repair - Jl. Menteng Dalam 89",
        "Body Paint Pro - Jl. Tebet Raya 12",
        "Collision Repair - Jl. Pancoran 34",
        "Body Master - Jl. Condet 56",
        "Auto Collision - Jl. Kramat Jati 78",
        "Body Care Center - Jl. Halim 90",
        "Premium Body Shop - Jl. Cililitan 13"
      ]
    },
    "Jakarta Selatan": {
      engine: [
        "Engine Pro Kemang - Jl. Kemang Raya 45",
        "Mesin Ahli Pondok Indah - Jl. Metro Pondok Indah 67",
        "Auto Engine Kebayoran - Jl. Kebayoran Baru 23",
        "Engine Care Senayan - Jl. Senayan 89",
        "Motor Clinic Blok M - Jl. Blok M 12",
        "Engine Workshop TB Simatupang - Jl. TB Simatupang 34",
        "Precision Motor - Jl. Fatmawati 56",
        "Engine Solutions - Jl. Cilandak 78",
        "Auto Mechanic Pro - Jl. Pasar Minggu 90",
        "Engine Expert - Jl. Jagakarsa 15"
      ],
      body: [
        "Body Shop Kemang - Jl. Kemang Utara 23",
        "Cat Mobil Pondok Indah - Jl. Pondok Indah 45",
        "Auto Body Kebayoran - Jl. Kebayoran Lama 67",
        "Body Repair Senayan - Jl. Senayan Raya 89",
        "Paint & Body Blok M - Jl. Blok M Square 12",
        "Collision Center - Jl. Ampera 34",
        "Body Works Fatmawati - Jl. Fatmawati Raya 56",
        "Auto Paint Shop - Jl. Cilandak KKO 78",
        "Body Master Pasar Minggu - Jl. Raya Pasar Minggu 90",
        "Premium Body Care - Jl. Mampang 25"
      ]
    },
    "Jakarta Utara": {
      engine: [
        "Engine Service Kelapa Gading - Jl. Kelapa Gading 23",
        "Mesin Motor Sunter - Jl. Sunter Agung 45",
        "Auto Engine Ancol - Jl. Ancol Barat 67",
        "Engine Pro Pluit - Jl. Pluit Raya 89",
        "Motor Care Tanjung Priok - Jl. Tanjung Priok 12",
        "Engine Workshop PIK - Jl. PIK Avenue 34",
        "Diesel Engine Pro - Jl. Yos Sudarso 56",
        "Engine Specialist - Jl. Kemayoran 78",
        "Auto Mechanic - Jl. Pademangan 90",
        "Engine Solutions - Jl. Mangga Dua 15"
      ],
      body: [
        "Body Shop Kelapa Gading - Jl. Boulevard Raya 23",
        "Cat & Body Sunter - Jl. Sunter Permai 45",
        "Auto Body Ancol - Jl. Ancol Timur 67",
        "Body Repair Pluit - Jl. Pluit Selatan 89",
        "Paint Shop Tanjung Priok - Jl. Enggano 12",
        "Body Works PIK - Jl. Pantai Indah Kapuk 34",
        "Collision Repair - Jl. Lodan Raya 56",
        "Body Care Kemayoran - Jl. Kemayoran Baru 78",
        "Auto Paint Center - Jl. Pademangan Timur 90",
        "Body Master - Jl. Gunung Sahari 25"
      ]
    },
    "Jakarta Pusat": {
      engine: [
        "Engine Center Menteng - Jl. Menteng Raya 23",
        "Mesin Pro Tanah Abang - Jl. Tanah Abang 45",
        "Auto Engine Gambir - Jl. Gambir 67",
        "Engine Service Senen - Jl. Senen Raya 89",
        "Motor Clinic Cempaka Putih - Jl. Cempaka Putih 12",
        "Engine Workshop Kemayoran - Jl. Kemayoran Lama 34",
        "Precision Engine - Jl. Johar Baru 56",
        "Engine Solutions - Jl. Sawah Besar 78",
        "Auto Mechanic Pro - Jl. Mangga Besar 90",
        "Engine Expert - Jl. Glodok 15"
      ],
      body: [
        "Body Shop Menteng - Jl. Cut Meutia 23",
        "Cat Mobil Tanah Abang - Jl. Kebon Kacang 45",
        "Auto Body Gambir - Jl. Medan Merdeka 67",
        "Body Repair Senen - Jl. Kramat Raya 89",
        "Paint & Body - Jl. Cempaka Putih Tengah 12",
        "Collision Center - Jl. Pecenongan 34",
        "Body Works - Jl. Pasar Baru 56",
        "Auto Paint Shop - Jl. Gunung Sahari 78",
        "Body Master - Jl. Mangga Besar Raya 90",
        "Premium Body - Jl. Pintu Besar Selatan 25"
      ]
    },
    "Jakarta Barat": {
      engine: [
        "Engine Pro Grogol - Jl. Grogol Raya 23",
        "Mesin Ahli Kebon Jeruk - Jl. Kebon Jeruk 45",
        "Auto Engine Cengkareng - Jl. Cengkareng 67",
        "Engine Care Kalideres - Jl. Kalideres 89",
        "Motor Clinic Taman Sari - Jl. Taman Sari 12",
        "Engine Workshop Tambora - Jl. Tambora 34",
        "Precision Motor - Jl. Kembangan 56",
        "Engine Solutions - Jl. Palmerah 78",
        "Auto Mechanic Pro - Jl. Slipi 90",
        "Engine Expert - Jl. Duri Kepa 15"
      ],
      body: [
        "Body Shop Grogol - Jl. Tomang Raya 23",
        "Cat Mobil Kebon Jeruk - Jl. Perjuangan 45",
        "Auto Body Cengkareng - Jl. Daan Mogot 67",
        "Body Repair Kalideres - Jl. Outer Ring Road 89",
        "Paint & Body Taman Sari - Jl. Mangga Besar 12",
        "Collision Center - Jl. Hayam Wuruk 34",
        "Body Works Kembangan - Jl. Meruya 56",
        "Auto Paint Shop - Jl. Palmerah Barat 78",
        "Body Master Slipi - Jl. S. Parman 90",
        "Premium Body - Jl. Kemanggisan 25"
      ]
    }
  };

  const seatOptions = golfCarRentals.map(rental => ({
    label: `${rental.seats} seat - ${formatPrice(rental.price)}/8jam`,
    value: rental.seats.toString()
  }));

  const evOptions = evRentals.map(rental => ({
    label: `${rental.type} - ${formatPrice(rental.price)}/${rental.duration}`,
    value: rental.type
  }));

  const calculateTotalPrice = () => {
    if (!selectedSeatType) return 0;
    const selectedRental = golfCarRentals.find(rental => rental.seats.toString() === selectedSeatType);
    return selectedRental ? selectedRental.price * numberOfDays : 0;
  };

  const calculateEVTotalPrice = () => {
    if (!selectedEVType) return 0;
    const selectedRental = evRentals.find(rental => rental.type === selectedEVType);
    return selectedRental ? selectedRental.price * Math.ceil(numberOfHours / 12) : 0;
  };

  const handleRentEV = async () => {
    if (!selectedEVType) {
      Alert.alert("Pilih Mobil EV", "Silakan pilih jenis mobil EV terlebih dahulu");
      return;
    }

    const selectedRental = evRentals.find(rental => rental.type === selectedEVType);
    if (!selectedRental) return;

    const totalPrice = calculateEVTotalPrice();
    const pricePerPeriod = formatPrice(selectedRental.price);
    const totalPriceFormatted = formatPrice(totalPrice);
    const periods = Math.ceil(numberOfHours / 12);

    const message = `⚡ *PERMINTAAN RENTAL MOBIL EV WULING*\n\n` +
      `📋 *Detail Pesanan:*\n` +
      `• Jenis: ${selectedRental.type}\n` +
      `• Durasi: ${numberOfHours} jam (${periods} periode)\n` +
      `• Harga per 12 jam: ${pricePerPeriod}\n` +
      `• Total Biaya: ${totalPriceFormatted}\n` +
      `• Area: ${selectedRental.area}\n\n` +
      `📝 *Deskripsi:*\n` +
      `${selectedRental.description}\n\n` +
      `⏰ Waktu Pemesanan: ${new Date().toLocaleString('id-ID')}\n\n` +
      `Mohon konfirmasi ketersediaan dan detail lebih lanjut. Terima kasih! 🙏`;

    try {
      const encodedMessage = encodeURIComponent(message);
      const phoneNumber = '6281380680009';
      
      let whatsappUrl: string;
      
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        whatsappUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodedMessage}`;
        
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (!canOpen) {
          whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        }
      } else {
        whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
      }
      
      console.log('Opening WhatsApp for EV rental:', whatsappUrl);
      await Linking.openURL(whatsappUrl);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      Alert.alert(
        "Error",
        "Tidak dapat membuka WhatsApp. Pastikan WhatsApp terinstall di perangkat Anda.",
        [{ text: "OK" }]
      );
    }
  };

  const handleContactForTransport = (serviceType: string) => {
    Alert.alert(
      "Layanan Tidak Tersedia",
      "Maaf, layanan ini sedang tidak tersedia untuk saat ini. Silakan coba lagi nanti.",
      [{ text: "OK" }]
    );
  };

  const handleRentGolfCar = async () => {
    if (!selectedSeatType) {
      Alert.alert("Pilih Mobil Golf", "Silakan pilih jenis mobil golf terlebih dahulu");
      return;
    }

    const selectedRental = golfCarRentals.find(rental => rental.seats.toString() === selectedSeatType);
    if (!selectedRental) return;

    const totalPrice = calculateTotalPrice();
    const pricePerDay = formatPrice(selectedRental.price);
    const totalPriceFormatted = formatPrice(totalPrice);

    const message = `🏌️ *PERMINTAAN RENTAL MOBIL GOLF*\n\n` +
      `📋 *Detail Pesanan:*\n` +
      `• Jenis: Mobil Golf ${selectedRental.seats} Seat\n` +
      `• Durasi: ${numberOfDays} hari\n` +
      `• Harga per 8 jam: ${pricePerDay}\n` +
      `• Total Biaya: ${totalPriceFormatted}\n\n` +
      `📝 *Deskripsi:*\n` +
      `${selectedRental.description}\n\n` +
      `⏰ Waktu Pemesanan: ${new Date().toLocaleString('id-ID')}\n\n` +
      `Mohon konfirmasi ketersediaan dan detail lebih lanjut. Terima kasih! 🙏`;

    try {
      const encodedMessage = encodeURIComponent(message);
      const phoneNumber = '6281380680009'; // Remove + for WhatsApp URL
      
      let whatsappUrl: string;
      
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        whatsappUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodedMessage}`;
        
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (!canOpen) {
          whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        }
      } else {
        whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
      }
      
      console.log('Opening WhatsApp for golf car rental:', whatsappUrl);
      await Linking.openURL(whatsappUrl);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      Alert.alert(
        "Error",
        "Tidak dapat membuka WhatsApp. Pastikan WhatsApp terinstall di perangkat Anda.",
        [{ text: "OK" }]
      );
    }
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={{
        paddingBottom: Platform.OS === 'android' ? 90 + insets.bottom + 20 : 110
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textDark }]}>Towing+</Text>
        <Text style={[styles.subtitle, { color: theme.textLight }]}>
          Layanan transportasi & rental mobil golf
        </Text>
      </View>

      {/* Transportasi Umum Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>🚛 Transportasi Umum</Text>
        </View>
        {transportServices.map((service) => (
          <Card key={service.id} style={[styles.serviceCard, { borderLeftColor: '#ccc', opacity: 0.6 }]}>
            <View style={styles.serviceContent}>
              <View style={styles.serviceHeader}>
                <View style={[styles.serviceIcon, { backgroundColor: service.color + '20' }]}>
                  {service.iconUrl ? (
                    <Image 
                      source={{ uri: service.iconUrl }} 
                      style={styles.serviceIconImage}
                      resizeMode="contain"
                    />
                  ) : (
                    service.icon
                  )}
                </View>
                <View style={styles.serviceInfo}>
                  <Text style={[styles.serviceTitle, { color: theme.textDark }]}>{service.title}</Text>
                  <Text style={[styles.serviceDescription, { color: theme.textLight }]}>
                    {service.description}
                  </Text>
                </View>
                <Button
                  title="Tidak Tersedia"
                  onPress={() => handleContactForTransport(service.id)}
                  variant="outline"
                  size="small"
                  disabled={true}
                  style={[styles.serviceButton, { borderColor: '#ccc', opacity: 0.5 }]}
                  textStyle={{ color: '#999', fontSize: 12 }}
                />
              </View>
            </View>
          </Card>
        ))}
      </View>

      {/* Rental EV Wuling Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>⚡ Rental Mobil EV Wuling</Text>
        </View>
        
        <Card style={styles.calculatorCard}>
          <View style={styles.calculatorHeader}>
            <Zap size={24} color={theme.primary} />
            <Text style={[styles.calculatorTitle, { color: theme.textDark }]}>Kalkulator Harga EV</Text>
          </View>
          
          <View style={styles.calculatorContent}>
            {/* EV Type Selection */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textDark }]}>Pilih Mobil EV</Text>
              <Dropdown
                options={evOptions}
                value={selectedEVType}
                onChange={setSelectedEVType}
                placeholder="Pilih mobil EV"
              />
            </View>

            {/* Number of Hours */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textDark }]}>Jumlah Jam (minimal 12 jam)</Text>
              <View style={styles.daySelector}>
                <TouchableOpacity
                  style={[styles.dayButton, { borderColor: theme.border }]}
                  onPress={() => setNumberOfHours(Math.max(12, numberOfHours - 12))}
                  disabled={numberOfHours <= 12}
                >
                  <Text style={[styles.dayButtonText, { color: numberOfHours <= 12 ? theme.textLight : theme.textDark }]}>-</Text>
                </TouchableOpacity>
                <View style={[styles.dayDisplay, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Calendar size={16} color={theme.textLight} />
                  <Text style={[styles.dayText, { color: theme.textDark }]}>{numberOfHours} jam</Text>
                </View>
                <TouchableOpacity
                  style={[styles.dayButton, { borderColor: theme.border }]}
                  onPress={() => setNumberOfHours(numberOfHours + 12)}
                >
                  <Text style={[styles.dayButtonText, { color: theme.textDark }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* EV Price Display */}
            {selectedEVType && (
              <View style={[styles.priceDisplay, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
                <Text style={[styles.priceLabel, { color: theme.textLight }]}>Total Harga</Text>
                <Text style={[styles.priceValue, { color: theme.primary }]}>
                  {formatPrice(calculateEVTotalPrice())}
                </Text>
                <Text style={[styles.priceBreakdown, { color: theme.textLight }]}>
                  {formatPrice(600000)}/12jam × {Math.ceil(numberOfHours / 12)} periode
                </Text>
                <Text style={[styles.areaNote, { color: theme.textLight }]}>
                  Area: Jabodetabek
                </Text>
              </View>
            )}

            {/* Rent EV Button */}
            <Button
              title={selectedEVType ? "Sewa EV Sekarang" : "Pilih Mobil EV"}
              onPress={() => handleRentEV()}
              variant="primary"
              size="large"
              disabled={!selectedEVType}
              style={styles.rentButton}
              icon={<Zap size={20} color={theme.white} />}
            />
          </View>
        </Card>

        {/* EV Options */}
        <View style={styles.golfCarOptions}>
          <Text style={[styles.optionsTitle, { color: theme.textDark }]}>Pilihan Mobil EV</Text>
          {evRentals.map((rental) => (
            <Card key={rental.type} style={styles.golfCarCard}>
              <View style={styles.golfCarContent}>
                <View style={[styles.golfCarIcon, { backgroundColor: theme.primary + '20' }]}>
                  <Zap size={24} color={theme.primary} />
                </View>
                <View style={styles.golfCarInfo}>
                  <Text style={[styles.golfCarTitle, { color: theme.textDark }]}>
                    {rental.type}
                  </Text>
                  <Text style={[styles.golfCarDescription, { color: theme.textLight }]}>
                    {rental.description}
                  </Text>
                  <Text style={[styles.golfCarPrice, { color: theme.primary }]}>
                    {formatPrice(rental.price)}/{rental.duration}
                  </Text>
                  <Text style={[styles.areaText, { color: theme.textLight }]}>
                    Area: {rental.area}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* Rental Mobil Golf Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>🏌️ Rental Mobil Golf</Text>
        </View>
        
        <Card style={styles.calculatorCard}>
          <View style={styles.calculatorHeader}>
            <Calculator size={24} color={theme.primary} />
            <Text style={[styles.calculatorTitle, { color: theme.textDark }]}>Kalkulator Harga</Text>
          </View>
          
          <View style={styles.calculatorContent}>
            {/* Seat Type Selection */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textDark }]}>Pilih Jenis Mobil Golf</Text>
              <Dropdown
                options={seatOptions}
                value={selectedSeatType}
                onChange={setSelectedSeatType}
                placeholder="Pilih jumlah seat"

              />
            </View>

            {/* Number of Days */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textDark }]}>Jumlah Hari (8 jam per hari)</Text>
              <View style={styles.daySelector}>
                <TouchableOpacity
                  style={[styles.dayButton, { borderColor: theme.border }]}
                  onPress={() => setNumberOfDays(Math.max(1, numberOfDays - 1))}
                  disabled={numberOfDays <= 1}
                >
                  <Text style={[styles.dayButtonText, { color: numberOfDays <= 1 ? theme.textLight : theme.textDark }]}>-</Text>
                </TouchableOpacity>
                <View style={[styles.dayDisplay, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Calendar size={16} color={theme.textLight} />
                  <Text style={[styles.dayText, { color: theme.textDark }]}>{numberOfDays} hari</Text>
                </View>
                <TouchableOpacity
                  style={[styles.dayButton, { borderColor: theme.border }]}
                  onPress={() => setNumberOfDays(numberOfDays + 1)}
                >
                  <Text style={[styles.dayButtonText, { color: theme.textDark }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Price Display */}
            {selectedSeatType && (
              <View style={[styles.priceDisplay, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
                <Text style={[styles.priceLabel, { color: theme.textLight }]}>Total Harga</Text>
                <Text style={[styles.priceValue, { color: theme.primary }]}>
                  {formatPrice(calculateTotalPrice())}
                </Text>
                <Text style={[styles.priceBreakdown, { color: theme.textLight }]}>
                  {formatPrice(golfCarRentals.find(r => r.seats.toString() === selectedSeatType)?.price || 0)}/8jam × {numberOfDays} hari
                </Text>
              </View>
            )}

            {/* Rent Button */}
            <Button
              title={selectedSeatType ? "Sewa Sekarang" : "Pilih Mobil Golf"}
              onPress={handleRentGolfCar}
              variant="primary"
              size="large"
              disabled={!selectedSeatType}
              style={styles.rentButton}
              icon={<Car size={20} color={theme.white} />}
            />
          </View>
        </Card>

        {/* Golf Car Options */}
        <View style={styles.golfCarOptions}>
          <Text style={[styles.optionsTitle, { color: theme.textDark }]}>Pilihan Mobil Golf</Text>
          {golfCarRentals.map((rental) => (
            <Card key={rental.seats} style={styles.golfCarCard}>
              <View style={styles.golfCarContent}>
                <View style={[styles.golfCarIcon, { backgroundColor: theme.primary + '20' }]}>
                  <Users size={24} color={theme.primary} />
                  <Text style={[styles.seatCount, { color: theme.primary }]}>{rental.seats}</Text>
                </View>
                <View style={styles.golfCarInfo}>
                  <Text style={[styles.golfCarTitle, { color: theme.textDark }]}>
                    Mobil Golf {rental.seats} Seat
                  </Text>
                  <Text style={[styles.golfCarDescription, { color: theme.textLight }]}>
                    {rental.description}
                  </Text>
                  <Text style={[styles.golfCarPrice, { color: theme.primary }]}>
                    {formatPrice(rental.price)}/8jam
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* Rujukan Bengkel Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>🔧 Rujukan Bengkel</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textLight }]}>
            Engine & Body Repair (Umum & Asuransi)
          </Text>
        </View>
        
        {Object.entries(workshopData).map(([region, workshops]) => (
          <Card key={region} style={styles.workshopRegionCard}>
            <View style={styles.workshopRegionHeader}>
              <MapPin size={20} color={theme.primary} />
              <Text style={[styles.workshopRegionTitle, { color: theme.textDark }]}>{region}</Text>
            </View>
            
            {/* Engine Repair */}
            <View style={styles.workshopCategory}>
              <View style={styles.workshopCategoryHeader}>
                <Wrench size={16} color="#FF6B35" />
                <Text style={[styles.workshopCategoryTitle, { color: theme.textDark }]}>Engine Repair</Text>
              </View>
              <View style={styles.workshopList}>
                {workshops.engine.map((workshop, index) => (
                  <View key={`engine-${index}`} style={styles.workshopItem}>
                    <View style={[styles.workshopBullet, { backgroundColor: '#FF6B35' }]} />
                    <Text style={[styles.workshopText, { color: theme.textLight }]}>{workshop}</Text>
                  </View>
                ))}
              </View>
            </View>
            
            {/* Body Repair */}
            <View style={styles.workshopCategory}>
              <View style={styles.workshopCategoryHeader}>
                <Car size={16} color="#4ECDC4" />
                <Text style={[styles.workshopCategoryTitle, { color: theme.textDark }]}>Body Repair</Text>
              </View>
              <View style={styles.workshopList}>
                {workshops.body.map((workshop, index) => (
                  <View key={`body-${index}`} style={styles.workshopItem}>
                    <View style={[styles.workshopBullet, { backgroundColor: '#4ECDC4' }]} />
                    <Text style={[styles.workshopText, { color: theme.textLight }]}>{workshop}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.8,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  serviceCard: {
    marginBottom: 12,
    borderLeftWidth: 4,
    padding: 16,
  },
  serviceContent: {
    gap: 12,
  },
  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceIconImage: {
    width: 30,
    height: 30,
  },
  serviceInfo: {
    flex: 1,
    gap: 4,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  serviceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  serviceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
  },
  calculatorCard: {
    padding: 20,
    marginBottom: 20,
  },
  calculatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  calculatorTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  calculatorContent: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  daySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  dayDisplay: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayText: {
    fontSize: 16,
    fontWeight: "500",
  },
  priceDisplay: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  priceLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  priceBreakdown: {
    fontSize: 12,
  },
  rentButton: {
    marginTop: 8,
  },
  golfCarOptions: {
    gap: 12,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  golfCarCard: {
    padding: 16,
  },
  golfCarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  golfCarIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  seatCount: {
    position: "absolute",
    bottom: -2,
    right: -2,
    fontSize: 12,
    fontWeight: "bold",
  },
  golfCarInfo: {
    flex: 1,
    gap: 4,
  },
  golfCarTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  golfCarDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  golfCarPrice: {
    fontSize: 16,
    fontWeight: "700",
  },
  areaNote: {
    fontSize: 11,
    fontStyle: "italic",
  },
  areaText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  sectionSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  workshopRegionCard: {
    padding: 20,
    marginBottom: 16,
  },
  workshopRegionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  workshopRegionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  workshopCategory: {
    marginBottom: 20,
  },
  workshopCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  workshopCategoryTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  workshopList: {
    gap: 8,
  },
  workshopItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingLeft: 8,
  },
  workshopBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  workshopText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});