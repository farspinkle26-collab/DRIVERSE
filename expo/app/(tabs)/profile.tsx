import React, { useState } from "react";
import { StyleSheet, Text, View, Image, ScrollView, Alert, Switch, Platform, TouchableOpacity, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { 
  Phone, 
  Mail, 
  Shield, 
  Settings, 
  HelpCircle, 
  LogOut,
  Moon,
  Sun,
  Camera,
  User,
  Headphones,
  RefreshCw,
  Truck,
  UserCheck,
  CreditCard
} from "lucide-react-native";
import Card from "@/components/Card";
import Button from "@/components/Button";
import ImagePicker from "@/components/ImagePicker";
import { useAuth } from "@/hooks/useAuthStore";
import { useTheme } from "@/hooks/useThemeStore";
import { useRouter } from "expo-router";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, updateProfilePicture, switchAccountType, isCustomer, isDriver = false } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showImagePicker, setShowImagePicker] = useState<boolean>(false);
  const [switchingAccount, setSwitchingAccount] = useState<boolean>(false);

  const handleLogout = () => {
    Alert.alert(
      "Keluar",
      "Apakah Anda yakin ingin keluar?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Keluar",
          onPress: async () => {
            const success = await logout();
            if (success) {
              router.replace('/(tabs)/home' as any);
            } else {
              Alert.alert("Error", "Gagal keluar. Silakan coba lagi.");
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  const handleProfilePictureChange = async (imageUri: string | null) => {
    if (imageUri) {
      const success = await updateProfilePicture(imageUri);
      if (success) {
        Alert.alert("Berhasil", "Foto profil berhasil diperbarui");
      } else {
        Alert.alert("Gagal", "Gagal memperbarui foto profil");
      }
    }
    setShowImagePicker(false);
  };

  const handleChangeProfilePicture = () => {
    setShowImagePicker(true);
  };

  const handleCustomerService = () => {
    const phoneNumber = "+021789000";
    const url = `tel:${phoneNumber}`;
    
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          Alert.alert(
            "Tidak dapat membuka aplikasi telepon",
            `Silakan hubungi Customer Service di: ${phoneNumber}`,
            [{ text: "OK" }]
          );
        }
      })
      .catch((err) => {
        console.error('Error opening phone app:', err);
        Alert.alert(
          "Error",
          `Silakan hubungi Customer Service di: ${phoneNumber}`,
          [{ text: "OK" }]
        );
      });
  };

  const handleSwitchAccountType = () => {
    const currentType = isCustomer ? "Pelanggan" : "Driver";
    const newType = isCustomer ? "Driver" : "Pelanggan";
    
    Alert.alert(
      "Ganti Tipe Akun",
      `Apakah Anda yakin ingin beralih dari ${currentType} ke ${newType}?\n\nAnda akan tetap menggunakan email yang sama, hanya tipe akun yang berubah.`,
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Ganti",
          onPress: async () => {
            setSwitchingAccount(true);
            const success = await switchAccountType();
            setSwitchingAccount(false);
            
            if (success) {
              Alert.alert(
                "Berhasil",
                `Tipe akun berhasil diubah ke ${newType}. Selamat datang!`
              );
            } else {
              Alert.alert(
                "Gagal",
                "Gagal mengubah tipe akun. Silakan coba lagi."
              );
            }
          },
          style: "default",
        },
      ]
    );
  };



  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={{
        paddingBottom: Platform.OS === 'android' ? 90 + insets.bottom + 20 : 110
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity 
          style={[styles.avatarContainer, { borderColor: theme.primary }]}
          onPress={handleChangeProfilePicture}
          activeOpacity={0.7}
        >
          {user?.profilePicture ? (
            <Image
              source={{ uri: user.profilePicture }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: '#E5E5E5' }]}>
              <User size={40} color="#9CA3AF" />
            </View>
          )}
          <View style={[styles.cameraIcon, { backgroundColor: theme.primary }]}>
            <Camera size={16} color={theme.white} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.name, { color: theme.textDark }]}>{user?.name || "User"}</Text>
        <View style={[styles.roleContainer, { backgroundColor: theme.primary + "20" }]}>
          <View style={styles.roleContent}>
            {isCustomer ? (
              <UserCheck size={16} color={theme.primary} />
            ) : (
              <Truck size={16} color={theme.primary} />
            )}
            <Text style={[styles.role, { color: theme.primary }]}>
              {isCustomer ? "Pelanggan" : "Driver"}
            </Text>
          </View>
        </View>
        <Button
          title={`Ganti ke ${isCustomer ? "Driver" : "Pelanggan"}`}
          onPress={handleSwitchAccountType}
          variant="outline"
          size="small"
          style={[styles.switchButton, { borderColor: theme.primary }]}
          textStyle={{ color: theme.primary, fontSize: 12 }}
          icon={<RefreshCw size={14} color={theme.primary} />}
          loading={switchingAccount}
          disabled={switchingAccount}
        />
      </View>

      {showImagePicker && (
        <View style={styles.imagePickerContainer}>
          <ImagePicker
            label="Foto Profil"
            placeholder="Pilih foto profil"
            value={null}
            onChange={handleProfilePictureChange}
          />
          <Button
            title="Batal"
            onPress={() => setShowImagePicker(false)}
            variant="outline"
            size="small"
            style={styles.cancelButton}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Informasi Pribadi</Text>
        <Card style={[styles.infoCard, { backgroundColor: theme.card }]}>
          <View style={styles.infoItem}>
            <View style={[styles.infoIcon, { backgroundColor: theme.primary + "20" }]}>
              <Phone size={20} color={theme.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textLight }]}>Nomor Telepon</Text>
              <Text style={[styles.infoValue, { color: theme.textDark }]}>{user?.phone || "+62812345678"}</Text>
            </View>
          </View>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <View style={styles.infoItem}>
            <View style={[styles.infoIcon, { backgroundColor: theme.primary + "20" }]}>
              <Mail size={20} color={theme.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textLight }]}>Email</Text>
              <Text style={[styles.infoValue, { color: theme.textDark }]}>{user?.email || "user@example.com"}</Text>
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Pengaturan</Text>
        <Card style={[styles.settingsCard, { backgroundColor: theme.card }]}>
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
              {isDark ? <Moon size={20} color={theme.primary} /> : <Sun size={20} color={theme.primary} />}
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: theme.textDark }]}>Mode Gelap</Text>
              <Text style={[styles.settingSubtitle, { color: theme.textLight }]}>Beralih antara tema terang dan gelap</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.inactive, true: theme.primary }}
              thumbColor={theme.white}
            />
          </View>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
              <Shield size={20} color={theme.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: theme.textDark }]}>Privasi & Keamanan</Text>
            </View>
          </View>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
              <Settings size={20} color={theme.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: theme.textDark }]}>Pengaturan Aplikasi</Text>
            </View>
          </View>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <TouchableOpacity style={styles.settingItem} onPress={handleCustomerService}>
            <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
              <Headphones size={20} color={theme.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: theme.textDark }]}>Customer Service</Text>
              <Text style={[styles.settingSubtitle, { color: theme.textLight }]}>Hubungi +021 789000</Text>
            </View>
          </TouchableOpacity>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <TouchableOpacity 
            style={styles.settingItem} 
            onPress={() => router.push('/xendit-integration-demo' as any)}
          >
            <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
              <CreditCard size={20} color={theme.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: theme.textDark }]}>Xendit Payment Demo</Text>
              <Text style={[styles.settingSubtitle, { color: theme.textLight }]}>Test payment integration</Text>
            </View>
          </TouchableOpacity>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
              <HelpCircle size={20} color={theme.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: theme.textDark }]}>Bantuan & Dukungan</Text>
            </View>
          </View>
        </Card>
      </View>

      <Button
        title="Keluar"
        onPress={handleLogout}
        variant="outline"
        size="medium"
        style={[styles.logoutButton, { borderColor: theme.danger }]}
        textStyle={[styles.logoutButtonText, { color: theme.danger }]}
        icon={<LogOut size={20} color={theme.danger} />}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: "center",
    marginVertical: 24,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    borderWidth: 3,
    position: "relative",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  imagePickerContainer: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  cancelButton: {
    marginTop: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  roleContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  roleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  role: {
    fontSize: 14,
    fontWeight: "500",
  },
  switchButton: {
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  infoCard: {
    padding: 0,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  divider: {
    height: 1,
  },
  settingsCard: {
    padding: 0,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  settingSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  logoutButton: {
    marginTop: 8,
    marginBottom: 32,
  },
  logoutButtonText: {
    // Color will be set dynamically
  },
});