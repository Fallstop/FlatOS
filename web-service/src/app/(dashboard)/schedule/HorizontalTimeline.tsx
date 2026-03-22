"use client";

import { format, startOfMonth, addMonths, addDays, differenceInDays, startOfDay, endOfMonth, max, min } from "date-fns";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, Calendar, Plus, Download } from "lucide-react";
import type { PaymentSchedule } from "@/lib/db/schema";
import { EditScheduleDialog } from "./EditScheduleDialog";
import { ViewScheduleDialog } from "./ViewScheduleDialog";
import { AddScheduleDialog } from "./AddScheduleDialog";
import { copyScheduleToUserAction } from "@/lib/actions";

type Flatmate = { id: string; name: string | null; email: string };

interface HorizontalTimelineProps {
    flatmates: Flatmate[];
    schedulesByUser: Record<string, PaymentSchedule[]>;
    isAdmin: boolean;
    analysisStartDate?: Date | null;
}

const DAY_WIDTH = 4; // pixels per day

// Color palette for different payment amounts
const AMOUNT_COLORS = [
    { bg: "bg-teal-600", hover: "hover:bg-teal-500", hex: "#0d9488" },
    { bg: "bg-blue-600", hover: "hover:bg-blue-500", hex: "#2563eb" },
    { bg: "bg-purple-600", hover: "hover:bg-purple-500", hex: "#9333ea" },
    { bg: "bg-pink-600", hover: "hover:bg-pink-500", hex: "#db2777" },
    { bg: "bg-amber-700", hover: "hover:bg-amber-600", hex: "#b45309" },
    { bg: "bg-cyan-600", hover: "hover:bg-cyan-500", hex: "#0891b2" },
    { bg: "bg-indigo-600", hover: "hover:bg-indigo-500", hex: "#4f46e5" },
    { bg: "bg-rose-600", hover: "hover:bg-rose-500", hex: "#e11d48" },
];

// Build a color map based on unique amounts, ordered by first appearance
function buildAmountColorMap(schedulesByUser: Record<string, PaymentSchedule[]>): Map<number, typeof AMOUNT_COLORS[0]> {
    const allSchedules = Object.values(schedulesByUser).flat();
    
    // Find the earliest start date for each unique amount
    const amountFirstSeen = new Map<number, Date>();
    for (const schedule of allSchedules) {
        const existing = amountFirstSeen.get(schedule.weeklyAmount);
        if (!existing || schedule.startDate < existing) {
            amountFirstSeen.set(schedule.weeklyAmount, schedule.startDate);
        }
    }
    
    // Sort amounts by when they first appeared
    const sortedAmounts = [...amountFirstSeen.entries()]
        .sort((a, b) => a[1].getTime() - b[1].getTime())
        .map(([amount]) => amount);
    
    // Assign colors in round-robin fashion
    const colorMap = new Map<number, typeof AMOUNT_COLORS[0]>();
    sortedAmounts.forEach((amount, index) => {
        colorMap.set(amount, AMOUNT_COLORS[index % AMOUNT_COLORS.length]);
    });
    
    return colorMap;
}

function DraggableSchedule({ 
    schedule, 
    style, 
    onClick,
    disabled,
    color
}: { 
    schedule: PaymentSchedule; 
    style: React.CSSProperties;
    onClick: () => void;
    disabled?: boolean;
    color: typeof AMOUNT_COLORS[0];
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: schedule.id,
        data: { schedule },
        disabled,
    });

    const dragStyle = {
        ...style,
        transform: CSS.Transform.toString(transform),
        cursor: disabled ? "pointer" : isDragging ? "grabbing" : "grab",
    };

    return (
        <div
            ref={setNodeRef}
            {...(disabled ? {} : { ...attributes, ...listeners })}
            className={`absolute h-7 rounded-sm text-xs text-white flex items-center justify-center overflow-hidden transition-colors shadow-sm z-10 ${color.bg} ${color.hover}`}
            style={dragStyle}
            onClick={(e) => {
                if (!isDragging) {
                    e.stopPropagation();
                    onClick();
                }
            }}
            title={`$${schedule.weeklyAmount}/week${schedule.notes ? ` - ${schedule.notes}` : ""}${!disabled ? " (drag to copy)" : ""}`}
        >
            <span className="truncate px-1.5 font-medium">${schedule.weeklyAmount}/w</span>
        </div>
    );
}

function DroppableRow({ 
    userId, 
    children, 
    isOver,
    disabled 
}: { 
    userId: string; 
    children: React.ReactNode;
    isOver: boolean;
    disabled?: boolean;
}) {
    const { setNodeRef } = useDroppable({
        id: `user-${userId}`,
        data: { userId },
        disabled,
    });

    return (
        <div 
            ref={setNodeRef}
            className={`relative h-10 transition-colors ${isOver && !disabled ? "bg-teal-900/30" : ""}`}
        >
            {children}
        </div>
    );
}

export function HorizontalTimeline({ flatmates, schedulesByUser, isAdmin, analysisStartDate }: HorizontalTimelineProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [editingSchedule, setEditingSchedule] = useState<PaymentSchedule | null>(null);
    const [viewingSchedule, setViewingSchedule] = useState<PaymentSchedule | null>(null);
    const [activeSchedule, setActiveSchedule] = useState<PaymentSchedule | null>(null);
    const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
    const [copyMessage, setCopyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [continueSchedule, setContinueSchedule] = useState<{ userId: string; startDate: string; weeklyAmount: number } | null>(null);
    
    // Infinite scroll state - track months loaded
    const [monthsLoaded, setMonthsLoaded] = useState({ past: 6, future: 12 });
    
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const today = startOfDay(new Date());
    const startDate = startOfMonth(addMonths(today, -monthsLoaded.past));
    const endDate = endOfMonth(addMonths(today, monthsLoaded.future));
    const totalDays = differenceInDays(endDate, startDate) + 1;
    const totalWidth = totalDays * DAY_WIDTH;

    // Build color map once per render based on unique amounts
    const amountColorMap = useMemo(() => buildAmountColorMap(schedulesByUser), [schedulesByUser]);
    const getColorForAmount = useCallback((amount: number) => {
        return amountColorMap.get(amount) ?? AMOUNT_COLORS[0];
    }, [amountColorMap]);

    // Build month headers
    const monthHeaders: { label: string; startDay: number; days: number; date: Date }[] = [];
    let currentMonth = startDate;
    while (currentMonth <= endDate) {
        const monthEnd = min([endOfMonth(currentMonth), endDate]);
        const monthStart = max([startOfMonth(currentMonth), startDate]);
        const startDay = differenceInDays(monthStart, startDate);
        const days = differenceInDays(monthEnd, monthStart) + 1;
        
        monthHeaders.push({
            label: format(currentMonth, "MMM yyyy"),
            startDay,
            days,
            date: currentMonth,
        });
        currentMonth = addMonths(currentMonth, 1);
    }

    // Calculate positions
    const getSchedulePosition = (schedule: PaymentSchedule) => {
        const scheduleStart = max([startOfDay(schedule.startDate), startDate]);
        const scheduleEnd = schedule.endDate 
            ? min([startOfDay(schedule.endDate), endDate])
            : endDate;
        
        if (scheduleEnd < startDate || scheduleStart > endDate) {
            return null;
        }

        const startOffset = differenceInDays(scheduleStart, startDate);
        const duration = differenceInDays(scheduleEnd, scheduleStart) + 1;
        
        return {
            left: startOffset * DAY_WIDTH,
            width: duration * DAY_WIDTH,
        };
    };

    const todayOffset = differenceInDays(today, startDate);
    const todayPosition = todayOffset * DAY_WIDTH;

    const analysisOffset = analysisStartDate ? differenceInDays(analysisStartDate, startDate) : null;
    const analysisPosition = analysisOffset !== null ? analysisOffset * DAY_WIDTH : null;

    // Scroll to today on mount
    useEffect(() => {
        if (scrollRef.current) {
            const containerWidth = scrollRef.current.clientWidth;
            scrollRef.current.scrollLeft = todayPosition - containerWidth / 2;
        }
    }, [todayPosition]);

    // Handle infinite scroll
    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        
        // Load more past when near left edge
        if (scrollLeft < 500) {
            setMonthsLoaded(prev => ({ ...prev, past: prev.past + 6 }));
        }
        
        // Load more future when near right edge
        if (scrollWidth - scrollLeft - clientWidth < 500) {
            setMonthsLoaded(prev => ({ ...prev, future: prev.future + 6 }));
        }
    }, []);

    const getContinueButtonPosition = (schedule: PaymentSchedule, userSchedules: PaymentSchedule[]) => {
        if (!schedule.endDate) return null;
        
        const continueStart = addDays(schedule.endDate, 1);
        if (continueStart > endDate || continueStart < startDate) return null;
        
        // Check if there's an adjacent schedule starting right after this one ends
        const hasAdjacentSchedule = userSchedules.some(other => {
            if (other.id === schedule.id) return false;
            const otherStart = startOfDay(other.startDate);
            const continueDay = startOfDay(continueStart);
            return otherStart.getTime() === continueDay.getTime();
        });
        
        if (hasAdjacentSchedule) return null;
        
        const startOffset = differenceInDays(continueStart, startDate);
        return {
            left: startOffset * DAY_WIDTH,
            continueDate: format(continueStart, "yyyy-MM-dd"),
        };
    };

    const handleDragStart = (event: DragStartEvent) => {
        const schedule = event.active.data.current?.schedule as PaymentSchedule;
        setActiveSchedule(schedule);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const overId = event.over?.id as string | undefined;
        if (overId?.startsWith("user-")) {
            setActiveDropZone(overId.replace("user-", ""));
        } else {
            setActiveDropZone(null);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveSchedule(null);
        setActiveDropZone(null);

        if (!over || !isAdmin) return;

        const schedule = active.data.current?.schedule as PaymentSchedule;
        const targetUserId = over.data.current?.userId as string;

        if (!schedule || !targetUserId || schedule.userId === targetUserId) {
            return;
        }

        try {
            const result = await copyScheduleToUserAction(schedule.id, targetUserId);
            if (result.success) {
                const targetUser = flatmates.find(u => u.id === targetUserId);
                setCopyMessage({ 
                    type: "success", 
                    text: `Copied schedule to ${targetUser?.name || "user"}` 
                });
            } else {
                setCopyMessage({ type: "error", text: result.error || "Failed to copy" });
            }
        } catch {
            setCopyMessage({ type: "error", text: "Failed to copy schedule" });
        }

        setTimeout(() => setCopyMessage(null), 3000);
    };

    const scrollToToday = () => {
        if (scrollRef.current) {
            const containerWidth = scrollRef.current.clientWidth;
            scrollRef.current.scrollTo({
                left: todayPosition - containerWidth / 2,
                behavior: "smooth",
            });
        }
    };

    const scrollByMonths = (months: number) => {
        if (scrollRef.current) {
            const daysToScroll = months * 30 * DAY_WIDTH;
            scrollRef.current.scrollBy({ left: daysToScroll, behavior: "smooth" });
        }
    };

    // Export function for non-admins
    const handleExport = () => {
        const allSchedules = Object.values(schedulesByUser).flat();
        const flatmateMap = new Map(flatmates.map((f) => [f.id, f]));

        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            schedules: allSchedules.map((s) => {
                const flatmate = flatmateMap.get(s.userId);
                return {
                    flatmateEmail: flatmate?.email ?? "unknown",
                    flatmateName: flatmate?.name ?? null,
                    weeklyAmount: s.weeklyAmount,
                    startDate: format(s.startDate, "yyyy-MM-dd"),
                    endDate: s.endDate ? format(s.endDate, "yyyy-MM-dd") : null,
                    notes: s.notes,
                };
            }),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payment-schedules-${format(new Date(), "yyyy-MM-dd")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <DndContext 
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="relative">
                {copyMessage && (
                    <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm ${
                        copyMessage.type === "success" ? "bg-emerald-600" : "bg-red-600"
                    }`}>
                        {copyMessage.text}
                    </div>
                )}

                {/* Navigation */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => scrollByMonths(-3)}
                            className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                            title="Scroll left 3 months"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={scrollToToday}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors text-sm"
                        >
                            <Calendar className="w-4 h-4" />
                            Today
                        </button>
                        <button
                            onClick={() => scrollByMonths(3)}
                            className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                            title="Scroll right 3 months"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
                        >
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                        <span className="text-sm text-slate-400 hidden sm:inline">
                            Scroll horizontally to navigate{isAdmin ? " • Drag schedules to copy" : ""}
                        </span>
                    </div>
                </div>

                {/* Timeline Container */}
                <div className="glass rounded-xl overflow-hidden">
                    <div className="flex">
                        {/* Sticky flatmate column */}
                        <div className="sticky left-0 z-20 bg-slate-800 border-r border-slate-700 w-fit">
                            <div className="h-10 border-b border-slate-700 flex items-center px-3 text-xs font-medium text-slate-400 whitespace-nowrap">
                                Flatmate
                            </div>
                            {flatmates.map((flatmate) => (
                                <div
                                    key={flatmate.id}
                                    className="h-10 border-b border-slate-800 flex items-center px-3 text-sm text-slate-300 whitespace-nowrap"
                                >
                                    {flatmate.name?.split(" ")[0] || flatmate.email.split("@")[0]}
                                </div>
                            ))}
                        </div>

                        {/* Scrollable timeline area */}
                        <div 
                            ref={scrollRef}
                            className="flex-1 overflow-x-auto"
                            onScroll={handleScroll}
                        >
                            <div style={{ width: totalWidth, minWidth: "100%" }}>
                                {/* Month headers */}
                                <div className="h-10 border-b border-slate-700 flex relative">
                                    {monthHeaders.map((month, i) => (
                                        <div
                                            key={i}
                                            className="absolute top-0 h-full flex items-center justify-center text-xs font-medium text-slate-400 border-l border-slate-700"
                                            style={{ 
                                                left: month.startDay * DAY_WIDTH,
                                                width: month.days * DAY_WIDTH,
                                            }}
                                        >
                                            {month.days * DAY_WIDTH > 60 && month.label}
                                        </div>
                                    ))}
                                    
                                    {/* Today line in header */}
                                    <div
                                        className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 z-10"
                                        style={{ left: todayPosition }}
                                    />
                                    
                                    {/* Analysis start date line in header */}
                                    {analysisPosition !== null && (
                                        <div
                                            className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
                                            style={{ left: analysisPosition }}
                                        />
                                    )}
                                </div>

                                {/* Flatmate rows */}
                                {flatmates.map((flatmate) => {
                                    const userSchedules = schedulesByUser[flatmate.id] ?? [];
                                    const isDropTarget = activeDropZone === flatmate.id && activeSchedule?.userId !== flatmate.id;

                                    return (
                                        <div 
                                            key={flatmate.id} 
                                            className="relative border-b border-slate-800 hover:bg-slate-800/30"
                                        >
                                            {/* Today line */}
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-emerald-500/50 z-10 pointer-events-none"
                                                style={{ left: todayPosition }}
                                            />
                                            
                                            {/* Analysis start date line */}
                                            {analysisPosition !== null && (
                                                <div
                                                    className="absolute top-0 bottom-0 w-0.5 bg-amber-500/50 z-10 pointer-events-none"
                                                    style={{ left: analysisPosition }}
                                                />
                                            )}

                                            <DroppableRow userId={flatmate.id} isOver={isDropTarget} disabled={!isAdmin}>
                                                {/* Continue buttons first (in background) */}
                                                {isAdmin && userSchedules.map((schedule) => {
                                                    const continuePos = getContinueButtonPosition(schedule, userSchedules);
                                                    if (!continuePos) return null;
                                                    
                                                    return (
                                                        <button
                                                            key={`continue-${schedule.id}`}
                                                            className="absolute h-7 w-8 bg-slate-700/50 hover:bg-teal-700/80 border-l border-dashed border-slate-500 hover:border-teal-400 rounded-r-sm flex items-center justify-center transition-colors z-0"
                                                            style={{
                                                                left: continuePos.left,
                                                                top: "6px",
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setContinueSchedule({
                                                                    userId: flatmate.id,
                                                                    startDate: continuePos.continueDate,
                                                                    weeklyAmount: schedule.weeklyAmount,
                                                                });
                                                            }}
                                                            title={`Continue from ${format(addDays(schedule.endDate!, 1), "MMM d, yyyy")} at $${schedule.weeklyAmount}/week`}
                                                        >
                                                            <Plus className="w-3 h-3 text-slate-500" />
                                                        </button>
                                                    );
                                                })}
                                                {/* Schedule bars (in foreground) */}
                                                {userSchedules.map((schedule) => {
                                                    const position = getSchedulePosition(schedule);
                                                    const color = getColorForAmount(schedule.weeklyAmount);

                                                    return position && (
                                                        <DraggableSchedule
                                                            key={schedule.id}
                                                            schedule={schedule}
                                                            style={{
                                                                left: position.left,
                                                                width: Math.max(position.width, 40),
                                                                top: "6px",
                                                            }}
                                                            onClick={() => isAdmin ? setEditingSchedule(schedule) : setViewingSchedule(schedule)}
                                                            disabled={!isAdmin}
                                                            color={color}
                                                        />
                                                    );
                                                })}
                                            </DroppableRow>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap text-xs text-slate-500 p-3 gap-4 border-t border-slate-700">
                        <div className="flex items-center gap-1.5">
                            <div className="flex -space-x-1">
                                {AMOUNT_COLORS.slice(0, 4).map((c, i) => (
                                    <div key={i} className={`w-3 h-3 ${c.bg} rounded-sm`} />
                                ))}
                            </div>
                            <span>Schedules (color by amount)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-4 h-0.5 bg-emerald-500" />
                            <span>Today</span>
                        </div>
                        {analysisStartDate && (
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-0.5 bg-amber-500" />
                                <span>Analysis Start</span>
                            </div>
                        )}
                        {isAdmin && (
                            <>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-4 h-4 border border-dashed border-slate-500 rounded-sm flex items-center justify-center">
                                        <Plus className="w-2.5 h-2.5" />
                                    </div>
                                    <span>Continue schedule</span>
                                </div>
                                <span className="text-slate-600">• Drag schedules to copy to another flatmate</span>
                            </>
                        )}
                    </div>
                </div>

                <DragOverlay>
                    {activeSchedule && (
                        <div 
                            className={`h-7 rounded-sm text-xs text-white flex items-center justify-center px-2 shadow-lg ${getColorForAmount(activeSchedule.weeklyAmount).bg}`}
                        >
                            ${activeSchedule.weeklyAmount}/w → {activeDropZone 
                                ? flatmates.find(u => u.id === activeDropZone)?.name?.split(" ")[0] || "Drop here"
                                : "Drop on flatmate"}
                        </div>
                    )}
                </DragOverlay>
            </div>

            {editingSchedule && isAdmin && (
                <EditScheduleDialog
                    schedule={editingSchedule}
                    flatmates={flatmates}
                    onClose={() => setEditingSchedule(null)}
                />
            )}

            {viewingSchedule && !isAdmin && (
                <ViewScheduleDialog
                    schedule={viewingSchedule}
                    flatmates={flatmates}
                    onClose={() => setViewingSchedule(null)}
                />
            )}

            {continueSchedule && isAdmin && (
                <AddScheduleDialog
                    flatmates={flatmates}
                    isOpen={true}
                    onClose={() => setContinueSchedule(null)}
                    defaultUserId={continueSchedule.userId}
                    defaultStartDate={continueSchedule.startDate}
                    defaultWeeklyAmount={continueSchedule.weeklyAmount}
                />
            )}
        </DndContext>
    );
}
