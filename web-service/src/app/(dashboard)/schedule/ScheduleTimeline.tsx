"use client";

import { format, startOfMonth, addMonths, addDays, differenceInDays, startOfDay, endOfMonth, max, min } from "date-fns";
import { useState } from "react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, Calendar, Plus } from "lucide-react";
import type { PaymentSchedule } from "@/lib/db/schema";
import { EditScheduleDialog } from "./EditScheduleDialog";
import { AddScheduleDialog } from "./AddScheduleDialog";
import { copyScheduleToUserAction } from "@/lib/actions";

type Flatmate = { id: string; name: string | null; email: string };

interface ScheduleTimelineProps {
  flatmates: Flatmate[];
  schedulesByUser: Record<string, PaymentSchedule[]>;
}

function DraggableSchedule({ 
  schedule, 
  style, 
  onClick 
}: { 
  schedule: PaymentSchedule; 
  style: React.CSSProperties;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule.id,
    data: { schedule },
  });

  const dragStyle = {
    ...style,
    transform: CSS.Transform.toString(transform),
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="absolute h-6 bg-teal-600 rounded text-xs text-white flex items-center justify-center overflow-hidden hover:bg-teal-500 transition-colors z-10"
      style={dragStyle}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      title={`$${schedule.weeklyAmount}/week${schedule.notes ? ` - ${schedule.notes}` : ""} (drag to copy)`}
    >
      <span className="truncate px-1">${schedule.weeklyAmount}/w</span>
    </div>
  );
}

function DroppableRow({ 
  userId, 
  children, 
  isOver 
}: { 
  userId: string; 
  children: React.ReactNode;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `user-${userId}`,
    data: { userId },
  });

  return (
    <div 
      ref={setNodeRef}
      className={`relative h-8 transition-colors ${isOver ? "bg-teal-900/30" : ""}`}
    >
      {children}
    </div>
  );
}

export function ScheduleTimeline({ flatmates, schedulesByUser }: ScheduleTimelineProps) {
  const [editingSchedule, setEditingSchedule] = useState<PaymentSchedule | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<PaymentSchedule | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewOffset, setViewOffset] = useState(0); // months offset from current
  const [continueSchedule, setContinueSchedule] = useState<{ userId: string; startDate: string; weeklyAmount: number } | null>(null);

  const months = 6;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const today = startOfDay(new Date());
  const startDate = startOfMonth(addMonths(today, -1 + viewOffset));
  const endDate = endOfMonth(addMonths(today, months - 2 + viewOffset));
  const totalDays = differenceInDays(endDate, startDate) + 1;
  
  const monthHeaders: { label: string; startDay: number; days: number }[] = [];
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
    });
    currentMonth = addMonths(currentMonth, 1);
  }

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
      left: `${(startOffset / totalDays) * 100}%`,
      width: `${(duration / totalDays) * 100}%`,
    };
  };

  const todayOffset = differenceInDays(today, startDate);
  const todayPosition = (todayOffset / totalDays) * 100;

  const getContinueButtonPosition = (schedule: PaymentSchedule) => {
    if (!schedule.endDate) return null;
    
    const continueStart = addDays(schedule.endDate, 1);
    if (continueStart > endDate || continueStart < startDate) return null;
    
    const startOffset = differenceInDays(continueStart, startDate);
    return {
      left: `${(startOffset / totalDays) * 100}%`,
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

    if (!over) return;

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

  const navigateMonths = (delta: number) => {
    setViewOffset(prev => prev + delta);
  };

  const goToToday = () => {
    setViewOffset(0);
  };

  return (
    <DndContext 
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="relative">
        {/* Timeline Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateMonths(-6)}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
              title="Previous 6 months"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToToday}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                viewOffset === 0 
                  ? "bg-emerald-600 text-white" 
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              <Calendar className="w-4 h-4" />
              Today
            </button>
            <button
              onClick={() => navigateMonths(6)}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
              title="Next 6 months"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="text-sm text-slate-400">
            {format(startDate, "MMM yyyy")} — {format(endDate, "MMM yyyy")}
          </div>
        </div>

        <div className="overflow-x-auto">
        {copyMessage && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm ${
            copyMessage.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}>
            {copyMessage.text}
          </div>
        )}

        <div className="min-w-200">
          <div className="flex border-b border-slate-700">
            <div className="w-32 shrink-0 p-2 text-sm font-medium text-slate-400">Flatmate</div>
            <div className="flex-1 flex">
              {monthHeaders.map((month, i) => (
                <div
                  key={i}
                  className="border-l border-slate-700 p-2 text-sm font-medium text-slate-400 text-center"
                  style={{ width: `${(month.days / totalDays) * 100}%` }}
                >
                  {month.label}
                </div>
              ))}
            </div>
          </div>

          {flatmates.map((flatmate) => {
            const userSchedules = schedulesByUser[flatmate.id] ?? [];
            const isDropTarget = activeDropZone === flatmate.id && activeSchedule?.userId !== flatmate.id;

            return (
              <div key={flatmate.id} className="flex border-b border-slate-800 hover:bg-slate-800/50">
                <div className="w-32 shrink-0 p-2 text-sm text-slate-300 flex items-center">
                  {flatmate.name?.split(" ")[0] || flatmate.email}
                </div>
                <div 
                  className="flex-1 relative"
                  title="Drag a schedule here to copy"
                >
                  {todayPosition >= 0 && todayPosition <= 100 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 z-20 pointer-events-none"
                      style={{ left: `${todayPosition}%` }}
                    />
                  )}

                  <DroppableRow userId={flatmate.id} isOver={isDropTarget}>
                    {userSchedules.map((schedule) => {
                      const position = getSchedulePosition(schedule);
                      const continuePos = getContinueButtonPosition(schedule);

                      return (
                        <span key={schedule.id}>
                          {position && (
                            <DraggableSchedule
                              schedule={schedule}
                              style={{
                                left: position.left,
                                width: position.width,
                                top: "4px",
                              }}
                              onClick={() => setEditingSchedule(schedule)}
                            />
                          )}
                          {continuePos && (
                            <button
                              className="absolute h-6 w-12 bg-linear-to-r from-slate-700/80 to-slate-700/0 hover:from-teal-700/80 border-l border-slate-500 hover:border-teal-400 rounded-l flex items-center justify-left px-2 ml-1 transition-colors z-10"
                              style={{
                                left: continuePos.left,
                                top: "4px",
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
                              <Plus className="w-3 h-3 text-slate-400 hover:text-white" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </DroppableRow>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap text-xs text-slate-500 mt-2 gap-4 px-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-teal-600 rounded" />
              <span>Schedule</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-dashed border-slate-500 rounded flex items-center justify-center">
                <Plus className="w-2 h-2" />
              </div>
              <span>Continue</span>
            </div>
            {viewOffset === 0 && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-emerald-500" />
                <span>Today</span>
              </div>
            )}
            <div className="text-slate-600">• Drag schedules to copy to another flatmate</div>
          </div>
        </div>
        </div>

        <DragOverlay>
          {activeSchedule && (
            <div className="h-6 bg-teal-600 rounded text-xs text-white flex items-center justify-center px-2 shadow-lg">
              ${activeSchedule.weeklyAmount}/w → {activeDropZone 
                ? flatmates.find(u => u.id === activeDropZone)?.name?.split(" ")[0] || "Drop here"
                : "Drop on flatmate"}
            </div>
          )}
        </DragOverlay>
      </div>

      {editingSchedule && (
        <EditScheduleDialog
          schedule={editingSchedule}
          flatmates={flatmates}
          onClose={() => setEditingSchedule(null)}
        />
      )}

      {continueSchedule && (
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
