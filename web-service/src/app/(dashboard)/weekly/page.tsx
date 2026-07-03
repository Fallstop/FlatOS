import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { calculateAllBalances } from "@/lib/calculations";
import { pivotToWeeklyView } from "@/lib/weekly-view";
import { PaymentSummaryStats, NoPaymentData } from "@/components/PaymentSummaryStats";
import { WeeklyViewClient } from "./WeeklyViewClient";

export default async function WeeklyPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/auth/signin");
    }

    const summary = await calculateAllBalances();
    const weeklyRows = pivotToWeeklyView(summary.flatmates);

    // Get flatmate names for column headers
    const flatmateNames = summary.flatmates.map((f) => ({
        userId: f.userId,
        userName: f.userName,
    }));

    if (summary.flatmates.length === 0) {
        return <NoPaymentData />;
    }

    return (
        <div className="max-w-full w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Weekly Overview</h1>
                <p className="text-slate-400 mt-1">
                    All flatmate payments by week
                </p>
            </div>

            <PaymentSummaryStats
                totalDue={summary.totalDue}
                totalPaid={summary.totalPaid}
                totalBalance={summary.totalBalance}
            />

            {/* Weekly Rows */}
            <WeeklyViewClient rows={weeklyRows} flatmateNames={flatmateNames} />
        </div>
    );
}
