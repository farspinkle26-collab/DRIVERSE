import React from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Shield, CheckCircle, AlertTriangle, MessageCircle, FileText, Clock } from "lucide-react-native";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { useTheme } from "@/hooks/useThemeStore";

export default function MemberAsuransiScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const handleContactUs = () => {
    router.push('/chat' as any);
  };

  const renderTermsAndConditions = () => (
    <Card style={[styles.termsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.termsHeader}>
        <FileText size={24} color={theme.primary} />
        <Text style={[styles.termsTitle, { color: theme.textDark }]}>Syarat & Ketentuan Layanan Asuransi</Text>
      </View>
      
      <View style={styles.termsContent}>
        <View style={styles.termsSection}>
          <View style={styles.termsSectionHeader}>
            <CheckCircle size={18} color={theme.success} />
            <Text style={[styles.termsSectionTitle, { color: theme.success }]}>1. Layanan yang Dicover</Text>
          </View>
          <Text style={[styles.termsSectionSubtitle, { color: theme.textDark }]}>Prioritas layanan cases (Towing, ERA Service car & motorcycle)</Text>
          
          <View style={styles.termsSubSection}>
            <Text style={[styles.termsSubTitle, { color: theme.textDark }]}>• Layanan Darurat Towing di Jalan (Mogok)</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- Laka (wajib clear TKP, Pihak ke 3, penggantian, diluar tol)</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- LAYANAN BANJIR HANYA PASCA BANJIR</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- Jeep std, Sedan std, SUV std</Text>
          </View>
          
          <View style={styles.termsSubSection}>
            <Text style={[styles.termsSubTitle, { color: theme.textDark }]}>• ERA 24 Jam</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- Jumper start</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- Lock Switch</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- Tire</Text>
            <Text style={[styles.termsText, { color: theme.textLight }]}>- Gasoline</Text>
          </View>
        </View>
        
        <View style={styles.termsSection}>
          <View style={styles.termsSectionHeader}>
            <AlertTriangle size={18} color={theme.danger} />
            <Text style={[styles.termsSectionTitle, { color: theme.danger }]}>2. Tidak Melayani Cases</Text>
          </View>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• BKL ke BKL / sebaliknya</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Rumah ke BKL / sebaliknya</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Showroom ke rumah / sebaliknya</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Diluar cases darurat/era/emergency/accident</Text>
          <Text style={[styles.termsNote, { color: theme.warning }]}>*Kecuali special cases/VVIP dan harus jadwal H-1 dengan cover note</Text>
        </View>
        
        <View style={styles.termsSection}>
          <View style={styles.termsSectionHeader}>
            <Clock size={18} color={theme.warning} />
            <Text style={[styles.termsSectionTitle, { color: theme.warning }]}>3. Extra Ordinary</Text>
          </View>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Derek kecelakaan berat / masuk jurang</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Terkunci roda & matic</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Basement</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• Truk & bis</Text>
          <Text style={[styles.termsText, { color: theme.textLight }]}>• EV (mobil listrik) SER</Text>
          <Text style={[styles.termsNote, { color: theme.warning }]}>(Masuk layanan umum)</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: "Member Asuransi",
          headerTitleStyle: {
            fontWeight: "600" as const,
            color: theme.textDark,
          },
          headerStyle: {
            backgroundColor: theme.card,
          },
          headerTintColor: theme.textDark,
        }} 
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textDark }]}>Member Asuransi</Text>
          <Text style={[styles.subtitle, { color: theme.textLight }]}>
            Layanan derek khusus untuk member asuransi dengan benefit eksklusif
          </Text>
        </View>
        
        <Card style={[styles.mainCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.iconContainer}>
            <Shield size={64} color={theme.primary} />
          </View>
          
          <Text style={[styles.mainTitle, { color: theme.textDark }]}>Layanan Member Asuransi</Text>
          <Text style={[styles.mainDescription, { color: theme.textLight }]}>
            Hubungi kami melalui chat untuk mendapatkan layanan khusus member asuransi Anda. 
            Tim kami siap membantu verifikasi dan memberikan akses ke layanan eksklusif.
          </Text>
          
          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={theme.success} />
              <Text style={[styles.benefitText, { color: theme.textDark }]}>Prioritas layanan pelanggan 24/7</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={theme.success} />
              <Text style={[styles.benefitText, { color: theme.textDark }]}>Harga khusus member asuransi</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={theme.success} />
              <Text style={[styles.benefitText, { color: theme.textDark }]}>Bonus diskon dan benefit eksklusif</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={theme.success} />
              <Text style={[styles.benefitText, { color: theme.textDark }]}>Verifikasi cepat dan mudah</Text>
            </View>
          </View>
          
          <Button
            title="Hubungi Kami via Chat"
            onPress={handleContactUs}
            variant="primary"
            size="large"
            icon={<MessageCircle color={theme.white} size={20} />}
            iconPosition="left"
            testID="btn-contact-insurance"
          />
        </Card>
        
        {renderTermsAndConditions()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  mainCard: {
    padding: 24,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 20,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
    marginBottom: 12,
    textAlign: 'center',
  },
  mainDescription: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  benefitsList: {
    width: '100%',
    gap: 16,
    marginBottom: 24,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  termsCard: {
    marginTop: 16,
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  termsTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    flex: 1,
  },
  termsContent: {
    gap: 20,
  },
  termsSection: {
    gap: 12,
  },
  termsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  termsSectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  termsSectionSubtitle: {
    fontSize: 14,
    fontWeight: "500" as const,
    marginBottom: 8,
    fontStyle: 'italic' as const,
  },
  termsSubSection: {
    marginLeft: 16,
    gap: 4,
  },
  termsSubTitle: {
    fontSize: 14,
    fontWeight: "500" as const,
    marginBottom: 4,
  },
  termsText: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 8,
  },
  termsNote: {
    fontSize: 12,
    fontStyle: 'italic' as const,
    marginTop: 4,
    marginLeft: 8,
  },
});
