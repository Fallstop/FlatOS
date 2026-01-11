import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, systemState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { User, Mail, Calendar, Shield, Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";
import { SettingsForm } from "./SettingsForm";
import { AnalysisStartDateForm } from "./AnalysisStartDateForm";

export default async function SettingsPage() {
    const session = await auth();
    
    if (!session?.user?.email) {
        redirect("/auth/signin");
    }

    const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.email, session.user.email))
        .limit(1);

    if (dbUser.length === 0) {
        redirect("/auth/signin");
    }

    const user = dbUser[0];
    const isAdmin = user.role === "admin";

    // Get analysis start date if admin
    let analysisStartDate: string | null = null;
    if (isAdmin) {
        const setting = await db
            .select()
            .from(systemState)
            .where(eq(systemState.key, "analysis_start_date"))
            .limit(1);
        analysisStartDate = setting[0]?.value ?? null;
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Account Settings</h1>
                <p className="text-slate-400 mt-1">Manage your account and preferences</p>
            </div>

            {/* Profile Section */}
            <div className="glass rounded-2xl overflow-hidden mb-6">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="font-semibold text-lg flex items-center gap-2">
                        <User className="w-5 h-5 text-emerald-400" />
                        Profile
                    </h2>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex items-center gap-4">
                        {session.user.image ? (
                            <Image
                                src={session.user.image}
                                alt={user.name || "Profile"}
                                width={64}
                                height={64}
                                className="rounded-full border-2 border-slate-600"
                                unoptimized
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold">
                                {user.name?.[0] || user.email[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-xl font-semibold">{user.name || "No name set"}</p>
                            <p className="text-slate-400">{user.email}</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-700/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-700/50">
                                <Shield className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Role</p>
                                <p className="font-medium capitalize">{user.role}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-700/50">
                                <Calendar className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Member Since</p>
                                <p className="font-medium">
                                    {user.createdAt 
                                        ? formatInTimeZone(user.createdAt, "Pacific/Auckland", "d MMM yyyy")
                                        : "Unknown"
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Matching Section */}
            <div className="glass rounded-2xl overflow-hidden mb-6">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="font-semibold text-lg flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-400" />
                        Payment Matching
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                        Configure how your transactions are automatically identified
                    </p>
                </div>
                <SettingsForm
                    initialValues={{
                        bankAccountPattern: user.bankAccountPattern,
                        cardSuffix: user.cardSuffix,
                        matchingName: user.matchingName,
                    }}
                />
            </div>

            {/* Account Info */}
            <div className="glass rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="font-semibold text-lg flex items-center gap-2">
                        <Mail className="w-5 h-5 text-purple-400" />
                        Account Details
                    </h2>
                </div>
                <div className="p-5">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-slate-700/50">
                            <Mail className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Email Address</p>
                            <p className="font-medium">{user.email}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                Connected via Google Sign-In
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Admin Settings */}
            {isAdmin && (
                <div className="glass rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-slate-700/50">
                        <h2 className="font-semibold text-lg flex items-center gap-2">
                            <Settings2 className="w-5 h-5 text-amber-400" />
                            Admin Settings
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            System-wide configuration
                        </p>
                    </div>
                    <AnalysisStartDateForm initialValue={analysisStartDate} />
                </div>
            )}
        </div>
    );
}
