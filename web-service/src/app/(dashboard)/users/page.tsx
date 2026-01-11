import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, paymentSchedules, transactions } from "@/lib/db/schema";
import { desc, and, lte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UserPlus, Building2, DollarSign } from "lucide-react";
import { AddFlatmateDialog } from "./AddFlatmateDialog";
import { FlatmateCard } from "./FlatmateCard";
import { RematchButton } from "./RematchButton";

export default async function UsersPage() {
    const session = await auth();

    if (!session?.user || session.user.role !== "admin") {
        redirect("/");
    }

    // Get all flatmates (including admin)
    const flatmates = await db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt));

    // Get current payment schedules for each user
    const now = new Date();
    const currentSchedules = await db
        .select()
        .from(paymentSchedules)
        .where(
            and(
                lte(paymentSchedules.startDate, now),
                sql`(${paymentSchedules.endDate} IS NULL OR ${paymentSchedules.endDate} >= ${now.getTime()})`
            )
        );

    // Get payment counts per user (for stats)
    const paymentCounts = await db
        .select({
            userId: transactions.matchedUserId,
            count: sql<number>`count(*)`,
            total: sql<number>`sum(amount)`,
        })
        .from(transactions)
        .where(sql`${transactions.matchedUserId} IS NOT NULL`)
        .groupBy(transactions.matchedUserId);

    // Create a map for quick lookup
    const scheduleMap = new Map(
        currentSchedules.map((s) => [s.userId, s])
    );
    const paymentMap = new Map(
        paymentCounts.map((p) => [p.userId, p])
    );

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Flatmate Management</h1>
                    <p className="text-slate-400 mt-1">
                        Add and manage flatmates who can access the shared account
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <RematchButton />
                    <AddFlatmateDialog />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/20">
                            <UserPlus className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{flatmates.length}</p>
                            <p className="text-sm text-slate-400">Active Flatmates</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/20">
                            <Building2 className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">
                                {flatmates.filter((f) => f.bankAccountPattern).length}
                            </p>
                            <p className="text-sm text-slate-400">Linked Accounts</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-teal-500/20">
                            <DollarSign className="w-5 h-5 text-teal-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">
                                ${currentSchedules.reduce((sum, s) => sum + s.weeklyAmount, 0).toFixed(0)}
                            </p>
                            <p className="text-sm text-slate-400">Weekly Total</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Flatmates List */}
            {flatmates.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                        <UserPlus className="w-8 h-8 text-slate-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No flatmates yet</h3>
                    <p className="text-slate-400 mb-6 max-w-sm mx-auto">
                        Add your flatmates by their email address. They&apos;ll be able to sign in with Google
                        once added.
                    </p>
                    <AddFlatmateDialog />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {flatmates.map((flatmate) => (
                        <FlatmateCard
                            key={flatmate.id}
                            flatmate={flatmate}
                            currentSchedule={scheduleMap.get(flatmate.id)}
                            paymentStats={paymentMap.get(flatmate.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
