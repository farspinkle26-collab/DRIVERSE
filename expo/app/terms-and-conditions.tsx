import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Shield } from "lucide-react-native";
import { useTheme } from "@/hooks/useThemeStore";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";

export default function TermsAndConditionsScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Terms and Conditions",
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.textDark,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <ArrowLeft size={24} color={theme.textDark} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Shield size={48} color={theme.primary} />
          <Text style={[styles.title, { color: theme.textDark }]}>
            Terms and Conditions
          </Text>
          <Text style={[styles.subtitle, { color: theme.textLight }]}>
            For Towing Companies
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            1. ACCEPTANCE OF TERMS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            By registering as a towing company on the Towing Online platform, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use our services.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            2. COMPANY ELIGIBILITY
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            To register as a towing company, you must:
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Be a legally registered business entity
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Hold all necessary licenses and permits for towing operations
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Have valid business insurance coverage
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Maintain a fleet of properly registered and insured vehicles
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Employ qualified and licensed drivers
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            3. REGISTRATION AND VERIFICATION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.1. You must provide accurate, complete, and current information during registration.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.2. All documents submitted must be authentic and valid.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.3. Towing Online reserves the right to verify all information and documents.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.4. False information may result in immediate termination of your account.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            4. SERVICE OBLIGATIONS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            As a registered towing company, you agree to:
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Provide professional and timely towing services
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Maintain service quality standards set by Towing Online
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Respond to service requests within agreed timeframes
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Ensure driver safety and professional conduct
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Handle customer vehicles with care and responsibility
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Report incidents and issues promptly
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            5. DRIVER MANAGEMENT
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.1. You are responsible for all drivers operating under your company account.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.2. All drivers must have valid licenses and proper training.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.3. You must conduct background checks on all drivers.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.4. Driver misconduct may result in company account penalties.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            6. FINANCIAL TERMS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            6.1. Commission of 15% applies to all completed services.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            6.2. Payments processed according to selected settlement schedule.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            6.3. You are responsible for your own tax obligations.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            6.4. Refunds and disputes handled according to platform policies.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            7. PROHIBITED ACTIVITIES
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            You may not:
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Solicit customers outside the platform
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Manipulate pricing or service ratings
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Share account access with unauthorized parties
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Engage in discriminatory practices
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Violate any applicable laws or regulations
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            8. DATA PROTECTION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            8.1. You must protect customer data and privacy.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            8.2. Customer information may only be used for service provision.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            8.3. Data breaches must be reported immediately.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            8.4. Comply with all data protection regulations.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            9. LIABILITY AND INSURANCE
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            9.1. You are liable for damages during service provision.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            9.2. Maintain adequate insurance coverage at all times.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            9.3. Indemnify Towing Online against claims arising from your services.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            9.4. Report insurance claims within 24 hours.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            10. TERMINATION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            10.1. Either party may terminate with 30 days written notice.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            10.2. Immediate termination for serious violations.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            10.3. Outstanding obligations survive termination.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            10.4. Return of platform property upon termination.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            11. MODIFICATIONS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            11.1. Towing Online may modify these terms with 30 days notice.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            11.2. Continued use constitutes acceptance of modified terms.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            11.3. Material changes require explicit consent.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            12. GOVERNING LAW
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            12.1. These terms are governed by Indonesian law.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            12.2. Disputes resolved through Jakarta courts.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            12.3. Mandatory arbitration for commercial disputes.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            13. CONTACT INFORMATION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            For questions about these terms, contact:
            {"\n"}Email: legal@towingonline.id
            {"\n"}Phone: +62 21 1234 5678
            {"\n"}Address: Jakarta, Indonesia
          </Text>
        </View>

        <View style={[styles.effectiveDate, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.effectiveText, { color: theme.textLight }]}>
            Effective Date: January 1, 2024
          </Text>
          <Text style={[styles.effectiveText, { color: theme.textLight }]}>
            Last Updated: January 1, 2024
          </Text>
        </View>

        <View style={styles.footer}>
          <Button
            title="I Agree"
            onPress={() => router.back()}
            variant="primary"
            size="large"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  },
  listItem: {
    fontSize: 14,
    lineHeight: 22,
    marginLeft: 8,
    marginBottom: 4,
  },
  effectiveDate: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  effectiveText: {
    fontSize: 12,
    marginVertical: 2,
  },
  footer: {
    padding: 20,
  },
});