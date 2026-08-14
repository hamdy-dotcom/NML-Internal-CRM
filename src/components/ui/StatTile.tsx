interface Props {
  label: string;
  value: number | string;
  tint?: "default" | "blue" | "green" | "amber" | "red";
  onClick?: () => void;
}

export default function StatTile({ label, value, tint = "default", onClick }: Props) {
  return (
    <div
      className={`stat-tile${tint !== "default" ? ` ${tint}` : ""}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <div className="tile-key">{label}</div>
      <div className="tile-value">{typeof value === "number" ? value.toLocaleString("en-US") : value}</div>
    </div>
  );
}
