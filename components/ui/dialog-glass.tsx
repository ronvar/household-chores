"use client";

import { Glass } from "@samasante/liquid-glass";

export default function DialogGlass() {
  return <Glass className="dialog-glass" aria-hidden="true" radius={28} optics={{ frost: 2, saturate: 1.12, brightness: 0, strength: 0.025, depth: 0.4, curvature: 0.16, dispersion: 0.18, bend: 0.28, bendWidth: 0.14, splay: 0, specular: 1.15, sheen: 0.4, sheenWidth: 4, sheenFalloff: 1.5, glow: 0.16, glowSpread: 1, glowFalloff: 0.5 }}><span className="glass-surface-fill" /></Glass>;
}
