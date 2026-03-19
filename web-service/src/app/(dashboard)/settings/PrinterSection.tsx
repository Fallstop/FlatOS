"use client";

import { useState, useEffect, useCallback } from "react";
import { getReceiptPreviewAction, triggerPrintAction } from "@/lib/actions";
import { Copy, Check, Printer, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { ReceiptPreview } from "@/components/ReceiptPreview";

export function PrinterSection() {
    const [receiptText, setReceiptText] = useState<string | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isLoadingPreview, setIsLoadingPreview] = useState(true);
    const [copied, setCopied] = useState(false);
    const [connectedClients, setConnectedClients] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const wsUrl = typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/print/ws`
        : "wss://localhost/print/ws";

    const loadPreview = useCallback(async () => {
        setIsLoadingPreview(true);
        const result = await getReceiptPreviewAction();
        if (result.text) {
            setReceiptText(result.text);
        }
        setIsLoadingPreview(false);
    }, []);

    const checkStatus = useCallback(async () => {
        try {
            const res = await fetch("/print/status");
            if (res.ok) {
                const data = await res.json();
                setConnectedClients(data.clients);
            }
        } catch {
            setConnectedClients(null);
        }
    }, []);

    useEffect(() => {
        loadPreview();
        checkStatus();
        const interval = setInterval(checkStatus, 10000);
        return () => clearInterval(interval);
    }, [loadPreview, checkStatus]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(wsUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrint = async () => {
        setIsPrinting(true);
        setMessage(null);

        const result = await triggerPrintAction();

        if (result.error) {
            setMessage({ type: "error", text: result.error });
        } else {
            setMessage({
                type: "success",
                text: `Sent to ${result.sent} printer${result.sent !== 1 ? "s" : ""}`,
            });
        }
        setIsPrinting(false);
    };

    return (
        <div className="p-5 space-y-5">
            {/* WebSocket URL */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                    Printer WebSocket URL
                </label>
                <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-sm text-slate-300 font-mono truncate">
                        {wsUrl}
                    </code>
                    <button
                        onClick={handleCopy}
                        className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
                        title="Copy URL"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <Copy className="w-4 h-4 text-slate-400" />
                        )}
                    </button>
                </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2 text-sm">
                {connectedClients !== null ? (
                    <>
                        {connectedClients > 0 ? (
                            <Wifi className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <WifiOff className="w-4 h-4 text-slate-500" />
                        )}
                        <span className={connectedClients > 0 ? "text-emerald-400" : "text-slate-500"}>
                            {connectedClients} printer{connectedClients !== 1 ? "s" : ""} connected
                        </span>
                    </>
                ) : (
                    <>
                        <WifiOff className="w-4 h-4 text-red-400" />
                        <span className="text-red-400">Print server offline</span>
                    </>
                )}
            </div>

            {/* Receipt Preview */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-300">
                        Receipt Preview
                    </label>
                    <button
                        onClick={loadPreview}
                        disabled={isLoadingPreview}
                        className="p-1 rounded hover:bg-slate-700/50 transition-colors"
                        title="Refresh preview"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoadingPreview ? "animate-spin" : ""}`} />
                    </button>
                </div>
                {isLoadingPreview ? (
                    <div className="text-center text-slate-500 py-4">Loading preview...</div>
                ) : receiptText ? (
                    <ReceiptPreview text={receiptText} />
                ) : (
                    <div className="text-center text-slate-500 py-4">No data available</div>
                )}
            </div>

            {/* Print Button */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handlePrint}
                    disabled={isPrinting || connectedClients === null || connectedClients === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors text-sm font-medium"
                >
                    <Printer className={`w-4 h-4 ${isPrinting ? "animate-pulse" : ""}`} />
                    {isPrinting ? "Printing..." : "Print Receipt"}
                </button>

                {message && (
                    <span
                        className={`text-sm ${
                            message.type === "success" ? "text-emerald-400" : "text-red-400"
                        }`}
                    >
                        {message.text}
                    </span>
                )}
            </div>
        </div>
    );
}
