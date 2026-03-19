"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { format, isSaturday, isFriday, previousSaturday, nextFriday } from "date-fns";
import { WEEK_STARTS_ON } from "@/lib/constants";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import "react-day-picker/style.css";

interface WeekDatePickerProps {
    name: string;
    value?: string;
    defaultValue?: string;
    onChange?: (date: string) => void;
    required?: boolean;
    /** 'start' aligns to Saturday, 'end' aligns to Friday */
    weekAlign: "start" | "end";
    label?: string;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * Get the nearest Saturday (for week start) or Friday (for week end)
 */
function alignToWeekBoundary(date: Date, align: "start" | "end"): Date {
    if (align === "start") {
        // Align to Saturday (start of week)
        if (isSaturday(date)) return date;
        return previousSaturday(date);
    } else {
        // Align to Friday (end of week)
        if (isFriday(date)) return date;
        return nextFriday(date);
    }
}

function parseDate(dateStr: string | undefined): Date | undefined {
    if (!dateStr) return undefined;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? undefined : parsed;
}

export function WeekDatePicker({
    name,
    value,
    defaultValue,
    onChange,
    required,
    weekAlign,
    label,
    placeholder,
    disabled,
}: WeekDatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    
    // Compute the effective date from props
    const controlledDate = useMemo(() => parseDate(value), [value]);
    const initialDate = useMemo(() => parseDate(defaultValue), [defaultValue]);
    
    const [internalDate, setInternalDate] = useState<Date | undefined>(initialDate);
    
    // Use controlled value if provided, otherwise internal state
    const selectedDate = controlledDate ?? internalDate;
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (date: Date | undefined) => {
        if (!date) return;
        
        // Align to week boundary
        const aligned = alignToWeekBoundary(date, weekAlign);
        setInternalDate(aligned);
        setIsOpen(false);
        
        if (onChange) {
            onChange(format(aligned, "yyyy-MM-dd"));
        }
    };

    // Determine which days to highlight (Saturdays for start, Fridays for end)
    const isValidDay = (date: Date) => {
        if (weekAlign === "start") {
            return isSaturday(date);
        }
        return isFriday(date);
    };

    const formattedValue = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    const displayValue = selectedDate 
        ? `${format(selectedDate, "EEE, d MMM yyyy")}`
        : "";

    return (
        <div ref={containerRef} className="relative">
            {label && (
                <label className="block text-sm font-medium text-slate-300 mb-1">
                    {label} {required && "*"}
                </label>
            )}
            
            {/* Hidden input for form submission */}
            <input type="hidden" name={name} value={formattedValue} />
            
            {/* Display button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center gap-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-left transition-colors ${
                    disabled 
                        ? "opacity-50 cursor-not-allowed" 
                        : "hover:border-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                }`}
            >
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span className={displayValue ? "text-white" : "text-slate-400"}>
                    {displayValue || placeholder || `Select ${weekAlign === "start" ? "Saturday" : "Friday"}`}
                </span>
            </button>

            {/* Calendar dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-2 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-xl">
                    <div className="text-xs text-slate-400 mb-2 text-center">
                        {weekAlign === "start" 
                            ? "Select a Saturday (week start)" 
                            : "Select a Friday (week end)"}
                    </div>
                    <DayPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleSelect}
                        defaultMonth={selectedDate}
                        weekStartsOn={WEEK_STARTS_ON}
                        showOutsideDays
                        modifiers={{
                            validDay: isValidDay,
                            selected: (date) => selectedDate ? date.toDateString() === selectedDate.toDateString() : false,
                        }}
                        modifiersStyles={{
                            validDay: {
                                backgroundColor: "rgba(16, 185, 129, 0.2)",
                                borderRadius: "6px",
                            },
                            selected: {
                                backgroundColor: "#10b981",
                                color: "white",
                                fontWeight: "600",
                                borderRadius: "6px",
                                boxShadow: "0 0 0 2px #10b981",
                            },
                        }}
                        styles={{
                            root: {
                                "--rdp-accent-color": "#10b981",
                                "--rdp-background-color": "#334155",
                            } as React.CSSProperties,
                        }}
                        classNames={{
                            root: "rdp-dark",
                            month_caption: "text-white font-medium mb-2",
                            weekday: "text-slate-400 text-xs",
                            day: "text-white hover:bg-slate-700 rounded-lg transition-colors p-2",
                            selected: "bg-emerald-600 text-white hover:bg-emerald-500",
                            today: "ring-1 ring-emerald-400",
                            outside: "text-slate-600",
                            disabled: "text-slate-700",
                            chevron: "text-slate-400",
                        }}
                        components={{
                            Chevron: ({ orientation }) => (
                                orientation === "left" 
                                    ? <ChevronLeft className="w-4 h-4" />
                                    : <ChevronRight className="w-4 h-4" />
                            ),
                        }}
                    />
                </div>
            )}
        </div>
    );
}
