import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Driveverse",
};

const LAST_UPDATED = "August 17, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Driveverse Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p className="legal-intro">
        Driveverse (&ldquo;we,&rdquo; &ldquo;our,&rdquo; &ldquo;the app&rdquo;) is a social
        driving app that helps drivers track trips, discover places, and connect with
        other drivers. This policy explains what data we collect, why, and how it&rsquo;s
        handled.
      </p>

      <h2>Information We Collect</h2>
      <p>
        <strong>Account information</strong>: name, email or phone number, profile
        photo, and any information you add to your profile (bio, vehicle details).
      </p>
      <p>
        <strong>Location data</strong>: Driveverse collects GPS location data to show
        your position on the live map and to record your trips &mdash; distance,
        route, and speed. Location is collected only while the app is open and in the
        foreground; Driveverse does not collect your location in the background. You
        can turn off live location sharing at any time from the in-app visibility
        toggle, which stops other drivers from seeing your position on the map. Trip
        recording itself still requires location access to function while a drive is
        in progress.
      </p>
      <p>
        <strong>Trip and driving data</strong>: recorded routes, distance, duration,
        speed, and any trip data you choose to save or share.
      </p>
      <p>
        <strong>Garage and vehicle data</strong>: information and photos you add about
        your vehicles.
      </p>
      <p>
        <strong>Social and communication data</strong>: messages sent through in-app
        chat, convoy/event participation, friend connections, and content you post
        (including places you save or submit).
      </p>
      <p>
        <strong>Places data</strong>: nearby places (cafes, gas stations, workshops,
        and similar) are shown using Mapbox&rsquo;s place-search data; places you
        submit yourself are stored separately and attributed to you.
      </p>
      <p>
        <strong>AI car images</strong>: if you use the &ldquo;Generate My Car&rdquo;
        or Platinum showcase features, the photo you provide is sent to our AI image
        provider to generate a stylized render, and the result is stored to your
        garage or showcase. See &ldquo;Third-Party Services&rdquo; below.
      </p>
      <p>
        <strong>Subscription and purchase data</strong>: if you subscribe to
        Driveverse Platinum, your purchase and subscription status is processed by
        the Apple App Store or Google Play and shared with us via RevenueCat so we
        can activate your entitlements. We do not receive or store your payment card
        details &mdash; those are handled entirely by Apple or Google.
      </p>
      <p>
        <strong>Crash diagnostics</strong>: if the app encounters an unexpected error,
        a diagnostic report is written to your device&rsquo;s local storage so it can
        be shown to you on the next launch. This report stays on your device &mdash;
        we do not automatically receive it unless you choose to copy and send it to
        us for support.
      </p>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>
          To provide core app functionality: trip recording, maps, social features,
          quests, and rankings.
        </li>
        <li>
          To show your position to other drivers only when you&rsquo;ve enabled
          location sharing/visibility.
        </li>
        <li>To process subscription purchases and manage Platinum entitlements.</li>
        <li>To communicate with you about your account or app updates.</li>
        <li>To maintain app security, diagnose issues, and prevent abuse.</li>
      </ul>

      <h2>Third-Party Services</h2>
      <p>Driveverse uses the following third-party services, each with their own privacy practices:</p>
      <ul>
        <li><strong>Supabase</strong> &mdash; backend database and authentication.</li>
        <li><strong>Mapbox</strong> &mdash; map rendering, route display, and nearby-place search.</li>
        <li>
          <strong>Google Gemini (via Rork Toolkit), with OpenRouter as a fallback</strong>
          {" "}&mdash; generates the stylized AI render when you use &ldquo;Generate My
          Car&rdquo; or a Platinum showcase; the photo you submit for that feature is
          sent to this provider to produce the image.
        </li>
        <li><strong>RevenueCat</strong> &mdash; subscription and entitlement management.</li>
        <li>
          <strong>Apple App Store / Google Play Billing</strong> &mdash; payment
          processing for subscriptions.
        </li>
      </ul>

      <h2>Your Rights and Choices</h2>
      <ul>
        <li>You can access and edit your profile information within the app.</li>
        <li>
          You can delete your account at any time from your Profile &rarr;
          Delete Account. This is self-service and immediate &mdash; it does
          not require contacting support.
        </li>
        <li>You can disable location visibility to other drivers at any time via the in-app toggle.</li>
        <li>You can control notification permissions through your device settings.</li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        We retain your data for as long as your account is active, or as needed to
        provide the app&rsquo;s features. When you delete your account, your profile,
        trips, cars, messages, saved places, friends, convoys, and quest progress are
        permanently deleted immediately as part of that request &mdash; there is no
        waiting period. A small number of encrypted infrastructure backups may
        persist briefly afterward as part of our hosting provider&rsquo;s routine
        backup rotation; these are not used to restore or reconstruct a deleted
        account.
      </p>

      <h2>Children&rsquo;s Privacy</h2>
      <p>
        Driveverse is not intended for use by children under 13 (or the minimum age
        required by your local law, whichever is higher). We do not knowingly collect
        data from children under this age.
      </p>

      <h2>International Users and Indonesian Compliance</h2>
      <p>
        Driveverse is developed and operated with attention to Indonesia&rsquo;s
        Personal Data Protection Law (UU PDP, Law No. 27/2022). Users in Indonesia
        have rights under this law regarding their personal data, including the right
        to access, correct, and request deletion of their data.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be
        reflected with an updated &ldquo;Last updated&rdquo; date, and significant
        changes may be communicated in-app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data can be sent to{" "}
        <a href="mailto:support@driverse.id">support@driverse.id</a>.
      </p>
    </LegalPage>
  );
}
