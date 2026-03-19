"use client";

/**
 * Renders plain text as a realistic thermal receipt preview.
 * Light background, monospace font, paper-like styling with torn edges.
 */
export function ReceiptPreview({ text }: { text: string }) {
    return (
        <div className="relative max-w-xs mx-auto">
            {/* Torn top edge */}
            <div
                className="h-3 w-full"
                style={{
                    background: "#f5f0e8",
                    maskImage:
                        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,10 Q5,0 10,10 Q15,0 20,10 Q25,0 30,10 Q35,0 40,10 Q45,0 50,10 Q55,0 60,10 Q65,0 70,10 Q75,0 80,10 Q85,0 90,10 Q95,0 100,10 Q105,0 110,10 Q115,0 120,10 Q125,0 130,10 Q135,0 140,10 Q145,0 150,10 Q155,0 160,10 Q165,0 170,10 Q175,0 180,10 Q185,0 190,10 Q195,0 200,10 L200,10 L0,10Z' fill='black'/%3E%3C/svg%3E\")",
                    maskSize: "100% 100%",
                    WebkitMaskImage:
                        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,10 Q5,0 10,10 Q15,0 20,10 Q25,0 30,10 Q35,0 40,10 Q45,0 50,10 Q55,0 60,10 Q65,0 70,10 Q75,0 80,10 Q85,0 90,10 Q95,0 100,10 Q105,0 110,10 Q115,0 120,10 Q125,0 130,10 Q135,0 140,10 Q145,0 150,10 Q155,0 160,10 Q165,0 170,10 Q175,0 180,10 Q185,0 190,10 Q195,0 200,10 L200,10 L0,10Z' fill='black'/%3E%3C/svg%3E\")",
                    WebkitMaskSize: "100% 100%",
                }}
            />
            {/* Receipt body */}
            <div
                className="px-5 py-4 shadow-lg"
                style={{
                    background: "#f5f0e8",
                    boxShadow: "2px 2px 12px rgba(0,0,0,0.3)",
                }}
            >
                <pre
                    className="whitespace-pre leading-relaxed overflow-x-auto"
                    style={{
                        fontFamily: "'Courier New', Courier, monospace",
                        fontSize: "11px",
                        color: "#1a1a1a",
                        letterSpacing: "0.02em",
                    }}
                >
                    {text}
                </pre>
            </div>
            {/* Torn bottom edge */}
            <div
                className="h-3 w-full"
                style={{
                    background: "#f5f0e8",
                    maskImage:
                        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,0 Q5,10 10,0 Q15,10 20,0 Q25,10 30,0 Q35,10 40,0 Q45,10 50,0 Q55,10 60,0 Q65,10 70,0 Q75,10 80,0 Q85,10 90,0 Q95,10 100,0 Q105,10 110,0 Q115,10 120,0 Q125,10 130,0 Q135,10 140,0 Q145,10 150,0 Q155,10 160,0 Q165,10 170,0 Q175,10 180,0 Q185,10 190,0 Q195,10 200,0 L200,0 L0,0Z' fill='black'/%3E%3C/svg%3E\")",
                    maskSize: "100% 100%",
                    WebkitMaskImage:
                        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,0 Q5,10 10,0 Q15,10 20,0 Q25,10 30,0 Q35,10 40,0 Q45,10 50,0 Q55,10 60,0 Q65,10 70,0 Q75,10 80,0 Q85,10 90,0 Q95,10 100,0 Q105,10 110,0 Q115,10 120,0 Q125,10 130,0 Q135,10 140,0 Q145,10 150,0 Q155,10 160,0 Q165,10 170,0 Q175,10 180,0 Q185,10 190,0 Q195,10 200,0 L200,0 L0,0Z' fill='black'/%3E%3C/svg%3E\")",
                    WebkitMaskSize: "100% 100%",
                }}
            />
        </div>
    );
}
