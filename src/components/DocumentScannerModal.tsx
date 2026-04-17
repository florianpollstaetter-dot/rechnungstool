"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Point = { x: number; y: number };
type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

interface Props {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

// ─── Edge Detection Helpers ───────────────────────────────────────────────────

function grayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return gray;
}

function gaussianBlur3x3(src: Float32Array, w: number, h: number): Float32Array {
  const dst = new Float32Array(w * h);
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1]; // /16
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += src[(y + ky) * w + (x + kx)] * k[(ky + 1) * 3 + (kx + 1)];
        }
      }
      dst[y * w + x] = sum / 16;
    }
  }
  return dst;
}

function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
        - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
        + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

/** Find the largest quadrilateral in edge map using Hough-like line detection */
function detectDocumentQuad(
  edges: Float32Array,
  w: number,
  h: number,
  threshold: number
): Quad | null {
  // Adaptive threshold: use top percentile of edge magnitudes
  const sorted = Float32Array.from(edges).sort();
  const adaptiveThreshold = Math.max(threshold, sorted[Math.floor(sorted.length * 0.92)]);

  // Accumulate edge points
  const edgePoints: Point[] = [];
  const step = 2;
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      if (edges[y * w + x] > adaptiveThreshold) {
        edgePoints.push({ x, y });
      }
    }
  }

  if (edgePoints.length < 20) return null;

  // Find bounding contour using convex hull approach
  // Split edges into 4 quadrants and find extreme points
  const cx = w / 2;
  const cy = h / 2;

  // For each quadrant, find the point furthest from center
  let bestTL: Point | null = null, bestTR: Point | null = null;
  let bestBL: Point | null = null, bestBR: Point | null = null;
  let maxDistTL = 0, maxDistTR = 0, maxDistBL = 0, maxDistBR = 0;

  for (const p of edgePoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dx <= 0 && dy <= 0 && dist > maxDistTL) { maxDistTL = dist; bestTL = p; }
    if (dx >= 0 && dy <= 0 && dist > maxDistTR) { maxDistTR = dist; bestTR = p; }
    if (dx <= 0 && dy >= 0 && dist > maxDistBL) { maxDistBL = dist; bestBL = p; }
    if (dx >= 0 && dy >= 0 && dist > maxDistBR) { maxDistBR = dist; bestBR = p; }
  }

  if (!bestTL || !bestTR || !bestBR || !bestBL) return null;

  // Refine corners: scan edge lines near each corner
  const refine = (corner: Point, searchRadius: number): Point => {
    const nearby = edgePoints.filter(
      (p) => Math.abs(p.x - corner.x) < searchRadius && Math.abs(p.y - corner.y) < searchRadius
    );
    if (nearby.length < 3) return corner;
    // Average of nearby strong edge points
    let sx = 0, sy = 0;
    for (const p of nearby) { sx += p.x; sy += p.y; }
    return { x: Math.round(sx / nearby.length), y: Math.round(sy / nearby.length) };
  };

  const sr = Math.min(w, h) * 0.08;
  const tl = refine(bestTL, sr);
  const tr = refine(bestTR, sr);
  const br = refine(bestBR, sr);
  const bl = refine(bestBL, sr);

  // Validate: quad area should be at least 10% of image
  const quadArea = 0.5 * Math.abs(
    (tr.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (tr.y - tl.y) +
    (br.x - tr.x) * (bl.y - tr.y) - (bl.x - tr.x) * (br.y - tr.y)
  );
  if (quadArea < w * h * 0.1) return null;

  // Validate: quad should be convex
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const c1 = cross(tl, tr, br);
  const c2 = cross(tr, br, bl);
  const c3 = cross(br, bl, tl);
  const c4 = cross(bl, tl, tr);
  if (!(c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) && !(c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0)) {
    return null;
  }

  return [tl, tr, br, bl];
}

// ─── Perspective Transform ────────────────────────────────────────────────────

function perspectiveTransform(
  srcCanvas: HTMLCanvasElement,
  quad: Quad,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  const srcCtx = srcCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const outData = ctx.createImageData(outW, outH);
  const [tl, tr, br, bl] = quad;
  const sw = srcCanvas.width;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const u = dx / outW;
      const v = dy / outH;
      const sx = (1 - v) * ((1 - u) * tl.x + u * tr.x) + v * ((1 - u) * bl.x + u * br.x);
      const sy = (1 - v) * ((1 - u) * tl.y + u * tr.y) + v * ((1 - u) * bl.y + u * br.y);
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix >= 0 && ix < srcCanvas.width && iy >= 0 && iy < srcCanvas.height) {
        const si = (iy * sw + ix) * 4;
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

// ─── Image Enhancement ────────────────────────────────────────────────────────

function enhanceDocument(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  // Auto-levels: stretch histogram
  let minL = 255, maxL = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }

  // Clip 2% from each end for robustness
  const range = maxL - minL;
  const clipLow = minL + range * 0.02;
  const clipHigh = maxL - range * 0.02;
  const scale = clipHigh > clipLow ? 255 / (clipHigh - clipLow) : 1;

  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - clipLow) * scale)));
    }
  }

  // Slight sharpening via unsharp mask (3x3)
  const w = canvas.width;
  const h = canvas.height;
  const copy = new Uint8ClampedArray(d);
  const sharpenAmount = 0.4;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur =
          (copy[((y - 1) * w + (x - 1)) * 4 + c] +
            2 * copy[((y - 1) * w + x) * 4 + c] +
            copy[((y - 1) * w + (x + 1)) * 4 + c] +
            2 * copy[(y * w + (x - 1)) * 4 + c] +
            4 * copy[(y * w + x) * 4 + c] +
            2 * copy[(y * w + (x + 1)) * 4 + c] +
            copy[((y + 1) * w + (x - 1)) * 4 + c] +
            2 * copy[((y + 1) * w + x) * 4 + c] +
            copy[((y + 1) * w + (x + 1)) * 4 + c]) / 16;
        const sharpened = d[idx + c] + sharpenAmount * (d[idx + c] - blur);
        d[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ─── Component ────────────────────────────────────────────────────────────────

type ScanPhase = "camera" | "adjust" | "processing";

export default function DocumentScannerModal({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectedQuadRef = useRef<Quad | null>(null);
  const stableCountRef = useRef(0);

  const [phase, setPhase] = useState<ScanPhase>("camera");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImageData, setCapturedImageData] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [documentDetected, setDocumentDetected] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  const [enhance, setEnhance] = useState(true);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Kamera-Zugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen."
          : "Kamera konnte nicht gestartet werden."
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Detection loop
  useEffect(() => {
    if (phase !== "camera") return;
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !overlay) return;

    const detectCanvas = document.createElement("canvas");
    const detectCtx = detectCanvas.getContext("2d")!;
    const overlayCtx = overlay.getContext("2d")!;

    let running = true;

    const detect = () => {
      if (!running || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      // Process at reduced resolution for speed
      const scale = Math.min(1, 320 / Math.max(vw, vh));
      const dw = Math.round(vw * scale);
      const dh = Math.round(vh * scale);
      detectCanvas.width = dw;
      detectCanvas.height = dh;
      detectCtx.drawImage(video, 0, 0, dw, dh);

      const imgData = detectCtx.getImageData(0, 0, dw, dh);
      const gray = grayscale(imgData.data, dw, dh);
      const blurred = gaussianBlur3x3(gray, dw, dh);
      const edges = sobelEdges(blurred, dw, dh);

      const detectedQuad = detectDocumentQuad(edges, dw, dh, 30);

      // Draw overlay
      overlay.width = video.clientWidth;
      overlay.height = video.clientHeight;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      if (detectedQuad) {
        const sx = video.clientWidth / dw;
        const sy = video.clientHeight / dh;
        const scaled: Quad = detectedQuad.map((p) => ({
          x: p.x * sx,
          y: p.y * sy,
        })) as Quad;

        // Draw detected document outline
        overlayCtx.beginPath();
        overlayCtx.moveTo(scaled[0].x, scaled[0].y);
        for (let i = 1; i < 4; i++) overlayCtx.lineTo(scaled[i].x, scaled[i].y);
        overlayCtx.closePath();

        // Semi-transparent fill
        overlayCtx.fillStyle = "rgba(0, 210, 180, 0.12)";
        overlayCtx.fill();

        // Outline
        overlayCtx.strokeStyle = "#00d2b4";
        overlayCtx.lineWidth = 2.5;
        overlayCtx.stroke();

        // Corner dots
        for (const p of scaled) {
          overlayCtx.beginPath();
          overlayCtx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          overlayCtx.fillStyle = "#00d2b4";
          overlayCtx.fill();
          overlayCtx.strokeStyle = "white";
          overlayCtx.lineWidth = 2;
          overlayCtx.stroke();
        }

        // Store in original video coordinates for capture
        detectedQuadRef.current = detectedQuad.map((p) => ({
          x: p.x / scale,
          y: p.y / scale,
        })) as Quad;

        stableCountRef.current++;
        if (stableCountRef.current > 5) {
          setDocumentDetected(true);
        }
      } else {
        detectedQuadRef.current = null;
        stableCountRef.current = 0;
        setDocumentDetected(false);
      }

      animFrameRef.current = requestAnimationFrame(detect);
    };

    animFrameRef.current = requestAnimationFrame(detect);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase]);

  // Capture frame
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCapturedImageData(dataUrl);
    setImgSize({ w: video.videoWidth, h: video.videoHeight });

    // Use detected quad or default to full image
    if (detectedQuadRef.current) {
      setQuad(detectedQuadRef.current);
    } else {
      setQuad([
        { x: 0, y: 0 },
        { x: video.videoWidth, y: 0 },
        { x: video.videoWidth, y: video.videoHeight },
        { x: 0, y: video.videoHeight },
      ]);
    }

    stopCamera();
    setPhase("adjust");
  }, [stopCamera]);

  // Re-scan
  const handleRescan = useCallback(() => {
    setCapturedImageData(null);
    setQuad(null);
    setDocumentDetected(false);
    detectedQuadRef.current = null;
    stableCountRef.current = 0;
    setPhase("camera");
    startCamera();
  }, [startCamera]);

  // Auto-detect on captured image
  const handleAutoDetect = useCallback(() => {
    if (!capturedImageData) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      const dw = Math.round(img.width * scale);
      const dh = Math.round(img.height * scale);
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, dw, dh);
      const imgData = ctx.getImageData(0, 0, dw, dh);
      const gray = grayscale(imgData.data, dw, dh);
      const blurred = gaussianBlur3x3(gray, dw, dh);
      const edges = sobelEdges(blurred, dw, dh);
      const detected = detectDocumentQuad(edges, dw, dh, 25);
      if (detected) {
        setQuad(detected.map((p) => ({
          x: p.x / scale,
          y: p.y / scale,
        })) as Quad);
      }
    };
    img.src = capturedImageData;
  }, [capturedImageData]);

  // Submit final image
  const handleSubmit = useCallback(async () => {
    if (!capturedImageData || !quad) return;
    setPhase("processing");

    const img = new Image();
    img.onload = () => {
      // Draw full image to canvas
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext("2d")!;
      srcCtx.drawImage(img, 0, 0);

      // Calculate output dimensions
      const topW = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
      const botW = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
      const leftH = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
      const rightH = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
      const outW = Math.round(Math.max(topW, botW));
      const outH = Math.round(Math.max(leftH, rightH));

      // Perspective transform
      let result = perspectiveTransform(srcCanvas, quad, outW, outH);

      // Enhance if enabled
      if (enhance) {
        result = enhanceDocument(result);
      }

      result.toBlob(
        (blob) => {
          if (!blob) return;
          const file = new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
          onCapture(file);
        },
        "image/jpeg",
        0.92
      );
    };
    img.src = capturedImageData;
  }, [capturedImageData, quad, enhance, onCapture]);

  // Display scaling for adjust phase
  const maxDisplayW = Math.min(400, typeof window !== "undefined" ? window.innerWidth - 48 : 400);
  const maxDisplayH = 400;
  const displayScale = imgSize.w > 0 ? Math.min(maxDisplayW / imgSize.w, maxDisplayH / imgSize.h, 1) : 1;
  const displayW = Math.round(imgSize.w * displayScale);
  const displayH = Math.round(imgSize.h * displayScale);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* ── Camera Phase ── */}
      {phase === "camera" && (
        <>
          {/* Camera viewfinder */}
          <div className="flex-1 relative overflow-hidden bg-black">
            {cameraError ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <svg
                    className="mx-auto mb-3 text-gray-500"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                  <p className="text-gray-400 text-sm">{cameraError}</p>
                  <button
                    onClick={onCancel}
                    className="mt-4 bg-[var(--surface)] text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm"
                  >
                    Schliessen
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                {/* Flash effect */}
                {flashEffect && (
                  <div className="absolute inset-0 bg-white animate-pulse pointer-events-none" />
                )}
                {/* Status bar */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4 pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium">Beleg scannen</span>
                    {documentDetected && (
                      <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium bg-emerald-500/20 px-2.5 py-1 rounded-full">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        Beleg erkannt
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-xs mt-1">
                    Halte den Beleg in die Kamera. Er wird automatisch erkannt.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Bottom controls */}
          {!cameraError && (
            <div className="bg-black/90 border-t border-white/10 px-4 py-5 flex items-center justify-between safe-area-bottom">
              <button
                onClick={onCancel}
                className="text-white/70 text-sm px-3 py-2"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCapture}
                className={`w-16 h-16 rounded-full border-4 transition-all ${
                  documentDetected
                    ? "border-emerald-400 bg-emerald-500/30 shadow-lg shadow-emerald-500/30"
                    : "border-white/60 bg-white/10"
                }`}
                title="Aufnehmen"
              >
                <div
                  className={`w-12 h-12 mx-auto rounded-full transition-all ${
                    documentDetected ? "bg-emerald-400" : "bg-white/80"
                  }`}
                />
              </button>
              <div className="w-16" /> {/* Spacer for alignment */}
            </div>
          )}
        </>
      )}

      {/* ── Adjust Phase ── */}
      {phase === "adjust" && capturedImageData && quad && (
        <div className="flex-1 flex flex-col bg-[var(--background)] overflow-y-auto">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Zuschnitt anpassen</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Ziehe die Ecken um den Beleg herum.
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            <div
              className="relative touch-none select-none"
              style={{ width: displayW, height: displayH }}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;

                let closestIdx = -1;
                let closestDist = 50;
                quad.forEach((p, i) => {
                  const d = Math.hypot(p.x * displayScale - px, p.y * displayScale - py);
                  if (d < closestDist) {
                    closestDist = d;
                    closestIdx = i;
                  }
                });
                if (closestIdx < 0) return;

                const handleMove = (me: PointerEvent) => {
                  const mx = (me.clientX - rect.left) / displayScale;
                  const my = (me.clientY - rect.top) / displayScale;
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
              <img
                src={capturedImageData}
                alt="Aufnahme"
                style={{ width: displayW, height: displayH }}
                className="rounded-lg"
                draggable={false}
              />
              {/* Dark overlay with polygon cutout */}
              <svg
                className="absolute inset-0"
                width={displayW}
                height={displayH}
                style={{ pointerEvents: "none" }}
              >
                <defs>
                  <mask id="scanCropMask">
                    <rect width={displayW} height={displayH} fill="white" />
                    <polygon
                      points={quad.map((p) => `${p.x * displayScale},${p.y * displayScale}`).join(" ")}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width={displayW}
                  height={displayH}
                  fill="rgba(0,0,0,0.5)"
                  mask="url(#scanCropMask)"
                />
                <polygon
                  points={quad.map((p) => `${p.x * displayScale},${p.y * displayScale}`).join(" ")}
                  fill="none"
                  stroke="#00d2b4"
                  strokeWidth="2"
                />
              </svg>
              {/* Draggable corners */}
              {quad.map((p, i) => (
                <div
                  key={i}
                  className="absolute w-7 h-7 bg-[#00d2b4] border-2 border-white rounded-full shadow-lg"
                  style={{
                    left: p.x * displayScale - 14,
                    top: p.y * displayScale - 14,
                    touchAction: "none",
                    pointerEvents: "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Adjust controls */}
          <div className="p-4 border-t border-[var(--border)] space-y-3">
            <div className="flex gap-2">
              <button
                onClick={handleAutoDetect}
                className="bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cyan-500 transition"
              >
                Auto-Erkennung
              </button>
              <button
                onClick={() =>
                  setQuad([
                    { x: 0, y: 0 },
                    { x: imgSize.w, y: 0 },
                    { x: imgSize.w, y: imgSize.h },
                    { x: 0, y: imgSize.h },
                  ])
                }
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--border)] transition"
              >
                Zurücksetzen
              </button>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={enhance}
                  onChange={(e) => setEnhance(e.target.checked)}
                  className="accent-[#00d2b4]"
                />
                Optimieren
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 bg-[#00d2b4] text-black px-4 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 transition"
              >
                Übernehmen
              </button>
              <button
                onClick={handleRescan}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                </svg>
                Neu scannen
              </button>
            </div>
          </div>

          <canvas ref={captureCanvasRef} className="hidden" />
        </div>
      )}

      {/* ── Processing Phase ── */}
      {phase === "processing" && (
        <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-[#00d2b4] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[var(--text-secondary)] text-sm">Wird verarbeitet...</p>
          </div>
        </div>
      )}
    </div>
  );
}
