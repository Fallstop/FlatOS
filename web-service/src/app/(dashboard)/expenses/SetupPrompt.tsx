"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Zap, ShoppingCart, Loader2, Check } from "lucide-react";
import { seedExpenseDataAction, rematchAllExpensesAction } from "@/lib/expense-actions";

interface SetupPromptProps {
    isAdmin: boolean;
}

export function SetupPrompt({ isAdmin }: SetupPromptProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [step, setStep] = useState<"idle" | "seeding" | "matching" | "done">("idle");
    const [error, setError] = useState<string | null>(null);

    const handleSetup = () => {
        if (!isAdmin) return;

        setError(null);
        startTransition(async () => {
            setStep("seeding");

            // Seed default categories and rules
            const seedResult = await seedExpenseDataAction();
            if (seedResult.error) {
                setError(seedResult.error);
                setStep("idle");
                return;
            }

            setStep("matching");

            // Rematch all existing transactions
            const matchResult = await rematchAllExpensesAction();
            if (matchResult.error) {
                setError(matchResult.error);
                setStep("idle");
                return;
            }

            setStep("done");

            // Refresh after a short delay
            setTimeout(() => {
                router.refresh();
            }, 1000);
        });
    };

    if (!isAdmin) {
        return (
            <div className="glass rounded-2xl p-8 text-center">
                <Receipt className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <h2 className="text-xl font-semibold mb-2">No Expense Categories</h2>
                <p className="text-slate-400">
                    Ask an admin to set up expense tracking categories and rules.
                </p>
            </div>
        );
    }

    return (
        <div className="glass rounded-2xl p-8">
            <div className="text-center mb-8">
                <Receipt className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
                <h2 className="text-xl font-semibold mb-2">Set Up Expense Tracking</h2>
                <p className="text-slate-400 max-w-md mx-auto">
                    Create default expense categories and matching rules to automatically
                    categorize your outgoing transactions.
                </p>
            </div>

            {/* Default Categories Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="p-4 rounded-xl bg-slate-800/50 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-amber-500/20">
                        <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <p className="font-medium">Power</p>
                        <p className="text-sm text-slate-400">
                            Mercury, Genesis, Contact, Flick, etc.
                        </p>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-800/50 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-emerald-500/20">
                        <ShoppingCart className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="font-medium">Groceries</p>
                        <p className="text-sm text-slate-400">
                            Countdown, New World, Pak&apos;nSave, etc.
                        </p>
                    </div>
                </div>
            </div>

            {/* Progress Steps */}
            {step !== "idle" && (
                <div className="mb-6 space-y-2">
                    <div className="flex items-center gap-3">
                        {step === "seeding" ? (
                            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                        ) : (
                            <Check className="w-5 h-5 text-emerald-400" />
                        )}
                        <span className={step === "seeding" ? "text-white" : "text-slate-400"}>
                            Creating categories and rules...
                        </span>
                    </div>
                    {(step === "matching" || step === "done") && (
                        <div className="flex items-center gap-3">
                            {step === "matching" ? (
                                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                            ) : (
                                <Check className="w-5 h-5 text-emerald-400" />
                            )}
                            <span className={step === "matching" ? "text-white" : "text-slate-400"}>
                                Matching existing transactions...
                            </span>
                        </div>
                    )}
                    {step === "done" && (
                        <div className="flex items-center gap-3">
                            <Check className="w-5 h-5 text-emerald-400" />
                            <span className="text-emerald-400">Setup complete!</span>
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/20 text-rose-400">
                    {error}
                </div>
            )}

            {/* Action Button */}
            <div className="text-center">
                <button
                    onClick={handleSetup}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Receipt className="w-5 h-5" />
                    )}
                    {step === "done" ? "Redirecting..." : "Set Up Default Categories"}
                </button>
            </div>
        </div>
    );
}
