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
            For Driverse App Users
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            1. ACCEPTANCE OF TERMS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            By creating an account and using the Driverse app, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use our services.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            2. ACCOUNT ELIGIBILITY
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            To use Driverse, you must:
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Be at least 17 years old or the legal driving age in your country
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Provide accurate and complete registration information
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Maintain the security of your account credentials
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            3. USE OF THE APP
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.1. Driverse provides features including Garage, Community, Events, Map/Navigation, and access to partner services such as insurance membership and official brand (ATPM) requests.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.2. You must provide accurate, complete, and current information when using these features.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            3.3. Driverse reserves the right to verify submitted information and to suspend accounts that provide false information.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            4. USER CONDUCT
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            As a Driverse user, you agree to:
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Use the app responsibly and in accordance with applicable law
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Respect other members of the community, events, and convoys
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Report incidents or issues promptly through the appropriate feature
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            5. WALLET AND TRANSACTIONS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.1. Top-ups and payments made through the in-app wallet are subject to the payment provider's terms.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.2. You are responsible for reviewing your transaction history for accuracy.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            5.3. Refunds and disputes are handled according to platform policies.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            6. PROHIBITED ACTIVITIES
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            You may not:
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Share your account access with unauthorized parties
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Manipulate ratings, reviews, or community content
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Engage in discriminatory or harassing practices
          </Text>
          <Text style={[styles.listItem, { color: theme.textDark }]}>
            • Violate any applicable laws or regulations
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            7. DATA PROTECTION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            7.1. We protect your data and privacy in accordance with our Privacy Policy.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            7.2. Your information is only used to provide and improve app features.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            7.3. Data breaches will be reported in accordance with applicable law.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            8. TERMINATION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            8.1. Either party may terminate the account relationship at any time.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            8.2. We may immediately suspend accounts for serious violations of these terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            9. MODIFICATIONS
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            9.1. Driverse may update these terms from time to time.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            9.2. Continued use of the app constitutes acceptance of the modified terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            10. GOVERNING LAW
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            10.1. These terms are governed by Indonesian law.
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            10.2. Disputes are resolved through Jakarta courts.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            11. CONTACT INFORMATION
          </Text>
          <Text style={[styles.paragraph, { color: theme.textDark }]}>
            For questions about these terms, contact:
            {"\n"}Email: support@driverse.id
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
