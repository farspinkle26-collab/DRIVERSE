import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "EULA — Driveverse",
};

const LAST_UPDATED = "August 17, 2026";

export default function EulaPage() {
  return (
    <LegalPage title="Driveverse End User License Agreement (EULA)" lastUpdated={LAST_UPDATED}>
      <p className="legal-intro">
        This End User License Agreement (&ldquo;Agreement&rdquo;) is between you and
        the developer of Driveverse (&ldquo;we,&rdquo; &ldquo;us&rdquo;) and governs
        your use of the Driveverse mobile application (&ldquo;the App&rdquo;).
      </p>
      <p className="legal-intro">
        By downloading, installing, or using Driveverse, you agree to this Agreement.
        If you do not agree, do not use the App.
      </p>

      <h2>License Grant</h2>
      <p>
        We grant you a limited, non-exclusive, non-transferable, revocable license to
        use Driveverse on devices you own or control, solely for your personal,
        non-commercial use, subject to this Agreement and Apple&rsquo;s or
        Google&rsquo;s standard licensed application end user license agreement terms
        where applicable.
      </p>

      <h2>Restrictions</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Reverse engineer, decompile, or attempt to extract the source code of the
          App, except where permitted by law.
        </li>
        <li>Use the App for any unlawful purpose or in violation of any applicable driving/traffic laws.</li>
        <li>
          Use the App in a way that endangers yourself or others &mdash; Driveverse
          is not intended to be operated in a way that distracts from safe driving;
          features should be set up before driving or used only when safely parked.
        </li>
        <li>Interfere with or disrupt the App&rsquo;s functionality, servers, or networks.</li>
        <li>Impersonate another user or misuse another user&rsquo;s data or content.</li>
        <li>Use automated systems (bots) to interact with the App.</li>
      </ul>

      <h2>User Content</h2>
      <p>
        You retain ownership of content you submit (photos, trip data, places,
        messages), but grant us a license to store, display, and distribute that
        content within the App as necessary to provide the service (for example,
        showing your shared trip cards or submitted places to other users).
      </p>

      <h2>Subscriptions</h2>
      <p>
        Driveverse Platinum is offered as an auto-renewing subscription through the
        Apple App Store or Google Play, billed according to the terms presented at
        purchase. Subscriptions renew automatically unless canceled at least 24 hours
        before the end of the current period, through your Apple ID or Google Play
        account settings &mdash; we do not process cancellations directly. Refunds
        are handled according to Apple&rsquo;s or Google&rsquo;s respective refund
        policies, not by us directly.
      </p>

      <h2>Disclaimer of Warranties</h2>
      <p>
        The App is provided &ldquo;as is&rdquo; without warranties of any kind,
        express or implied. We do not guarantee the App will be uninterrupted,
        error-free, or that trip data (distance, speed, route accuracy) will be
        perfectly precise, as GPS accuracy can vary by device and conditions.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for any indirect,
        incidental, or consequential damages arising from your use of the App,
        including but not limited to damages related to driving incidents &mdash;
        the App is a tracking and social tool, not a driving aid, and safe driving
        remains entirely your responsibility.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or terminate your access to the App if you violate this
        Agreement. You may stop using the App and delete your account at any time
        from your Profile &rarr; Delete Account.
      </p>

      <h2>Governing Law</h2>
      <p>
        This Agreement is governed by the laws of Indonesia, without regard to
        conflict of law principles, except where superseded by Apple&rsquo;s or
        Google&rsquo;s standard EULA terms as applicable to your platform.
      </p>

      <h2>Changes to This Agreement</h2>
      <p>
        We may update this Agreement from time to time. Continued use of the App
        after changes constitutes acceptance of the updated Agreement.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this Agreement can be sent to{" "}
        <a href="mailto:support@driverse.id">support@driverse.id</a>.
      </p>
    </LegalPage>
  );
}
