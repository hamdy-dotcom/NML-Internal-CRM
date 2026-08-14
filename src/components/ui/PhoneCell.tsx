import { waLink, telLink } from "@/lib/utils";

interface Props {
  phone: string | null;
  whatsapp?: string | null;
}

export default function PhoneCell({ phone, whatsapp }: Props) {
  const display = phone ?? whatsapp;
  const wa = waLink(whatsapp ?? phone ?? null);
  const tel = telLink(phone ?? whatsapp ?? null);

  if (!display) return <span style={{ color: "var(--ink-4)" }}>—</span>;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {tel && (
        <a href={tel} className="mono" style={{ color: "var(--ink-2)", textDecoration: "none", fontSize: 12 }}>
          {display}
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={{ color: "#25D366", textDecoration: "none" }}>
          💬
        </a>
      )}
    </span>
  );
}
