import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/signin");
    }

    return (
        <div className="flex flex-col lg:flex-row min-h-screen bg-slate-900">
            <Sidebar user={session.user} />
            <main className="flex-1 min-w-0 overflow-auto lg:h-screen lg:flex lg:flex-col">
                <div className="p-4 lg:p-8 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
                    {children}
                </div>
            </main>
        </div>
    );
}
