interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon = "📭", title, description, action }: Props) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--ink-3)" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>{title}</div>
      {description && <div style={{ fontSize: 12.5, marginBottom: 16, maxWidth: 360, margin: "0 auto 16px" }}>{description}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
