import { getPayments, getProfiles } from "@/lib/queries";
import { SectionHeader, StatCard, ChartCard, Banner } from "@/components/ui";
import { RefreshButton } from "@/components/RefreshButton";
import { fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MonetizationPage() {
  const [payments, profiles] = await Promise.all([getPayments(), getProfiles()]);

  const paid = payments.rows.filter((p) => p.status === "paid");
  const revenue = paid.reduce((s, p) => s + (p.amount ?? 0), 0);
  const userCount = profiles.rows.length;
  const arpu = userCount > 0 ? revenue / userCount : 0;
  const currency = payments.rows.find((p) => p.currency)?.currency || "IDR";

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Monetization"
        description="Phase 2. Structure is in place so nothing needs restructuring once payments ship."
        right={<RefreshButton />}
      />

      <Banner tone="warning">
        <strong>Payments not yet live.</strong> These cards read real values from the existing{" "}
        <code>payment_transactions</code> table (towing-app scaffolding, currently unused for the
        gamification app), so they show genuine zeros/nulls today and will populate automatically
        when payments go live. There is no subscription table yet, so subscription metrics are N/A.
      </Banner>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Revenue (all time)" value={`${currency} ${fmtInt(revenue)}`} hint="status = paid" />
        <StatCard label="Paid transactions" value={fmtInt(paid.length)} hint={`of ${fmtInt(payments.rows.length)} total`} />
        <StatCard label="Active subscriptions" value="N/A" hint="no subscription table" />
        <StatCard label="ARPU" value={`${currency} ${fmtInt(arpu)}`} hint="revenue ÷ users" />
      </div>

      <ChartCard
        title="Revenue over time"
        subtitle="Will render once paid transactions exist"
        note="When payments ship, this section gains a revenue time-series and subscription/ARPU trends without restructuring — the data plumbing is already wired to payment_transactions."
      >
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline">
          <div className="text-3xl font-semibold tabular text-ink-muted">{currency} 0</div>
          <div className="text-sm text-ink-muted">No revenue recorded yet — payments not yet live.</div>
        </div>
      </ChartCard>
    </div>
  );
}
