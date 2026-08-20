"use client";

import { useState, useEffect, FormEvent } from "react";
import type { Json, Merchant } from "@/lib/database.types";

// Props (schema/lookups kept for page.tsx compat; form uses merchant directly)
interface PublicFormProps {
  token: string;
  schema: Json;
  merchant: Partial<Merchant>;
  lookups: Record<string, { value: string; value_ar: string | null }[]>;
}

// ── Design tokens — exact values from NML-CRM-DESIGN-SYSTEM.html ──────────────
const INK   = "#1c2536";
const INK_2 = "#5a6478";
const INK_3 = "#8a93a5";
const INK_4 = "#a8b0bf";
const BLUE  = "#3f7fd6";
const BLUE_D  = "#1d4f8c";
const BLUE_BG = "rgba(226,237,251,.85)";
const GREEN_D  = "#1d5637";
const GREEN_BG = "rgba(217,240,226,.7)";
const AMBER    = "#8a5a10";
const AMBER_BG = "rgba(253,234,204,.72)";
const RED_D    = "#8c2322";
const RED_BG   = "rgba(250,214,214,.65)";
const NML_RED  = "#ed1c24";

const WALLPAPER = "linear-gradient(135deg,#bfd8f5 0%,#dfe3f7 28%,#f6d7e2 55%,#fcd9b4 80%,#f8e9d6 100%)";
const BLUR      = "blur(26px) saturate(1.5)";
const FONT      = "'IBM Plex Sans Arabic', Inter, system-ui, sans-serif";

// Shared surface styles
const phoneCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  padding: 18,
  borderRadius: 26,
  background: "rgba(255,255,255,.55)",
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  border: "1px solid rgba(255,255,255,.75)",
  boxShadow: "0 18px 48px rgba(40,60,110,.18)",
  boxSizing: "border-box",
};

const card: React.CSSProperties = {
  padding: 12,
  borderRadius: 15,
  background: "rgba(255,255,255,.80)",
  border: "1px solid rgba(255,255,255,.85)",
};

// .field / .field.err
const fieldBase: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 13,
  background: "rgba(255,255,255,.9)",
  border: "1px solid rgba(255,255,255,1)",
  fontSize: 12.5,
  fontFamily: FONT,
  color: INK,
  outline: "none",
  boxSizing: "border-box",
  display: "block",
};
const fieldErrStyle: React.CSSProperties = {
  ...fieldBase,
  background: "rgba(250,214,214,.4)",
  border: "1px solid rgba(163,48,47,.3)",
};

// ── .mark (Salla logo badge) ─────────────────────────────────────────────────
function Mark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 9,
        background: "#5c6bc0", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 500,
      }}>S</div>
      <span style={{ fontSize: 14, fontWeight: 500, color: INK }}>سلة</span>
    </div>
  );
}

// ── Wallpaper shell (blobs + gradient) ────────────────────────────────────────
function WallShell({ dir, children }: { dir: "rtl" | "ltr"; children: React.ReactNode }) {
  return (
    <div
      dir={dir}
      style={{
        minHeight: "100svh",
        background: WALLPAPER,
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "1.25rem 1rem 4rem",
      }}
    >
      {/* blob.a — top-right orange */}
      <div style={{
        position: "absolute", top: -80, right: -50,
        width: 320, height: 320, borderRadius: "50%",
        background: "#ff9a5b", opacity: .42, filter: "blur(70px)",
        pointerEvents: "none",
      }} />
      {/* blob.b — bottom-left blue */}
      <div style={{
        position: "absolute", bottom: -100, left: -60,
        width: 340, height: 340, borderRadius: "50%",
        background: "#5b9bf5", opacity: .32, filter: "blur(80px)",
        pointerEvents: "none",
      }} />
      {children}
    </div>
  );
}

// ── Header row (logo + lang toggle) ──────────────────────────────────────────
function Header({ isAr, onToggle }: { isAr: boolean; onToggle: () => void }) {
  return (
    <div style={{
      width: "100%", maxWidth: 380, zIndex: 1,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 14,
    }}>
      <Mark />
      <button
        type="button"
        onClick={onToggle}
        style={{
          padding: "5px 12px", borderRadius: 999,
          background: "rgba(255,255,255,.85)", border: "none",
          fontSize: 12, fontWeight: 500, cursor: "pointer",
          color: INK, fontFamily: FONT,
        }}
      >
        {isAr ? "English" : "عربي"}
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PublicForm({ token, merchant }: PublicFormProps) {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [editingConfirm, setEditingConfirm] = useState(false);

  // Prefilled confirm fields
  const [storeName, setStoreName] = useState(String(merchant.store_name ?? ""));
  const [ownerName, setOwnerName] = useState(String(merchant.owner_name ?? ""));
  const [phone, setPhone]         = useState(String(merchant.phone ?? ""));
  const [email, setEmail]         = useState(String(merchant.email ?? ""));

  // New fields
  const [productsCount, setProductsCount] = useState("");
  const [targetMarkets, setTargetMarkets] = useState<string[]>([]);
  const [notes, setNotes]                 = useState("");
  const [consent, setConsent]             = useState(false);

  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load IBM Plex Sans Arabic
  useEffect(() => {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500&display=swap";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch { /* noop */ } };
  }, []);

  const isAr = lang === "ar";

  function clearErr(key: string) {
    setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  }

  function validate() {
    const e: Record<string, string> = {};
    const req = isAr ? "هذا الحقل مطلوب" : "Required";
    if (!storeName.trim()) e.store_name = req;
    if (!phone.trim())     e.phone = req;
    if (!productsCount.trim() || isNaN(Number(productsCount)) || Number(productsCount) < 0)
      e.products_ready_count = isAr ? "يرجى إدخال عدداً صحيحاً" : "Please enter a valid number";
    if (targetMarkets.length === 0)
      e.target_market = isAr ? "يرجى اختيار وجهة واحدة على الأقل" : "Please select at least one destination";
    if (!consent)
      e.consent = isAr ? "يجب الموافقة للمتابعة" : "You must agree to continue";
    return e;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      const firstKey = Object.keys(errs)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/form-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          data: {
            store_name: storeName.trim(),
            owner_name: ownerName.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            products_ready_count: Number(productsCount),
            target_market: targetMarkets,
            notes: notes.trim() || null,
            consent: true,
          },
          files: {},
        }),
      });
      let json: { error?: string; success?: boolean } = {};
      try {
        json = await res.json();
      } catch {
        setServerError(isAr ? `حدث خطأ في الخادم (${res.status})، يرجى المحاولة مجدداً` : `Server error (${res.status}) — please try again`);
        return;
      }
      if (!res.ok) setServerError(json.error ?? (isAr ? "حدث خطأ أثناء الإرسال" : "Submission error"));
      else setSubmitted(true);
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      setServerError(isNetwork
        ? (isAr ? "حدث خطأ في الاتصال، يرجى المحاولة مجدداً" : "Connection error — please try again")
        : (isAr ? "حدث خطأ غير متوقع، يرجى المحاولة مجدداً" : "Unexpected error — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  // ── kv row ────────────────────────────────────────────────────────────────────
  function kvRow(label: string, value: string, mono = false) {
    return (
      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}>
        <span style={{ color: INK_3 }}>{label}</span>
        <span style={{ color: INK, fontFamily: mono ? "'JetBrains Mono', monospace" : FONT }}>{value || "—"}</span>
      </div>
    );
  }

  // ── Inline error ──────────────────────────────────────────────────────────────
  function inlineErr(key: string) {
    return errors[key] ? (
      <p style={{ color: RED_D, fontSize: 11.5, margin: "3px 0 0", padding: 0 }}>{errors[key]}</p>
    ) : null;
  }

  // ── lbl helper ────────────────────────────────────────────────────────────────
  function lbl(text: string, required = false, optional = false) {
    return (
      <div style={{ fontSize: 11.5, color: INK_2, marginBottom: 5 }}>
        {text}
        {required && <span style={{ color: NML_RED, marginInlineStart: 2 }}>*</span>}
        {optional && <span style={{ color: INK_4, marginInlineStart: 6 }}>{isAr ? "(اختياري)" : "(optional)"}</span>}
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <WallShell dir={isAr ? "rtl" : "ltr"}>
        <Header isAr={isAr} onToggle={() => setLang(isAr ? "en" : "ar")} />
        <div style={{ ...phoneCard, zIndex: 1 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16,
            background: GREEN_BG,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 24, color: GREEN_D }}>✓</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: INK, marginBottom: 7 }}>
            {isAr ? "تم استلام طلبك" : "Request received"}
          </div>
          <div style={{ fontSize: 13, color: INK_2, lineHeight: 1.7, marginBottom: 15 }}>
            {isAr
              ? "تم استلام بياناتك. هذه الخطوات القادمة:"
              : "Your details have been received. Here are the next steps:"}
          </div>
          {[
            {
              n: isAr ? "١" : "1",
              t: isAr ? "مكالمة ترحيبية" : "Welcome call",
              s: isAr ? "خلال يوم عمل" : "Within one business day",
              active: true,
            },
            {
              n: isAr ? "٢" : "2",
              t: isAr ? "مراجعة المنتجات" : "Product review",
              s: isAr ? "مراجعة منتجاتك المرفوعة" : "Your submitted products reviewed",
              active: false,
            },
            {
              n: isAr ? "٣" : "3",
              t: isAr ? "عرض منتجاتك في الفروع" : "Products live in branches",
              s: isAr ? "بعد الاتفاق على الأسعار" : "After pricing is agreed",
              active: false,
            },
          ].map(step => (
            <div key={step.n} style={{ ...card, display: "flex", gap: 10, marginBottom: 7 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: step.active ? INK : "rgba(120,135,160,.25)",
                color: step.active ? "#fff" : INK_2,
                fontSize: 12, fontWeight: 600,
              }}>{step.n}</div>
              <div>
                <div style={{ fontSize: 12.5, color: INK }}>{step.t}</div>
                <div style={{ fontSize: 11.5, color: INK_3 }}>{step.s}</div>
              </div>
            </div>
          ))}
        </div>
      </WallShell>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────
  return (
    <WallShell dir={isAr ? "rtl" : "ltr"}>
      <Header isAr={isAr} onToggle={() => setLang(isAr ? "en" : "ar")} />

      <form onSubmit={handleSubmit} noValidate style={{ ...phoneCard, zIndex: 1 }}>
        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 500, color: INK, marginBottom: 6 }}>
          {isAr ? "تفاصيل متجرك" : "Store Details"}
        </div>
        <div style={{ fontSize: 13, color: INK_2, lineHeight: 1.7, marginBottom: 15 }}>
          {isAr
            ? "راجع بيانات متجرك وأكمل الناقص. التعبئة تستغرق دقيقتين."
            : "Review your store details and fill in the rest. Takes two minutes."}
        </div>

        {/* ── Confirm block (.card) ── */}
        <div style={{ ...card, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
            <span style={{ fontSize: 12.5, color: INK }}>
              {isAr ? "بيانات متجرك" : "Your store details"}
            </span>
            <span style={{
              display: "inline-block", fontSize: 11, padding: "3px 10px", borderRadius: 999,
              background: GREEN_BG, color: GREEN_D, whiteSpace: "nowrap",
            }}>
              {isAr ? "من سلة" : "From Salla"}
            </span>
          </div>

          {editingConfirm ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { id: "store_name", ar: "اسم المتجر",          en: "Store name",      val: storeName, set: setStoreName, dir: undefined as "ltr" | undefined, req: true  },
                { id: "owner_name", ar: "المسؤول",             en: "Contact person",  val: ownerName, set: setOwnerName, dir: undefined as "ltr" | undefined, req: false },
                { id: "phone",      ar: "الجوال",              en: "Mobile",          val: phone,     set: setPhone,     dir: "ltr" as const,     req: true  },
                { id: "email",      ar: "البريد الإلكتروني",   en: "Email",           val: email,     set: setEmail,     dir: "ltr" as const,     req: false },
              ].map(f => (
                <div key={f.id}>
                  {lbl(isAr ? f.ar : f.en, f.req)}
                  <input
                    type="text"
                    dir={f.dir}
                    value={f.val}
                    onChange={e => { f.set(e.target.value); clearErr(f.id); }}
                    style={errors[f.id] ? fieldErrStyle : fieldBase}
                  />
                  {inlineErr(f.id)}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const e: Record<string, string> = {};
                  const req = isAr ? "مطلوب" : "Required";
                  if (!storeName.trim()) e.store_name = req;
                  if (!ownerName.trim()) e.owner_name = req;
                  if (!phone.trim())     e.phone = req;
                  if (Object.keys(e).length) { setErrors(prev => ({ ...prev, ...e })); return; }
                  setEditingConfirm(false);
                }}
                style={{
                  padding: "7px 16px", background: INK, color: "#fff",
                  border: "none", borderRadius: 999, fontSize: 12.5,
                  fontWeight: 500, cursor: "pointer", fontFamily: FONT,
                  alignSelf: "flex-end",
                }}
              >
                {isAr ? "تأكيد" : "Confirm"}
              </button>
            </div>
          ) : (
            <>
              {kvRow(isAr ? "اسم المتجر" : "Store name",     storeName)}
              {kvRow(isAr ? "المسؤول" : "Contact person",    ownerName)}
              {kvRow(isAr ? "الجوال" : "Mobile",             phone, true)}
              {email && kvRow(isAr ? "البريد الإلكتروني" : "Email", email)}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingConfirm(true)}
                onKeyDown={e => e.key === "Enter" && setEditingConfirm(true)}
                style={{ fontSize: 11.5, color: BLUE, marginTop: 8, cursor: "pointer" }}
              >
                {isAr ? "تعديل البيانات" : "Edit details"}
              </div>
            </>
          )}
        </div>

        {/* ── Products count ── */}
        <div style={{ marginBottom: 10 }}>
          {lbl(
            isAr ? "كم عدد المنتجات الجاهزة؟" : "How many products are ready?",
            true,
          )}
          <input
            id="field-products_ready_count"
            type="number"
            min="0"
            dir="ltr"
            value={productsCount}
            onChange={e => { setProductsCount(e.target.value); clearErr("products_ready_count"); }}
            placeholder="0"
            style={errors.products_ready_count ? fieldErrStyle : fieldBase}
          />
          {inlineErr("products_ready_count")}
        </div>

        {/* ── Destination market (multi-select chips) ── */}
        <div id="field-target_market" style={{ marginBottom: 10 }}>
          {lbl(
            isAr ? "أين تريد إضافة منتجاتك؟" : "Where do you want your products added?",
            true,
          )}
          <div style={{
            fontSize: 11.5, color: INK_3, marginBottom: 8,
          }}>
            {isAr ? "يمكنك اختيار أكثر من وجهة" : "You can select more than one"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["بنده", "العثيم", "الدكان", "الدانوب", "نينجا", "هلا ماركت"].map(opt => {
              const selected = targetMarkets.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setTargetMarkets(prev =>
                      prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]
                    );
                    clearErr("target_market");
                  }}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 999,
                    border: selected
                      ? "1.5px solid rgba(31,45,78,.55)"
                      : errors.target_market
                        ? "1.5px solid rgba(163,48,47,.35)"
                        : "1.5px solid rgba(180,190,210,.5)",
                    background: selected
                      ? INK
                      : "rgba(255,255,255,.75)",
                    color: selected ? "#fff" : INK,
                    fontSize: 13,
                    fontFamily: FONT,
                    fontWeight: selected ? 500 : 400,
                    cursor: "pointer",
                    transition: "all .15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {selected && (
                    <span style={{ fontSize: 11, opacity: .85 }}>✓</span>
                  )}
                  {opt}
                </button>
              );
            })}
          </div>
          {inlineErr("target_market")}
        </div>

        {/* ── Notes ── */}
        <div style={{ marginBottom: 10 }}>
          {lbl(isAr ? "ملاحظات أو استفسارات" : "Notes or questions", false, true)}
          <textarea
            id="field-notes"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={isAr ? "اكتب ملاحظاتك هنا…" : "Type your notes here…"}
            style={{ ...fieldBase, resize: "vertical" }}
          />
        </div>

        {/* ── Consent (.card) ── */}
        <label
          htmlFor="field-consent"
          style={{
            ...card,
            display: "flex", gap: 10, alignItems: "flex-start",
            marginBottom: errors.consent ? 4 : 13, cursor: "pointer",
            border: errors.consent
              ? "1px solid rgba(163,48,47,.35)"
              : "1px solid rgba(255,255,255,.85)",
          }}
        >
          <input
            id="field-consent"
            type="checkbox"
            checked={consent}
            onChange={e => { setConsent(e.target.checked); clearErr("consent"); }}
            style={{ marginTop: 2, accentColor: INK, flexShrink: 0, cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: INK_2, lineHeight: 1.6 }}>
            {isAr
              ? "أوافق على المتابعة عبر منصة سلة"
              : "I agree to proceed through Salla Platform"}
          </span>
        </label>
        {errors.consent && (
          <p style={{ color: RED_D, fontSize: 11.5, margin: "0 0 10px" }}>{errors.consent}</p>
        )}

        {/* ── Server error ── */}
        {serverError && (
          <div style={{
            padding: "8px 12px", borderRadius: 10, marginBottom: 10,
            background: RED_BG, color: RED_D, fontSize: 12.5,
          }}>
            {serverError}
          </div>
        )}

        {/* ── Submit (.pill.dark) ── */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "12px 0",
            background: submitting ? "rgba(120,135,160,.5)" : INK,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 500,
            cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: FONT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          {submitting
            ? (isAr ? "جاري الإرسال..." : "Submitting…")
            : (isAr ? "إرسال" : "Submit")}
        </button>
      </form>
    </WallShell>
  );
}

// ── Static wall screen (used by page.tsx for error/expired states) ─────────────
// Exported so page.tsx can use the same wallpaper + card without importing hooks

export { Mark };

interface WallScreenProps {
  dir?: "rtl" | "ltr";
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
  extra?: React.ReactNode;
}

export function WallScreen({ dir = "rtl", icon, iconBg, title, body, extra }: WallScreenProps) {
  return (
    <div
      dir={dir}
      style={{
        minHeight: "100svh",
        background: WALLPAPER,
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ position: "absolute", top: -80, right: -50, width: 320, height: 320, borderRadius: "50%", background: "#ff9a5b", opacity: .42, filter: "blur(70px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -100, left: -60, width: 340, height: 340, borderRadius: "50%", background: "#5b9bf5", opacity: .32, filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ ...phoneCard, zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9,
            background: "#5c6bc0", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 500,
          }}>S</div>
          <span style={{ fontSize: 14, fontWeight: 500, color: INK }}>سلة</span>
        </div>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: iconBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14,
        }}>
          {icon}
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: INK, marginBottom: 7 }}>{title}</div>
        <div style={{ fontSize: 13, color: INK_2, lineHeight: 1.7, marginBottom: extra ? 14 : 0 }}>{body}</div>
        {extra}
      </div>
    </div>
  );
}

// Export tokens for page.tsx
export { AMBER_BG, AMBER, RED_BG, RED_D, BLUE_BG, BLUE_D, GREEN_BG, GREEN_D, INK, INK_2, INK_3, NML_RED };
