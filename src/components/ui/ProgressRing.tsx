interface Props {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  color?: string;
  label?: boolean;
}

export default function ProgressRing({ value, size = 48, stroke = 4, color = "var(--blue)", label = true }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,135,160,.18)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      {label && (
        <span style={{ position: "absolute", fontSize: size < 40 ? 9 : 11, fontWeight: 500, fontFamily: "JetBrains Mono, monospace", color: "var(--ink-2)" }}>
          {value}%
        </span>
      )}
    </div>
  );
}
