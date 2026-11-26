import { useEffect, useId, useRef } from "react";
import "./instrument.css";

const centerX = 300;
const centerY = 230;
const tickAngles = Array.from({ length: 180 }, (_, i) => i * 2);
const indexAngles = Array.from({ length: 12 }, (_, i) => i * 30);
const cardinal = ["С", "И", "Ю", "З"];
const registrationPoints = [[41, 89], [558, 87], [48, 359], [557, 369]];
const terrainLevels = Array.from({ length: 19 }, (_, i) => i);
const terrainProfile = "M-124 -3 C-133 -28 -116 -45 -91 -60 S-63 -102 -33 -106 S4 -88 28 -91 S59 -96 77 -76 S85 -46 107 -32 S135 -9 127 13 S101 39 92 62 S69 103 39 94 S4 73 -22 83 S-49 83 -68 66 S-112 54 -118 35 S-118 13 -124 -3Z";

function polar(angle, radius) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: Number((Math.cos(radians) * radius).toFixed(2)),
    y: Number((Math.sin(radians) * radius).toFixed(2)),
  };
}

function Contours({ profileId, x, y, rotate, spread = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${spread})`}>
      {terrainLevels.map((level) => {
        const scale = 0.21 + level * 0.095;
        return (
          <use
            key={level}
            href={`#${profileId}`}
            transform={`translate(${level * -0.85} ${level * 1.1}) scale(${scale} ${scale * (0.79 + level * 0.01)})`}
            fill="none"
            stroke="currentColor"
            strokeWidth={(level % 5 === 0 ? 1 : 0.65) / scale}
            opacity={level % 5 === 0 ? 0.83 : 0.59}
          />
        );
      })}
    </g>
  );
}

function DialScale() {
  return (
    <g>
      {tickAngles.map((angle) => {
        const major = angle % 10 === 0;
        const cardinalTick = angle % 30 === 0;
        return (
          <line
            key={angle}
            transform={`rotate(${angle})`}
            x1="0" x2="0" y1="-183"
            y2={cardinalTick ? -169 : major ? -173 : -178.5}
            stroke={cardinalTick ? "#d1dbcf" : major ? "#849c99" : "#537171"}
            strokeWidth={cardinalTick ? 1.65 : major ? 1.1 : 0.8}
          />
        );
      })}
      {indexAngles.map((angle) => {
        const isCardinal = angle % 90 === 0;
        const point = polar(angle, isCardinal ? 150 : 157);
        return (
          <text
            className={isCardinal ? "cmp-instrument__cardinal" : "cmp-instrument__degree"}
            key={angle}
            x={point.x} y={point.y}
            dy=".35em"
            textAnchor="middle"
            fill={angle === 0 ? "#86ddff" : isCardinal ? "#d7e0d8" : "#a2b3ac"}
          >
            {isCardinal ? cardinal[angle / 90] : String(angle).padStart(3, "0")}
          </text>
        );
      })}
      <path d="M0 -194 l-4 -7 h8 Z" fill="#95dfff" />
      <path d="M0 193 v4 M193 0 h4 M-193 0 h-4" stroke="#9aaba5" strokeWidth="1.5" />
    </g>
  );
}

function DialRose() {
  return (
    <g fill="none">
      <circle r="128" stroke="#527878" strokeWidth=".7" />
      <circle r="119" stroke="#79a29d" strokeWidth=".8" strokeDasharray="1 7" />
      <circle r="83" stroke="#527878" strokeWidth=".6" strokeDasharray="2 4.5" />
      <circle r="42" stroke="#56807d" strokeWidth=".6" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 45})`}>
          <path d="M0 -132 V-38" stroke={i % 2 === 0 ? "#6c8984" : "#436463"} strokeWidth=".7" />
          <path d={i % 2 === 0 ? "M0 -118 L8 -27 L0 -39 Z" : "M0 -77 L5 -27 L0 -33 Z"} fill="#75958d" fillOpacity=".28" />
          <path d={i % 2 === 0 ? "M0 -118 L-8 -27 L0 -39 Z" : "M0 -77 L-5 -27 L0 -33 Z"} fill="#47706f" fillOpacity=".28" />
          <path d="M0 -132 l-2.8 5 h5.6 Z" fill="#8fa9a0" fillOpacity=".75" />
        </g>
      ))}
    </g>
  );
}

export default function Instrument() {
  const id = "instrument" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const graphic = useRef(null);
  const url = (name) => `url(#${id}-${name})`;

  useEffect(() => {
    const svg = graphic.current;
    const observer = new IntersectionObserver(([entry]) => {
      svg.dataset.visible = String(entry.isIntersecting);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  function followPointer(event) {
    if (event.pointerType !== "mouse") return;
    const svg = event.currentTarget;
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    svg.style.setProperty("--cmp-deflection", (x * 30 + y * 12) + "deg");
  }

  return (
    <svg
      ref={graphic}
      onPointerMove={followPointer}
      onPointerLeave={event => event.currentTarget.style.removeProperty("--cmp-deflection")}
      className="cmp-instrument"
      viewBox="0 0 600 460"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={`${id}-aura`}>
          <stop offset=".2" stopColor="#436d69" stopOpacity=".26" />
          <stop offset="1" stopColor="#325957" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-face`} cx="43%" cy="34%" r="79%">
          <stop stopColor="#243868" />
          <stop offset=".46" stopColor="#17274d" />
          <stop offset=".85" stopColor="#101a37" />
          <stop offset="1" stopColor="#0a122a" />
        </radialGradient>
        <linearGradient id={`${id}-bezel`} x1="0" y1="0" x2=".74" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#cfdbff" />
          <stop offset=".2" stopColor="#718ec2" />
          <stop offset=".46" stopColor="#29305c" />
          <stop offset=".69" stopColor="#7066a6" />
          <stop offset=".92" stopColor="#b1c1e7" />
          <stop offset="1" stopColor="#344d79" />
        </linearGradient>
        <linearGradient id={`${id}-needleLight`} x1="0%" y1="0%" x2="65%" y2="100%">
          <stop stopColor="#e1fcff" />
          <stop offset=".35" stopColor="#70e3ff" />
          <stop offset="1" stopColor="#3986fd" />
        </linearGradient>
        <linearGradient id={`${id}-needleDark`} x2="100%" y2="100%">
          <stop stopColor="#829cff" />
          <stop offset=".55" stopColor="#705bf7" />
          <stop offset="1" stopColor="#5134b1" />
        </linearGradient>
        <linearGradient id={`${id}-tailLight`} x2="30%" y2="100%">
          <stop stopColor="#e9eadb" />
          <stop offset=".55" stopColor="#a4b5af" />
          <stop offset="1" stopColor="#c4c9b7" />
        </linearGradient>
        <linearGradient id={`${id}-tailDark`} x2="100%" y2="100%">
          <stop stopColor="#91a09b" />
          <stop offset=".5" stopColor="#61787a" />
          <stop offset="1" stopColor="#9daea3" />
        </linearGradient>
        <pattern id={`${id}-grid`} width="35" height="35" patternUnits="userSpaceOnUse">
          <path d="M35 0 H0 V35" fill="none" stroke="#6f9795" strokeOpacity=".17" strokeWidth=".7" />
          <path d="M0 0 h2 M0 0 v2" stroke="#6f9795" strokeOpacity=".35" strokeWidth="1" />
        </pattern>
        <path id={`${id}-contour`} d={terrainProfile} />
        <clipPath id={`${id}-dialClip`}><circle r="135" /></clipPath>
      </defs>

      <rect width="600" height="460" fill={url("grid")} />
      <g className="cmp-instrument__terrain">
        <Contours x={-9} y={445} rotate={-23} spread={1.36} profileId={`${id}-contour`} />
        <Contours x={640} y={25} rotate={131} spread={1.37} profileId={`${id}-contour`} />
      </g>
      <ellipse cx={centerX} cy={centerY} rx="262" ry="222" fill={url("aura")} />
      <g fill="none" stroke="#708781" strokeWidth=".8" opacity=".64">
        {registrationPoints.map(([x,y]) => (
          <path key={x} d={`M${x - 4} ${y} h8 M${x} ${y - 4} v8`} />
        ))}
      </g>
      <g transform={`translate(${centerX} ${centerY})`}>
        <g fill="none">
          <circle r="213" stroke="#5b817b" strokeOpacity=".29" strokeWidth=".6" strokeDasharray="2 5" />
          <circle r="204" stroke="#607d75" strokeOpacity=".55" strokeWidth=".65" />
          <circle r="198" stroke="#42625f" strokeWidth=".8" />
        </g>
        <g className="cmp-instrument__survey" fill="none" strokeWidth="1.7">
          <circle r="204" stroke="#64ddff" strokeDasharray="98 1184" transform="rotate(-162)" />
          <circle r="204" stroke="#b887ff" strokeDasharray="44 1238" transform="rotate(46)" />
        </g>
        <circle r="191" fill="#101d20" stroke={url("bezel")} strokeWidth="2.7" />
        <circle r="186" fill={url("face")} stroke="#7e9790" strokeWidth=".7" />
        <circle r="167" fill="none" stroke="#708981" strokeWidth=".65" />
        <circle r="139" fill="none" stroke="#75948c" strokeOpacity=".67" strokeWidth=".85" />
        <circle r="136" fill="none" stroke="#97ada3" strokeOpacity=".35" strokeWidth=".6" />
        <g clipPath={url("dialClip")} className="cmp-instrument__inner-terrain">
          <Contours x={-104} y={134} rotate={-23} spread={0.88} profileId={`${id}-contour`} />
          <Contours x={177} y={-102} rotate={131} spread={0.89} profileId={`${id}-contour`} />
        </g>
        <DialScale />
        <DialRose />
        <g className="cmp-instrument__orbit" fill="none">
          <circle r="211" stroke="#67d2ff" strokeWidth=".8" strokeDasharray="120 1206" />
          <circle r="211" stroke="#967aff" strokeWidth="2" strokeDasharray="38 1288" transform="rotate(160)" />
          <circle cx="211" r="3" fill="#a9ecff" />
        </g>
        <g className="cmp-instrument__response"><g className="cmp-instrument__needle" transform="rotate(39)">
          <path d="M0 -165 L21 0 L0 147 L-21 0Z" fill="#081516" fillOpacity=".47" transform="translate(4 5)" />
          <path d="M0 144 L-21 0 L0 -6Z" fill={url("tailDark")} />
          <path d="M0 144 L21 0 L0 -6Z" fill={url("tailLight")} />
          <path d="M0 143 V3" stroke="#c9d3c3" strokeWidth=".65" />
          <path d="M0 -165 L21 0 L0 7Z" fill={url("needleDark")} />
          <path d="M0 -165 L-21 0 L0 7Z" fill={url("needleLight")} />
          <path d="M-20.6 0 L0 -165 L0 -7" stroke="#d7f6ff" strokeOpacity=".76" strokeWidth=".85" fill="none" />
          <circle cy="1.7" r="14.3" fill="#101c20" fillOpacity=".55" />
          <circle r="13.9" fill="#132426" stroke={url("bezel")} strokeWidth="2" />
          <circle r="9.9" fill="#243a3b" stroke="#71837c" strokeWidth=".75" />
          <circle r="4.1" fill="#c6c7ad" stroke="#162424" strokeWidth="1.2" />
          <path d="M-2.1 0 h4.2" stroke="#4b5953" strokeWidth="1" />
        </g></g>
      </g>
    </svg>
  );
}
