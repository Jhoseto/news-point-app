import type { CSSProperties } from "react";

export function cardShineStyle(shineDelaySec: number | undefined): { className: string; style?: CSSProperties } {
  if (shineDelaySec === undefined) return { className: "" };
  return {
    className: "np-shine-image",
    style: { "--np-shine-delay": `${shineDelaySec}s` } as CSSProperties,
  };
}

/** For exactOptionalPropertyTypes — omit prop when there is no shine slot. */
export function shineDelayProp(sec: number | undefined): { shineDelaySec?: number } {
  return sec !== undefined ? { shineDelaySec: sec } : {};
}
