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
  imageFile?: File;
  imageUrl?: string;
  editMode?: boolean;
  onSubmit?: (croppedFile: File, meta: { purpose: string; account_debit: string; account_label: string; payment_method: PaymentMethod }) => void;
  onSaveCrop?: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

function autoCropBounds(canvas: HTMLCanvasElement): CropRect {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Step 1: Sample corners to determine background color
  const cornerSamples: number[][] = [];
  const sampleSize = Math.max(10, Math.round(Math.min(width, height) * 0.03));
  for (let y = 0; y < sampleSize; y++) {
    for (let x = 0; x < sampleSize; x++) {
      for (const [ox, oy] of [[0, 0], [width - sampleSize, 0], [0, height - sampleSize], [width - sampleSize, height - sampleSize]]) {
        const i = ((oy + y) * width + (ox + x)) * 4;
        cornerSamples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }
  const bgR = cornerSamples.reduce((s, c) => s + c[0], 0) / cornerSamples.length;
  const bgG = cornerSamples.reduce((s, c) => s + c[1], 0) / cornerSamples.length;
  const bgB = cornerSamples.reduce((s, c) => s + c[2], 0) / cornerSamples.length;

  // Step 2: Find pixels that differ significantly from background
  const threshold = 40; // color distance threshold
  let minX = width, minY = height, maxX = 0, maxY = 0;
  // Sample every 2nd pixel for performance
  const step = Math.max(1, Math.round(Math.min(width, height) / 500));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const dr = data[i] - bgR;
      const dg = data[i + 1] - bgG;
      const db = data[i + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Step 3: Add margin
  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.015));
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(width, maxX + margin);
  maxY = Math.min(height, maxY + margin);

  // Sanity check — crop must be at least 20% of image
  if (maxX <= minX || maxY <= minY || (maxX - minX) * (maxY - minY) < width * height * 0.2) {
    return { x: 0, y: 0, w: width, h: height };
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export default function ReceiptCaptureModal({ imageFile, imageUrl, editMode, onSubmit, onSaveCrop, onCancel }: Props) {
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
    let objectUrl: string | null = null;
    const src = imageFile ? (objectUrl = URL.createObjectURL(imageFile)) : imageUrl || null;
    if (!src) return;
    setImageSrc(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.width, h: img.height });
      setCrop({ x: 0, y: 0, w: img.width, h: img.height });
    };
    img.src = src;
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageFile, imageUrl]);

  const handleAutoCrop = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;

    // Downscale large images for analysis (max 800px) — then scale bounds back
    const maxAnalysisSize = 800;
    const analyzeScale = Math.min(1, maxAnalysisSize / Math.max(img.width, img.height));
    const aw = Math.round(img.width * analyzeScale);
    const ah = Math.round(img.height * analyzeScale);

    canvas.width = aw;
    canvas.height = ah;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, aw, ah);

    try {
      const bounds = autoCropBounds(canvas);
      // Scale bounds back to original image size
      const s = 1 / analyzeScale;
      setCrop({
        x: Math.round(bounds.x * s),
        y: Math.round(bounds.y * s),
        w: Math.round(bounds.w * s),
        h: Math.round(bounds.h * s),
      });
    } catch (e) {
      console.error("Auto-crop failed:", e);
      // Fallback: crop 5% from each edge
      const mx = Math.round(img.width * 0.05);
      const my = Math.round(img.height * 0.05);
      setCrop({ x: mx, y: my, w: img.width - mx * 2, h: img.height - my * 2 });
    }
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

    if (editMode && onSaveCrop) {
      onSaveCrop(blob);
      return;
    }

    if (onSubmit && imageFile) {
      const croppedFile = new File([blob], imageFile.name.replace(/\.\w+$/, "_cropped.jpg"), { type: "image/jpeg" });
      const acctLabel = ACCOUNT_OPTIONS.find((o) => o.value === accountDebit)?.label.split(" ").slice(1).join(" ") || "";
      onSubmit(croppedFile, { purpose, account_debit: accountDebit, account_label: acctLabel, payment_method: paymentMethod });
    }
  }

  // Calculate display dimensions (fit in viewport)
  const maxDisplayW = 400;
  const maxDisplayH = 500;
  const scale = imgSize.w > 0 ? Math.min(maxDisplayW / imgSize.w, maxDisplayH / imgSize.h, 1) : 1;
  const displayW = Math.round(imgSize.w * scale);
  const displayH = Math.round(imgSize.h * scale);

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6 w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Beleg bearbeiten</h2>

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
          <button onClick={handleAutoCrop} className="bg-cyan-600 text-[var(--text-primary)] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cyan-500 transition">
            Auto-Zuschnitt
          </button>
          <button onClick={() => setCrop(imgSize.w > 0 ? { x: 0, y: 0, w: imgSize.w, h: imgSize.h } : null)} className="bg-[var(--surface-hover)] text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--border)] transition">
            Zuruecksetzen
          </button>
        </div>

        {/* Form fields (hidden in edit mode) */}
        {!editMode && <div className="space-y-3 mb-4">
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
        </div>}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-[var(--accent)] text-black px-4 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {submitting ? "Wird gespeichert..." : editMode ? "Zuschnitt speichern" : "Hochladen & Analysieren"}
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
