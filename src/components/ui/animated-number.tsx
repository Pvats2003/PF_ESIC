"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatINR } from "@/lib/format/money";

/** Counts up to a new total when it changes (instantly with reduced motion). */
export function AnimatedMoney({ paise, className }: { paise: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(paise);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = formatINR(paise);
      prev.current = paise;
      return;
    }
    const controls = animate(prev.current, paise, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = formatINR(Math.round(v / 100) * 100)),
    });
    prev.current = paise;
    return () => controls.stop();
  }, [paise, reduce]);
  return (
    <span ref={ref} className={`tabular ${className ?? ""}`}>
      {formatINR(paise)}
    </span>
  );
}
