import type { SkyMood } from "@/lib/livepoint/weather/labels";

type IconKind = "clear" | "fair" | "cloudy" | "rain" | "snow" | "fog" | "night";

function kindFromCode(symbolCode: string | null | undefined, mood: SkyMood): IconKind {
  const code = symbolCode ?? "";
  if (code.includes("fog")) return "fog";
  if (code.includes("snow") || code.includes("sleet")) return "snow";
  if (code.includes("rain") || code.includes("thunder")) return "rain";
  if (code.includes("cloudy") && !code.includes("partly") && !code.includes("fair")) return "cloudy";
  if (mood === "night" && !code.includes("rain") && !code.includes("snow")) return "night";
  if (code.includes("partly") || code.includes("fair")) return "fair";
  if (code.includes("clearsky")) return "clear";
  return mood === "clear" ? "clear" : "fair";
}

export function WeatherSymbolIcon({
  symbolCode,
  mood,
  className = "size-16",
  animated = false,
}: {
  symbolCode: string | null | undefined;
  mood: SkyMood;
  className?: string;
  animated?: boolean;
}) {
  const kind = kindFromCode(symbolCode, mood);
  const motion = animated ? "np-weather-icon-float" : "";

  return (
    <svg
      viewBox="0 0 64 64"
      className={`${className} ${motion} drop-shadow-[0_8px_24px_rgb(0_0_0_/_0.35)]`}
      aria-hidden="true"
    >
      {kind === "night" ? (
        <>
          <circle cx="46" cy="18" r="9" fill="#fde68a" />
          <circle cx="48" cy="18" r="9" fill="#1e3a5f" />
        </>
      ) : null}
      {kind === "clear" ? (
        <>
          <circle cx="34" cy="28" r="14" fill="#fcd34d" />
          <g stroke="#fcd34d" strokeWidth="2" strokeLinecap="round">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1={34 + Math.cos((deg * Math.PI) / 180) * 18}
                y1={28 + Math.sin((deg * Math.PI) / 180) * 18}
                x2={34 + Math.cos((deg * Math.PI) / 180) * 22}
                y2={28 + Math.sin((deg * Math.PI) / 180) * 22}
              />
            ))}
          </g>
        </>
      ) : null}
      {kind === "fair" ? (
        <>
          <circle cx="22" cy="26" r="9" fill="#fcd34d" />
          <ellipse cx="38" cy="36" rx="18" ry="11" fill="white" opacity="0.95" />
        </>
      ) : null}
      {kind === "cloudy" || kind === "fog" ? (
        <>
          <ellipse cx="32" cy="34" rx="20" ry="12" fill="white" opacity={kind === "fog" ? 0.75 : 0.92} />
          <ellipse cx="44" cy="38" rx="16" ry="10" fill="#e2e8f0" opacity={kind === "fog" ? 0.7 : 0.88} />
        </>
      ) : null}
      {kind === "rain" ? (
        <>
          <ellipse cx="32" cy="32" rx="20" ry="12" fill="white" opacity="0.9" />
          <g stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" className={animated ? "np-weather-rain-streaks" : ""}>
            <line x1="26" y1="46" x2="22" y2="54" />
            <line x1="34" y1="46" x2="30" y2="54" />
            <line x1="42" y1="46" x2="38" y2="54" />
          </g>
        </>
      ) : null}
      {kind === "snow" ? (
        <>
          <ellipse cx="32" cy="32" rx="20" ry="12" fill="white" opacity="0.92" />
          <g fill="#e0f2fe" className={animated ? "np-weather-snow-drift" : ""}>
            <circle cx="28" cy="50" r="2" />
            <circle cx="36" cy="52" r="1.8" />
            <circle cx="44" cy="49" r="2" />
          </g>
        </>
      ) : null}
      {kind === "fog" ? (
        <g stroke="white" strokeWidth="2" opacity="0.5">
          <line x1="14" y1="48" x2="50" y2="48" />
          <line x1="18" y1="54" x2="46" y2="54" />
        </g>
      ) : null}
    </svg>
  );
}
