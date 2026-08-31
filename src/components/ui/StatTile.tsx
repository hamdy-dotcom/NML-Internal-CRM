interface Props {
  label: string;
  value: number | string;
  tint?: "default" | "blue" | "green" | "amber" | "red";
  description?: string;
  onClick?: () => void;
}

export default function StatTile({ label, value, tint = "default", description, onClick }: Props) {
  return (
    <div
      className={`stat-tile${tint !== "default" ? ` ${tint}` : ""}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <div className="tile-key">{label}</div>
      <div className="tile-value">{typeof value === "number" ? value.toLocaleString("en-US") : value}</div>
      {description && (
        <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2, lineHeight: 1.3 }}>{description}</div>
      )}
    </div>
  );
}
