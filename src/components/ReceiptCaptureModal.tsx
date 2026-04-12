"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PAYMENT_METHOD_OPTIONS, PaymentMethod } from "@/lib/types";

const ACCOUNT_OPTIONS = [
  { value: "", label: "— Konto waehlen —" },
  { value: "5000", label: "5000 Wareneinkauf" },
  { value: "5880", label: "5880 Reisekosten" },
  { value: "6000", label: "6000 Mietaufwand" },
  { value: "6300", label: "6300 Versicherungen" },
  { value: "6800", label: "6800 Porto/Telefon" },
  { value: "7200", label: "7200 Bueroaufwand" },
  { value: "7300", label: "7300 Rechts-/Beratung" },
  { value: "7400", label: "7400 Werbung/Marketing" },
  { value: "7600", label: "7600 Telefonkosten" },
  { value: "7650", label: "7650 Internet/EDV" },
  { value: "7700", label: "7700 KFZ-Aufwand" },
  { value: "7780", label: "7780 Bewirtung" },
  { value: "7890", label: "7890 GWG (< 1000 EUR)" },
];

interface CropRect { x: number; y: number; w: number; h: number }

interface Props {
  imageFile: File;
  onSubmit: (croppedFile: File, meta: { purpose: string; account_debit: string; account_label: string; payment_method: PaymentMethod }) => void;
  onCancel: () => void;
}

function autoCropBounds(canvas: HTMLCanvasElement): CropRect {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Convert to grayscale and find non-white pixels
  const threshold = 220; // pixels brighter than this are "background"
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (gray < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Add small margin
  const margin = Math.max(5, Math.round(Math.min(width, height) * 0.01));
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(width, maxX + margin);
  maxY = Math.min(height, maxY + margin);

  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export default function ReceiptCaptureModal({ imageFile, onSubmit, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [purpose, setPurpose] = useState("");
  const [accountDebit, setAccountDebit] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [submitting, setSubmitting] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.width, h: img.height });
      setCrop({ x: 0, y: 0, w: img.width, h: img.height });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleAutoCrop = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const bounds = autoCropBounds(canvas);
    setCrop(bounds);
  }, []);

  async function handleSubmit() {
    if (!imgRef.current || !crop) return;
    setSubmitting(true);

    // Create cropped image
    const canvas = document.createElement("canvas");
    canvas.width = crop.w;
    canvas.height = crop.h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imgRef.current, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const croppedFile = new File([blob], imageFile.name.replace(/\.\w+$/, "_cropped.jpg"), { type: "image/jpeg" });

    const acctLabel = ACCOUNT_OPTIONS.find((o) => o.value === accountDebit)?.label.split(" ").slice(1).join(" ") || "";
    onSubmit(croppedFile, { purpose, account_debit: accountDebit, account_label: acctLabel, payment_method: paymentMethod });
  }

  // Calculate display dimensions (fit in viewport)
  const maxDisplayW = 400;
  const maxDisplayH = 500;
  const scale = imgSize.w > 0 ? Math.min(maxDisplayW / imgSize.w, maxDisplayH / imgSize.h, 1) : 1;
  const displayW = Math.round(imgSize.w * scale);
  const displayH = Math.round(imgSize.h * scale);

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6 w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Beleg bearbeiten</h2>

        {/* Image preview with crop overlay */}
        {imageSrc && (
          <div className="relative mx-auto mb-4" style={{ width: displayW, height: displayH }}>
            <img src={imageSrc} alt="Beleg" style={{ width: displayW, height: displayH }} className="rounded-lg" />
            {crop && (
              <div
                className="absolute border-2 border-[var(--accent)] bg-[var(--accent)]/10 rounded"
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: crop.w * scale,
                  height: crop.h * scale,
                }}
              />
            )}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button onClick={handleAutoCrop} className="bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cyan-500 transition">
            Auto-Zuschnitt
          </button>
          <button onClick={() => setCrop(imgSize.w > 0 ? { x: 0, y: 0, w: imgSize.w, h: imgSize.h } : null)} className="bg-[var(--surface-hover)] text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--border)] transition">
            Zuruecksetzen
          </button>
        </div>

        {/* Form fields */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Projekttitel / Verwendungszweck</label>
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="z.B. Bueroausstattung" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Konto</label>
              <select value={accountDebit} onChange={(e) => setAccountDebit(e.target.value)} className={inputClass}>
                {ACCOUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Zahlungsmethode</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputClass}>
                {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-[var(--accent)] text-black px-4 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {submitting ? "Wird hochgeladen..." : "Hochladen & Analysieren"}
          </button>
          <button onClick={onCancel} className="bg-[var(--surface-hover)] text-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
            Abbrechen
          </button>
        </div>

        {/* Hidden canvas for auto-crop computation */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
