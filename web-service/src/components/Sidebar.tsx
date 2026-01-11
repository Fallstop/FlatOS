"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions";
import {
    Home,
    CreditCard,
    Users,
    Calendar,
    Settings,
    LogOut,
    Menu,
    X,
    Wallet,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
}

const navItems: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <Home className="w-5 h-5" /> },
    { href: "/balances", label: "Balances", icon: <Wallet className="w-5 h-5" /> },
    { href: "/transactions", label: "Transactions", icon: <CreditCard className="w-5 h-5" /> },
    { href: "/schedule", label: "Payment Schedule", icon: <Calendar className="w-5 h-5" />, adminOnly: true },
    { href: "/users", label: "Flatmates", icon: <Users className="w-5 h-5" />, adminOnly: true },
    { href: "/settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

interface SidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        role?: "admin" | "user";
    };
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const isAdmin = user.role === "admin";

    const filteredNavItems = navItems.filter(
        (item) => !item.adminOnly || isAdmin
    );

    return (
        <>
            {/* Mobile menu button */}
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-800 border border-slate-700"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-800/80 backdrop-blur-xl
          border-r border-slate-700/50 flex flex-col z-50
          transform transition-transform duration-300 lg:transform-none
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-700/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                                <Home className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-bold text-lg gradient-text">FlatOS</h1>
                                <p className="text-xs text-slate-500">Shared Finances</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setMobileOpen(false)}
                            className="lg:hidden p-1 rounded-lg hover:bg-slate-700"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {filteredNavItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                  ${isActive
                                        ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-white border border-emerald-500/30"
                                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                                    }
                `}
                            >
                                {item.icon}
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* User section */}
                <div className="p-3 border-t border-slate-700/50">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30">
                        {user.image ? (
                            <img
                                src={user.image}
                                alt={user.name || "User"}
                                className="w-10 h-10 rounded-full border-2 border-slate-600"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
                                {user.name?.[0] || "U"}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{user.name}</p>
                            <p className="text-xs text-slate-500 truncate">{user.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOutAction()}
                        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
