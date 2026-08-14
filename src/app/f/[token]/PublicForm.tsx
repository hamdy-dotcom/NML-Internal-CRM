"use client";

import { useState, useCallback, FormEvent, ChangeEvent } from "react";
import type { Json, Merchant } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────────────────────

interface SchemaField {
  key: string;
  label: string;       // Arabic label
  label_en: string;    // English label
  type:
    | "text"
    | "tel"
    | "email"
    | "textarea"
    | "select"
    | "multiselect"
    | "number"
    | "date"
    | "file"
    | "checkbox"
    | "signature";
  required: boolean;
  prefill: boolean;
  options_from?: string; // kind key in lookups
}

interface PublicFormProps {
  token: string;
  schema: Json;
  merchant: Partial<Merchant>;
  lookups: Record<string, { value: string; value_ar: string | null }[]>;
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidPhone(value: string): boolean {
  return /^(\+966\d{9}|05\d{8})$/.test(value.trim());
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ── NML Logo ─────────────────────────────────────────────────────────────────

function NMLLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
      <div
        style={{
          width: "2.25rem",
          height: "2.25rem",
          background: "#e02020",
          borderRadius: "0.375rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.125rem",
            fontFamily: "serif",
          }}
        >
          N
        </span>
      </div>
      <span
        style={{
          fontWeight: 600,
          fontSize: "1rem",
          color: "#111827",
          letterSpacing: "-0.01em",
        }}
      >
        NML CRM
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PublicForm({ token, schema, merchant, lookups }: PublicFormProps) {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // Pre-populate prefilled fields from merchant record
    const fields = Array.isArray(schema) ? (schema as unknown as SchemaField[]) : [];
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.prefill && field.key in merchant) {
        initial[field.key] = (merchant as Record<string, unknown>)[field.key] ?? "";
      } else if (field.type === "checkbox") {
        initial[field.key] = false;
      } else if (field.type === "multiselect") {
        initial[field.key] = [];
      } else {
        initial[field.key] = "";
      }
    }
    return initial;
  });
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [filePaths, setFilePaths] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isAr = lang === "ar";
  const fields = Array.isArray(schema) ? (schema as unknown as SchemaField[]) : [];

  // ── Field change handler ─────────────────────────────────────────────────

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  // ── File upload ──────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (key: string, file: File) => {
      setUploading((prev) => ({ ...prev, [key]: true }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        const fd = new FormData();
        fd.append("token", token);
        fd.append("file", file);
        const res = await fetch(`/api/form-upload?token=${encodeURIComponent(token)}`, {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          setErrors((prev) => ({
            ...prev,
            [key]: json.error ?? "فشل رفع الملف",
          }));
        } else {
          setFilePaths((prev) => ({ ...prev, [key]: json.path }));
          setFileNames((prev) => ({ ...prev, [key]: file.name }));
          handleChange(key, json.path);
        }
      } catch {
        setErrors((prev) => ({ ...prev, [key]: "فشل رفع الملف" }));
      } finally {
        setUploading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [token, handleChange],
  );

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.key];
      const empty =
        value === "" ||
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (field.type === "checkbox" && value !== true);

      if (field.required && empty) {
        newErrors[field.key] = "هذا الحقل مطلوب";
        continue;
      }

      if (!empty) {
        if (field.type === "tel") {
          const v = String(value);
          if (v && !isValidPhone(v)) {
            newErrors[field.key] = "يرجى إدخال رقم هاتف صحيح (+966XXXXXXXXX أو 05XXXXXXXX)";
          }
        }
        if (field.type === "email") {
          const v = String(value);
          if (v && !isValidEmail(v)) {
            newErrors[field.key] = "يرجى إدخال بريد إلكتروني صحيح";
          }
        }
      }
    }
    return newErrors;
  }, [fields, values]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const validationErrors = validate();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        const firstKey = Object.keys(validationErrors)[0];
        const el = document.getElementById(`field-${firstKey}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      setSubmitting(true);
      setServerError(null);

      try {
        const res = await fetch("/api/form-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, data: values, files: filePaths }),
        });
        const json = await res.json();
        if (!res.ok) {
          setServerError(json.error ?? "حدث خطأ أثناء الإرسال");
        } else {
          setSubmitted(true);
        }
      } catch {
        setServerError("حدث خطأ في الاتصال، يرجى المحاولة مجدداً");
      } finally {
        setSubmitting(false);
      }
    },
    [validate, token, values, filePaths],
  );

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div
        dir={isAr ? "rtl" : "ltr"}
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f9fafb",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "1rem",
            padding: "2.5rem",
            maxWidth: "30rem",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)",
          }}
        >
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>✅</div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", marginBottom: "0.75rem" }}>
            {isAr ? "تم الإرسال بنجاح!" : "Submitted successfully!"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
            {isAr
              ? "شكراً لك! استلمنا بياناتك بنجاح."
              : "Thank you! We have received your details."}
          </p>
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              textAlign: isAr ? "right" : "left",
            }}
          >
            <p style={{ fontWeight: 600, color: "#166534", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
              {isAr ? "ماذا سيحدث بعد ذلك؟" : "What happens next?"}
            </p>
            <ol style={{ margin: 0, paddingInlineStart: "1.25rem", color: "#15803d", fontSize: "0.875rem", lineHeight: 2 }}>
              <li>{isAr ? "سيراجع فريقنا بياناتك خلال يوم عمل واحد" : "Our team will review your details within one business day"}</li>
              <li>{isAr ? "سيتواصل معك ممثل NML لتأكيد الخطوات التالية" : "Your NML representative will contact you to confirm next steps"}</li>
              <li>{isAr ? "سيُرسل إليك رابط إتمام التسجيل على المنصة" : "You'll receive a platform registration link to complete onboarding"}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // ── Shared input style ────────────────────────────────────────────────────

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "0.625rem 0.875rem",
    border: `1.5px solid ${hasError ? "#ef4444" : "#d1d5db"}`,
    borderRadius: "0.5rem",
    fontSize: "0.9375rem",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#111827",
    background: "#fff",
    transition: "border-color 0.15s",
  });

  // ── Render field ──────────────────────────────────────────────────────────

  function renderField(field: SchemaField) {
    const label = isAr ? field.label : field.label_en;
    const error = errors[field.key];
    const value = values[field.key];
    const options = field.options_from ? (lookups[field.options_from] ?? []) : [];

    return (
      <div key={field.key} style={{ marginBottom: "1.25rem" }}>
        <label
          htmlFor={`field-${field.key}`}
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "#374151",
            marginBottom: "0.375rem",
          }}
        >
          {label}
          {field.required && (
            <span style={{ color: "#ef4444", marginInlineStart: "0.25rem" }}>*</span>
          )}
        </label>

        {/* text / tel / email / number / date */}
        {["text", "tel", "email", "number", "date"].includes(field.type) && (
          <input
            id={`field-${field.key}`}
            type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
            value={String(value ?? "")}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(field.key, e.target.value)}
            style={inputStyle(!!error)}
            dir={field.type === "tel" || field.type === "number" || field.type === "date" ? "ltr" : undefined}
          />
        )}

        {/* textarea */}
        {field.type === "textarea" && (
          <textarea
            id={`field-${field.key}`}
            value={String(value ?? "")}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleChange(field.key, e.target.value)}
            rows={4}
            style={{ ...inputStyle(!!error), resize: "vertical" }}
          />
        )}

        {/* select */}
        {field.type === "select" && (
          <select
            id={`field-${field.key}`}
            value={String(value ?? "")}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange(field.key, e.target.value)}
            style={{ ...inputStyle(!!error), cursor: "pointer" }}
          >
            <option value="">{isAr ? "اختر..." : "Select..."}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {isAr && opt.value_ar ? opt.value_ar : opt.value}
              </option>
            ))}
          </select>
        )}

        {/* multiselect */}
        {field.type === "multiselect" && (
          <div
            style={{
              border: `1.5px solid ${error ? "#ef4444" : "#d1d5db"}`,
              borderRadius: "0.5rem",
              padding: "0.5rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.375rem",
            }}
          >
            {options.map((opt) => {
              const selected = Array.isArray(value) && value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const current = Array.isArray(value) ? value : [];
                    handleChange(
                      field.key,
                      selected ? current.filter((v) => v !== opt.value) : [...current, opt.value],
                    );
                  }}
                  style={{
                    padding: "0.25rem 0.75rem",
                    borderRadius: "2rem",
                    border: `1.5px solid ${selected ? "#e02020" : "#d1d5db"}`,
                    background: selected ? "#fee2e2" : "#f9fafb",
                    color: selected ? "#b91c1c" : "#374151",
                    fontSize: "0.8125rem",
                    fontWeight: selected ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {isAr && opt.value_ar ? opt.value_ar : opt.value}
                </button>
              );
            })}
          </div>
        )}

        {/* file */}
        {field.type === "file" && (
          <div>
            <label
              htmlFor={`field-${field.key}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                border: `1.5px dashed ${error ? "#ef4444" : "#d1d5db"}`,
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "#6b7280",
                background: "#f9fafb",
                width: "100%",
                boxSizing: "border-box",
                justifyContent: "center",
              }}
            >
              {uploading[field.key] ? (
                <>{isAr ? "جاري الرفع..." : "Uploading..."}</>
              ) : fileNames[field.key] ? (
                <>{fileNames[field.key]}</>
              ) : (
                <>{isAr ? "اختر ملفاً" : "Choose a file"}</>
              )}
            </label>
            <input
              id={`field-${field.key}`}
              type="file"
              style={{ display: "none" }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (file) handleFileChange(field.key, file);
              }}
            />
          </div>
        )}

        {/* checkbox (consent) */}
        {field.type === "checkbox" && (
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              cursor: "pointer",
            }}
          >
            <input
              id={`field-${field.key}`}
              type="checkbox"
              checked={value === true}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                handleChange(field.key, e.target.checked)
              }
              style={{ marginTop: "0.25rem", accentColor: "#e02020", flexShrink: 0 }}
            />
            <span style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              {label}
            </span>
          </label>
        )}

        {/* signature */}
        {field.type === "signature" && (
          <div>
            <input
              id={`field-${field.key}`}
              type="text"
              placeholder={isAr ? "اكتب اسمك الكامل بالعربي" : "Type your full name"}
              value={String(value ?? "")}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                handleChange(field.key, e.target.value)
              }
              style={{ ...inputStyle(!!error), fontStyle: "italic" }}
            />
            {!!value && (
              <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem", marginBottom: 0 }}>
                {isAr ? "التوقيع الإلكتروني — " : "Electronic signature — "}
                {new Date().toLocaleString(isAr ? "ar-SA" : "en-US")}
              </p>
            )}
          </div>
        )}

        {/* error message */}
        {error && (
          <p style={{ color: "#ef4444", fontSize: "0.8125rem", marginTop: "0.25rem", marginBottom: 0 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      style={{
        minHeight: "100svh",
        background: "#f3f4f6",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "1.5rem 1rem 4rem",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: "36rem",
          margin: "0 auto 1.5rem",
          padding: "0.75rem 1rem",
          background: "#fff",
          borderRadius: "0.75rem",
          boxShadow: "0 1px 2px rgba(0,0,0,.06)",
        }}
      >
        <NMLLogo />
        <button
          type="button"
          onClick={() => setLang(isAr ? "en" : "ar")}
          style={{
            padding: "0.375rem 0.875rem",
            border: "1.5px solid #e5e7eb",
            borderRadius: "0.5rem",
            background: "#fff",
            fontSize: "0.8125rem",
            fontWeight: 600,
            cursor: "pointer",
            color: "#374151",
            fontFamily: "inherit",
          }}
        >
          {isAr ? "EN" : "عربي"}
        </button>
      </header>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        noValidate
        style={{
          maxWidth: "36rem",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "1rem",
          padding: "2rem 1.75rem",
          boxShadow: "0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)",
        }}
      >
        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "#111827",
            marginBottom: "0.375rem",
            marginTop: 0,
          }}
        >
          {isAr ? "نموذج بيانات التاجر" : "Merchant Information Form"}
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.75rem", marginTop: 0 }}>
          {isAr
            ? "يرجى تعبئة جميع الحقول المطلوبة بعناية"
            : "Please fill in all required fields carefully"}
        </p>

        {fields.map(renderField)}

        {/* Server error */}
        {serverError && (
          <div
            style={{
              background: "#fef2f2",
              border: "1.5px solid #fca5a5",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              color: "#b91c1c",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {serverError}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "0.75rem",
            background: submitting ? "#9ca3af" : "#e02020",
            color: "#fff",
            border: "none",
            borderRadius: "0.625rem",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s",
          }}
        >
          {submitting
            ? isAr
              ? "جاري الإرسال..."
              : "Submitting..."
            : isAr
              ? "إرسال النموذج"
              : "Submit form"}
        </button>
      </form>
    </div>
  );
}
