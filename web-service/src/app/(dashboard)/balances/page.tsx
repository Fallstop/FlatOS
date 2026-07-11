import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { calculateAllBalances } from "@/lib/calculations";
import { getBalanceAudit } from "@/lib/audit";
import { AdminBalancesView } from "./AdminBalancesView";
import { BalanceAuditPanel } from "@/components/BalanceAuditPanel";
import { PaymentSummaryStats, NoPaymentData } from "@/components/PaymentSummaryStats";

export default async function BalancesPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/auth/signin");
    }

    // Everyone sees all flatmates for transparency
    const [summary, audit] = await Promise.all([calculateAllBalances(), getBalanceAudit()]);

    if (summary.flatmates.length === 0) {
        return <NoPaymentData />;
    }

    return (
        <div className="max-w-full w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Payment Balances</h1>
                <p className="text-slate-400 mt-1">
                    Track who&apos;s paid and who owes money
                </p>
            </div>

            <PaymentSummaryStats
                totalDue={summary.totalDue}
                totalPaid={summary.totalPaid}
                totalBalance={summary.totalBalance}
            />

            {/* Verifiability: sync health, unmatched deposits, data gaps */}
            <BalanceAuditPanel audit={audit} />

            {/* Balances View with Chart and Weekly History */}
            <AdminBalancesView
                flatmates={summary.flatmates}
                currentUserId={session.user.id}
            />
        </div>
    );
}
