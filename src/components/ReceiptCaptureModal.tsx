"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PAYMENT_METHOD_OPTIONS, PaymentMethod } from "@/lib/types";

const ACCOUNT_OPTIONS = [
  { value: "", label: "— Konto wählen —" },
  { value: "5000", label: "5000 Wareneinkauf" },
  { value: "5880", label: "5880 Reisekosten" },
  { value: "6000", label: "6000 Mietaufwand" },
  { value: "6300", label: "6300 Versicherungen" },
  { value: "6800", label: "6800 Porto/Telefon" },
  { value: "7200", label: "7200 Büroaufwand" },
  { value: "7300", label: "7300 Rechts-/Beratung" },
  { value: "7400", label: "7400 Werbung/Marketing" },
  { value: "7600", label: "7600 Telefonkosten" },
  { value: "7650", label: "7650 Internet/EDV" },
  { value: "7700", label: "7700 KFZ-Aufwand" },
  { value: "7780", label: "7780 Bewirtung" },
  { value: "7790", label: "7790 Catering Projekte" },
  { value: "7795", label: "7795 Geschäftsanbahnung" },
  { value: "7800", label: "7800 Abschreibungen" },
  { value: "7890", label: "7890 GWG (< 1000 EUR)" },
  { value: "8000", label: "8000 Sonstige Aufwendungen" },
];

type Point = { x: number; y: number };
type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

interface Props {
  imageFile?: File;
  imageUrl?: string;
  editMode?: boolean;
  onSubmit?: (croppedFile: File, meta: { purpose: string; account_debit: string; account_label: string; payment_method: PaymentMethod }) => void;
  onSaveCrop?: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

// Perspective transform: warp quadrilateral to rectangle
function perspectiveTransform(
  srcImg: HTMLImageElement,
  quad: Quad,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Source canvas to read pixels
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcImg.width;
  srcCanvas.height = srcImg.height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(srcImg, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcImg.width, srcImg.height);
  const outData = ctx.createImageData(outW, outH);

  const [tl, tr, br, bl] = quad;

  // Bilinear interpolation from unit square to quad
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const u = dx / outW;
      const v = dy / outH;
      // Bilinear mapping
      const sx = (1 - v) * ((1 - u) * tl.x + u * tr.x) + v * ((1 - u) * bl.x + u * br.x);
      const sy = (1 - v) * ((1 - u) * tl.y + u * tr.y) + v * ((1 - u) * bl.y + u * br.y);
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix >= 0 && ix < srcImg.width && iy >= 0 && iy < srcImg.height) {
        const si = (iy * srcImg.width + ix) * 4;
        const di = (dy * outW + dx) * 4;
        outData.data[di] = srcData.data[si];
        outData.data[di + 1] = srcData.data[si + 1];
        outData.data[di + 2] = srcData.data[si + 2];
        outData.data[di + 3] = srcData.data[si + 3];
      }
    }
  }

  ctx.putImageData(outData, 0, 0);
  return canvas;
}

function autoCropQuad(canvas: HTMLCanvasElement, imgW: number, imgH: number): Quad {
  const ctx = canvas.getContext("2d");
  if (!ctx) return defaultQuad(imgW, imgH);

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Sample corners for background color
    const sampleSize = Math.max(5, Math.round(Math.min(w, h) * 0.03));
    let bgR = 0, bgG = 0, bgB = 0, cnt = 0;
    for (let y = 0; y < sampleSize; y++) {
      for (let x = 0; x < sampleSize; x++) {
        for (const [ox, oy] of [[0, 0], [w - sampleSize, 0], [0, h - sampleSize], [w - sampleSize, h - sampleSize]]) {
          const i = ((oy + y) * w + (ox + x)) * 4;
          bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2]; cnt++;
        }
      }
    }
    bgR /= cnt; bgG /= cnt; bgB /= cnt;

    const threshold = 40;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    const step = Math.max(1, Math.round(Math.min(w, h) / 400));

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const dist = Math.sqrt((data[i] - bgR) ** 2 + (data[i + 1] - bgG) ** 2 + (data[i + 2] - bgB) ** 2);
        if (dist > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const margin = Math.max(3, Math.round(Math.min(w, h) * 0.01));
    minX = Math.max(0, minX - margin);
    minY = Math.max(0, minY - margin);
    maxX = Math.min(w, maxX + margin);
    maxY = Math.min(h, maxY + margin);

    if (maxX <= minX || maxY <= minY || (maxX - minX) * (maxY - minY) < w * h * 0.1) {
      return defaultQuad(imgW, imgH);
    }

    // Scale back to original image coordinates
    const sx = imgW / w;
    const sy = imgH / h;
    return [
      { x: minX * sx, y: minY * sy },
      { x: maxX * sx, y: minY * sy },
      { x: maxX * sx, y: maxY * sy },
      { x: minX * sx, y: maxY * sy },
    ];
  } catch {
    return defaultQuad(imgW, imgH);
  }
}

function defaultQuad(w: number, h: number): Quad {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

export default function ReceiptCaptureModal({ imageFile, imageUrl, editMode, onSubmit, onSaveCrop, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
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
      setQuad(defaultQuad(img.width, img.height));
    };
    img.src = src;
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageFile, imageUrl]);

  const handleAutoCrop = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const maxSize = 600;
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = autoCropQuad(canvas, img.width, img.height);
    setQuad(result);
  }, []);

  async function handleSubmit() {
    if (!imgRef.current || !quad) return;
    setSubmitting(true);

    // Calculate output dimensions from quad
    const topW = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
    const botW = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
    const leftH = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
    const rightH = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
    const outW = Math.round(Math.max(topW, botW));
    const outH = Math.round(Math.max(leftH, rightH));

    const resultCanvas = perspectiveTransform(imgRef.current, quad, outW, outH);
    const blob = await new Promise<Blob>((resolve) => resultCanvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92));

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

  // Display scaling
  const maxDisplayW = Math.min(400, typeof window !== "undefined" ? window.innerWidth - 48 : 400);
  const maxDisplayH = 400;
  const scale = imgSize.w > 0 ? Math.min(maxDisplayW / imgSize.w, maxDisplayH / imgSize.h, 1) : 1;
  const displayW = Math.round(imgSize.w * scale);
  const displayH = Math.round(imgSize.h * scale);

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3" onClick={onCancel}>
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 sm:p-6 w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Beleg bearbeiten</h2>

        {/* Image with 4 draggable corner points */}
        {imageSrc && quad && (
          <div
            className="relative mx-auto mb-3 touch-none select-none"
            style={{ width: displayW, height: displayH }}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - rect.left;
              const py = e.clientY - rect.top;

              // Find closest corner
              let closestIdx = -1;
              let closestDist = 50; // max touch distance
              quad.forEach((p, i) => {
                const d = Math.hypot(p.x * scale - px, p.y * scale - py);
                if (d < closestDist) { closestDist = d; closestIdx = i; }
              });
              if (closestIdx < 0) return;

              const handleMove = (me: PointerEvent) => {
                const mx = (me.clientX - rect.left) / scale;
                const my = (me.clientY - rect.top) / scale;
                const cx = Math.max(0, Math.min(Math.round(mx), imgSize.w));
                const cy = Math.max(0, Math.min(Math.round(my), imgSize.h));
                setQuad((prev) => {
                  if (!prev) return prev;
                  const next = [...prev] as Quad;
                  next[closestIdx] = { x: cx, y: cy };
                  return next;
                });
              };
              const handleUp = () => {
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
              };
              window.addEventListener("pointermove", handleMove);
              window.addEventListener("pointerup", handleUp);
              e.preventDefault();
            }}
          >
            <img src={imageSrc} alt="Beleg" style={{ width: displayW, height: displayH }} className="rounded-lg" draggable={false} />
            {/* Dark overlay with polygon cutout */}
            <svg className="absolute inset-0" width={displayW} height={displayH} style={{ pointerEvents: "none" }}>
              <defs>
                <mask id="cropMask">
                  <rect width={displayW} height={displayH} fill="white" />
                  <polygon
                    points={quad.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width={displayW} height={displayH} fill="rgba(0,0,0,0.5)" mask="url(#cropMask)" />
              <polygon
                points={quad.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
              />
              {/* Corner lines between adjacent points */}
            </svg>
            {/* Draggable corner handles */}
            {quad.map((p, i) => (
              <div
                key={i}
                className="absolute w-6 h-6 bg-[var(--accent)] border-2 border-white rounded-full shadow-lg"
                style={{ left: p.x * scale - 12, top: p.y * scale - 12, touchAction: "none", pointerEvents: "none" }}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <button onClick={handleAutoCrop} className="bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cyan-500 transition">
            Auto-Zuschnitt
          </button>
          <button onClick={() => imgSize.w > 0 && setQuad(defaultQuad(imgSize.w, imgSize.h))} className="bg-[var(--surface-hover)] text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--border)] transition">
            Zurücksetzen
          </button>
        </div>

        {/* Form fields (hidden in edit mode) */}
        {!editMode && <div className="space-y-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Projekttitel / Verwendungszweck</label>
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="z.B. Büroausstattung" className={inputClass} />
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

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
