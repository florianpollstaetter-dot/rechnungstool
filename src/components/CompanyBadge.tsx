"use client";

import Image from "next/image";

interface CompanyBadgeProps {
  /** Company id — used to seed the deterministic fallback colour + as React key */
  id: string;
  /** Company display name — used for alt + initials */
  name: string;
  /** Logo URL. Falsy (empty string, null, undefined) triggers the initials fallback. */
  logoUrl?: string | null;
  /** Pixel size of the square badge. Default 24. */
  size?: number;
  /** Optional extra classes on the outer element. */
  className?: string;
}

// Palette chosen to stay legible on the app's dark surfaces.
const PALETTE = [
  "#F97316", // orange
  "#EAB308", // amber
  "#84CC16", // lime
  "#14B8A6", // teal
  "#0EA5E9", // sky
  "#6366F1", // indigo
  "#A855F7", // purple
  "#EC4899", // pink
  "#EF4444", // red
];

function pickColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsFor(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "·";
  const words = cleaned
    .split(/\s+/)
    .filter((w) => !/^(gmbh|kg|og|ag|ltd|llc|sarl|s\.p\.a\.?|inc|co|e\.u\.?)$/i.test(w))
    .slice(0, 2);
  if (words.length === 0) return cleaned[0].toUpperCase();
  if (words.length === 1) {
    const w = words[0];
    return (w[0] + (w[1] ?? "")).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function CompanyBadge({
  id,
  name,
  logoUrl,
  size = 24,
  className = "",
}: CompanyBadgeProps) {
  const hasLogo = typeof logoUrl === "string" && logoUrl.trim().length > 0;
  if (hasLogo) {
    // Keying on `id` forces a re-mount on company switch so Next.js doesn't
    // diff the `<img>` and briefly show the previous company's cached src.
    return (
      <Image
        key={id}
        src={logoUrl as string}
        alt={name}
        width={size}
        height={size}
        className={`rounded ${className}`}
        style={{ filter: "var(--logo-filter)" }}
      />
    );
  }

  const initials = initialsFor(name);
  const bg = pickColour(id || name);
  const fontSize = Math.max(9, Math.round(size * 0.42));
  return (
    <span
      key={id}
      aria-label={name}
      role="img"
      className={`inline-flex items-center justify-center rounded font-semibold text-white select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize, lineHeight: 1 }}
    >
      {initials}
    </span>
  );
}
