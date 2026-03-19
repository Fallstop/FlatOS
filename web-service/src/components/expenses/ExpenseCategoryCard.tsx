import Link from "next/link";
import { Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ExpenseCategory } from "@/lib/db/schema";
import { expenseIconMap, getColorClasses } from "@/lib/expense-ui";

function CategoryIcon({ iconName, className }: { iconName: string; className: string }) {
    const Icon: LucideIcon = expenseIconMap[iconName] || Tag;
    return <Icon className={className} />;
}

interface ExpenseCategoryCardProps {
    category: ExpenseCategory;
    totalAmount: number;
    isSelected?: boolean;
    href?: string;
    subtitle?: string;
}

export function ExpenseCategoryCard({
    category,
    totalAmount,
    isSelected,
    href,
    subtitle,
}: ExpenseCategoryCardProps) {
    const colors = getColorClasses(category.color);

    const content = (
        <>
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <CategoryIcon iconName={category.icon} className={`w-4 h-4 ${colors.text}`} />
                </div>
                <h3 className="font-semibold">{category.name}</h3>
            </div>

            {/* Monthly rate as primary metric if available */}
            <p className="text-xl font-bold">{subtitle || `$${totalAmount.toFixed(2)}`}</p>

            {/* Period total as secondary if subtitle exists */}
            {subtitle && (
                <p className="text-sm text-slate-400">${totalAmount.toFixed(2)} this period</p>
            )}
        </>
    );

    const className = `
        block w-full text-left glass rounded-2xl p-4 card-hover transition-all duration-200
        ${isSelected ? `ring-2 ring-offset-2 ring-offset-slate-900 ${colors.border.replace("border-", "ring-")}` : ""}
    `;

    if (href) {
        return (
            <Link href={href} className={className}>
                {content}
            </Link>
        );
    }

    return <div className={className}>{content}</div>;
}

export function AddCategoryCard() {
    return (
        <div className="w-full h-full min-h-[140px] glass rounded-2xl p-5 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-2 text-slate-400">
            <div className="p-3 rounded-xl bg-slate-700/50">
                <Tag className="w-5 h-5" />
            </div>
            <span className="font-medium text-sm text-center">Use &quot;Add Category&quot; button in Rules Manager below</span>
        </div>
    );
}
