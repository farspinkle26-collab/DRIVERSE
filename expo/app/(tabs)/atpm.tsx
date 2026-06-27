import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Alert, TouchableOpacity, Image } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useThemeStore";
import { useAuth } from "@/hooks/useAuthStore";
import Card from "@/components/Card";
import Input from "@/components/Input";
import Dropdown from "@/components/Dropdown";
import Button from "@/components/Button";
import { Send, Shield } from "lucide-react-native";
import { openAtpmWhatsApp } from "@/utils/whatsapp";

interface AtpmFormData {
  requestDate: string;
  caseNumber: string;
  requesterName: string;
  requesterBranch: string;
  customerName: string;
  customerPhone: string;
  vin: string;
  licensePlate: string;
  brand: string;
  model: string;
  productionYear: string;
  color: string;
  serviceType: string;
  address: string;
  issue: string;
  pickupAddress: string;
  pickupDateTime: string;
  deliveryAddress: string;
  category: string;
  vipBranch: string;
  billingTarget: string;
  agent: string;
  attachments: string;
}

const CATEGORY_OPTIONS = [
  { label: "Member", value: "member" },
  { label: "Non member / bersedia bayar cancel", value: "non_member" },
];

const SERVICE_OPTIONS = [
  { label: "Towing ke Nissan BSD", value: "Towing ke Nissan BSD" },
  { label: "Towing ke Bengkel Resmi", value: "Towing ke Bengkel Resmi" },
  { label: "Towing ke Rumah", value: "Towing ke Rumah" },
  { label: "Towing ke Indomobil Halim", value: "Towing ke Indomobil Halim" },
  { label: "Towing ke Indomobil BSD", value: "Towing ke Indomobil BSD" },
  { label: "Towing ke Indomobil TB Simatupang", value: "Towing ke Indomobil TB Simatupang" },
  { label: "Towing ke Indomobil Buncit", value: "Towing ke Indomobil Buncit" },
  { label: "Towing ke Indomobil K.Gading/Sedayu", value: "Towing ke Indomobil K.Gading/Sedayu" },
  { label: "Towing ke Indomobil PIK", value: "Towing ke Indomobil PIK" },
  { label: "Towing ke Indomobil MT Haryono", value: "Towing ke Indomobil MT Haryono" },
];

const ATPM_BRANDS = [
  {
    id: "cherry",
    name: "Cherry",
    logo: "https://logos-world.net/wp-content/uploads/2023/01/Chery-Logo.png"
  },
  {
    id: "byd",
    name: "BYD",
    logo: "https://logos-world.net/wp-content/uploads/2021/03/BYD-Logo.png"
  },
  {
    id: "hyundai",
    name: "Hyundai",
    logo: "https://logos-world.net/wp-content/uploads/2021/03/Hyundai-Logo.png"
  },
  {
    id: "wuling",
    name: "Wuling",
    logo: "https://logos-world.net/wp-content/uploads/2021/04/Wuling-Logo.png"
  },
  {
    id: "baic",
    name: "BAIC",
    logo: "https://logos-world.net/wp-content/uploads/2021/04/BAIC-Logo.png"
  },
  {
    id: "kia",
    name: "Kia",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Kia-Logo.png"
  },
  {
    id: "nissan",
    name: "Nissan",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Nissan-Logo.png"
  },
  {
    id: "datsun",
    name: "Datsun",
    logo: "https://logos-world.net/wp-content/uploads/2021/04/Datsun-Logo.png"
  },
  {
    id: "citroen",
    name: "Citroen",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Citroen-Logo.png"
  },
  {
    id: "vw",
    name: "Volkswagen",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Volkswagen-Logo.png"
  },
  {
    id: "audi",
    name: "Audi",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Audi-Logo.png"
  },
  {
    id: "landrover",
    name: "Land Rover",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Land-Rover-Logo.png"
  },
  {
    id: "jaguar",
    name: "Jaguar",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Jaguar-Logo.png"
  },
  {
    id: "aion",
    name: "Aion",
    logo: "https://logos-world.net/wp-content/uploads/2021/04/Aion-Logo.png"
  },
  {
    id: "harleydavidson",
    name: "Harley Davidson",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Harley-Davidson-Logo.png"
  },
  {
    id: "maxxus",
    name: "Maxxus",
    logo: "https://via.placeholder.com/100x100/333333/ffffff?text=MAXXUS"
  },
  {
    id: "jeep",
    name: "Jeep",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Jeep-Logo.png"
  },
  {
    id: "toyota",
    name: "Toyota",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Toyota-Logo.png"
  },
  {
    id: "honda",
    name: "Honda",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Honda-Logo.png"
  },
  {
    id: "mitsubishi",
    name: "Mitsubishi",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Mitsubishi-Logo.png"
  },
  {
    id: "suzuki",
    name: "Suzuki",
    logo: "https://logos-world.net/wp-content/uploads/2020/09/Suzuki-Logo.png"
  }
];

export default function AtpmScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }, []);

  const [form, setForm] = useState<AtpmFormData>({
    requestDate: today,
    caseNumber: "",
    requesterName: "",
    requesterBranch: "",
    customerName: "",
    customerPhone: "",
    vin: "",
    licensePlate: "",
    brand: "",
    model: "",
    productionYear: "",
    color: "",
    serviceType: "Towing ke Nissan BSD",
    address: "",
    issue: "",
    pickupAddress: "",
    pickupDateTime: "",
    deliveryAddress: "",
    category: "non_member",
    vipBranch: "",
    billingTarget: "Customer",
    agent: user?.name ?? "",
    attachments: "",
  });
  const [sending, setSending] = useState<boolean>(false);

  const onChange = <K extends keyof AtpmFormData>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): string[] => {
    const errors: string[] = [];
    if (!form.customerName.trim()) errors.push("Nama Pelanggan wajib diisi");
    if (!form.customerPhone.trim()) errors.push("No Telp Pelanggan wajib diisi");
    if (!form.brand.trim()) errors.push("Merk wajib diisi");
    if (!form.model.trim()) errors.push("Jenis Kendaraan wajib diisi");
    if (!form.serviceType.trim()) errors.push("Jenis Layanan wajib dipilih");
    if (!form.address.trim()) errors.push("Alamat wajib diisi");
    return errors;
  };

  const buildMessage = (): string => {
    const lines: string[] = [];
    lines.push("Form ATPM (branded Mbl)");
    lines.push("");
    lines.push(`${form.requestDate}`);
    lines.push(`Case : ${form.caseNumber || '-'}`);
    lines.push(`Nama Requestor : ${form.requesterName || '-'}`);
    lines.push(`Cabang Requestor: : ${form.requesterBranch || '-'}`);
    lines.push(`Nama Pelanggan : ${form.customerName || '-'}`);
    lines.push(`No Telp Pelanggan : ${form.customerPhone || '-'}`);
    lines.push(`No. Rangka : ${form.vin || '-'}`);
    lines.push(`No. Polisi : ${form.licensePlate || '-'}`);
    lines.push(`Merk  : ${form.brand || '-'}`);
    lines.push(`Jenis Kendaraan : ${form.model || '-'}`);
    lines.push(`Tahun Produksi : ${form.productionYear || '-'}`);
    lines.push(`Warna : ${form.color || '-'}`);
    lines.push(`Jenis Layanan : ${form.serviceType || '-'}`);
    lines.push(`Alamat : ${form.address || '-'}`);
    lines.push(`Kendala : ${form.issue || '-'}`);
    lines.push(`Alamat Pick Up : ${form.pickupAddress || '-'}`);
    lines.push(`Tanggal - Waktu Pick Up : ${form.pickupDateTime || '-'}`);
    lines.push(`Alamat Delivery : ${form.deliveryAddress || '-'}`);
    lines.push(`Kategori : ${form.category === 'member' ? 'Member' : 'Non member / bersedia bayar cancel'}`);
    lines.push(`Cabang VIP : ${form.vipBranch || '-'}`);
    lines.push(`Tujuan Penagihan : ${form.billingTarget || '-'}`);
    lines.push("");
    lines.push(`Agent : ${form.agent || '-'}`);
    if (form.attachments.trim()) {
      lines.push(`Attachments: ${form.attachments}`);
    } else {
      lines.push("Attachments:");
    }
    return lines.join("\n");
  };

  const handleSend = async () => {
    const errs = validate();
    if (errs.length > 0) {
      Alert.alert("Data belum lengkap", errs.join("\n"));
      return;
    }
    try {
      setSending(true);
      const msg = buildMessage();
      await openAtpmWhatsApp(msg);
    } catch (e) {
      console.error("ATPM send error", e);
      Alert.alert("Gagal", "Tidak dapat membuka WhatsApp. Coba lagi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: "ATPM",
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.textDark,
          headerTitleStyle: { fontWeight: "600" },
        }}
      />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Shield size={28} color={theme.primary} />
          <Text style={[styles.title, { color: theme.textDark }]}>Form ATPM</Text>
          <Text style={[styles.subtitle, { color: theme.textLight }]}>Verifikasi unit dan kirim ke WhatsApp</Text>
        </View>

        <Card style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Data Permintaan</Text>
          <Input label="Tanggal" value={form.requestDate} onChangeText={(v) => onChange("requestDate", v)} placeholder="MM/DD/YYYY" />
          <Input label="Case" value={form.caseNumber} onChangeText={(v) => onChange("caseNumber", v)} placeholder="Nomor Case" />
          <Input label="Nama Requestor" value={form.requesterName} onChangeText={(v) => onChange("requesterName", v)} placeholder="-" />
          <Input label="Cabang Requestor" value={form.requesterBranch} onChangeText={(v) => onChange("requesterBranch", v)} placeholder="-" />
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Data Pelanggan</Text>
          <Input label="Nama Pelanggan" value={form.customerName} onChangeText={(v) => onChange("customerName", v)} placeholder="Contoh: Bapak Rian" />
          <Input label="No Telp Pelanggan" value={form.customerPhone} onChangeText={(v) => onChange("customerPhone", v)} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" />
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Pilih Brand ATPM</Text>
          <View style={styles.brandsGrid}>
            {ATPM_BRANDS.map((brand) => (
              <TouchableOpacity
                key={brand.id}
                style={[
                  styles.brandCard,
                  {
                    backgroundColor: form.brand === brand.name ? theme.primary + '20' : theme.background,
                    borderColor: form.brand === brand.name ? theme.primary : theme.border
                  }
                ]}
                onPress={() => onChange("brand", brand.name)}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: brand.logo }}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
                <Text style={[
                  styles.brandName,
                  {
                    color: form.brand === brand.name ? theme.primary : theme.textDark
                  }
                ]}>
                  {brand.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Data Kendaraan</Text>
          <Input label="No. Rangka" value={form.vin} onChangeText={(v) => onChange("vin", v)} autoCapitalize="characters" />
          <Input label="No. Polisi" value={form.licensePlate} onChangeText={(v) => onChange("licensePlate", v)} autoCapitalize="characters" />
          <Input label="Merk" value={form.brand} onChangeText={(v) => onChange("brand", v)} placeholder="Pilih brand di atas atau ketik manual" />
          <Input label="Jenis Kendaraan / Model" value={form.model} onChangeText={(v) => onChange("model", v)} />
          <Input label="Tahun Produksi" value={form.productionYear} onChangeText={(v) => onChange("productionYear", v)} keyboardType="number-pad" />
          <Input label="Warna" value={form.color} onChangeText={(v) => onChange("color", v)} />
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Layanan & Alamat</Text>
          <Dropdown label="Jenis Layanan" value={form.serviceType} onChange={(v) => onChange("serviceType", v)} options={SERVICE_OPTIONS} placeholder="Pilih layanan" />
          <Input label="Alamat" value={form.address} onChangeText={(v) => onChange("address", v)} multiline />
          <Input label="Kendala" value={form.issue} onChangeText={(v) => onChange("issue", v)} multiline />
          <Input label="Alamat Pick Up" value={form.pickupAddress} onChangeText={(v) => onChange("pickupAddress", v)} multiline />
          <Input label="Tanggal - Waktu Pick Up" value={form.pickupDateTime} onChangeText={(v) => onChange("pickupDateTime", v)} placeholder="DD/MM/YYYY HH:mm" />
          <Input label="Alamat Delivery" value={form.deliveryAddress} onChangeText={(v) => onChange("deliveryAddress", v)} multiline />
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Lainnya</Text>
          <Dropdown label="Kategori" value={form.category} onChange={(v) => onChange("category", v)} options={CATEGORY_OPTIONS} placeholder="Pilih kategori" />
          <Input label="Cabang VIP" value={form.vipBranch} onChangeText={(v) => onChange("vipBranch", v)} placeholder="-" />
          <Input label="Tujuan Penagihan" value={form.billingTarget} onChangeText={(v) => onChange("billingTarget", v)} placeholder="Customer" />
          <Input label="Agent" value={form.agent} onChangeText={(v) => onChange("agent", v)} placeholder="Nama agent" />
          <Input label="Attachments (opsional)" value={form.attachments} onChangeText={(v) => onChange("attachments", v)} placeholder="Link foto / catatan" />
          <Button title="Kirim Verifikasi via WhatsApp" onPress={handleSend} variant="primary" size="large" icon={<Send color={theme.white} size={18} />} testID="btn-send-atpm-wa" loading={sending} />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16 },
  header: { marginBottom: 16, gap: 6, flexDirection: "row", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14 },
  card: { padding: 16, borderWidth: 1, borderRadius: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  brandsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  brandCard: {
    width: "30%",
    aspectRatio: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  brandLogo: {
    width: 40,
    height: 40,
  },
  brandName: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});