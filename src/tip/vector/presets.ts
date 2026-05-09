// Shape preset library. Adapted from VectorShaper-main/vector-module/presets.
// All coordinates are normalized [0,1].

import type { VectorShape } from "./types";

export const VECTOR_PRESETS: Record<string, VectorShape> = {
  triangle: {
    closed: true,
    points: [
      { x: 0.5, y: 0.15 },
      { x: 0.85, y: 0.8 },
      { x: 0.15, y: 0.8 },
    ],
  },
  square: {
    closed: true,
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ],
  },
  pentagon: {
    closed: true,
    points: [
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.4 },
      { x: 0.75, y: 0.85 },
      { x: 0.25, y: 0.85 },
      { x: 0.1, y: 0.4 },
    ],
  },
  hexagon: {
    closed: true,
    points: (() => {
      const arr: { x: number; y: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        arr.push({ x: 0.5 + 0.4 * Math.cos(a), y: 0.5 + 0.4 * Math.sin(a) });
      }
      return arr;
    })(),
  },
  star: {
    closed: true,
    points: (() => {
      const arr: { x: number; y: number }[] = [];
      const ro = 0.45, ri = 0.18;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? ro : ri;
        arr.push({ x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) });
      }
      return arr;
    })(),
  },
  arrow: {
    closed: true,
    points: [
      { x: 0.1, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.6, y: 0.2 },
      { x: 0.95, y: 0.5 },
      { x: 0.6, y: 0.8 },
      { x: 0.6, y: 0.6 },
      { x: 0.1, y: 0.6 },
    ],
  },
  heart: {
    closed: true,
    points: [
      { x: 0.5, y: 0.32, curve: { controlX: 0.5, controlY: 0.05 } },
      { x: 0.95, y: 0.32, curve: { controlX: 0.95, controlY: 0.7 } },
      { x: 0.5, y: 0.92, curve: { controlX: 0.05, controlY: 0.7 } },
      { x: 0.05, y: 0.32, curve: { controlX: 0.5, controlY: 0.05 } },
    ],
  },
  // Quadratic-Bezier circle approximation (4 quadrants).
  circle: {
    closed: true,
    points: [
      { x: 0.5, y: 0.05, curve: { controlX: 0.95, controlY: 0.05 } },
      { x: 0.95, y: 0.5, curve: { controlX: 0.95, controlY: 0.95 } },
      { x: 0.5, y: 0.95, curve: { controlX: 0.05, controlY: 0.95 } },
      { x: 0.05, y: 0.5, curve: { controlX: 0.05, controlY: 0.05 } },
    ],
  },
  // A leaf — pointed at top and bottom, bulging in middle.
  leaf: {
    closed: true,
    points: [
      { x: 0.5, y: 0.05, curve: { controlX: 0.95, controlY: 0.5 } },
      { x: 0.5, y: 0.95, curve: { controlX: 0.05, controlY: 0.5 } },
    ],
  },
};

export const PRESET_NAMES = Object.keys(VECTOR_PRESETS);
