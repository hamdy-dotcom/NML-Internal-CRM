"use client";
import { useState, useMemo, type ReactNode } from "react";

// ── Data ──────────────────────────────────────────────────────────────────────

type Category = "program" | "benefits" | "operations" | "finance";

interface FAQ {
  id: string;
  category: Category;
  q: string;
  a: string | ReactNode;
}

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: "program",    label: "عن البرنامج",       icon: "🏷" },
  { key: "benefits",   label: "فوائد التاجر",       icon: "⭐" },
  { key: "operations", label: "العمليات",            icon: "⚙" },
  { key: "finance",    label: "الحساب والعقود",      icon: "📋" },
];

const FAQS: FAQ[] = [
  // ── About the program ──────────────────────────────────────────────────────
  {
    id: "who",
    category: "program",
    q: "من نحن؟",
    a: "نحن من فريق التسويق من سلة. نخدم برنامج رفوف الأوفلاين (سلة إدارة الأوفلاين ماركت). مقرنا داخل سلة، في مكتب سلة الرئيسي بمدينة جدة.",
  },
  {
    id: "goal",
    category: "program",
    q: "ما هدف البرنامج؟",
    a: "بناءً على الدراسات والإحصاءات التي قامت بها سلة: المنتجات التي يتم الترويج لها وبيعها أونلاين تحقق مبيعات أوفلاين ما يقارب 10 أضعاف مقارنة بالمبيعات الأونلاين — مع فرق واضح في مصروفات التسويق.",
  },
  {
    id: "started",
    category: "program",
    q: "هل بدأتم بالفعل؟",
    a: "نعم، بدأنا بالفعل. البرنامج نشط حالياً ويعمل في عدد من الفروع.",
  },
  {
    id: "where",
    category: "program",
    q: "أين تتواجدون حالياً؟",
    a: "هلا ماركت: حالياً في 3 فروع. سنبدأ في بنده (رفوف بنده). وبعد اليوم الوطني نكمل مع: الدانوب، نينجا، والدكان.",
  },

  // ── Merchant benefits ──────────────────────────────────────────────────────
  {
    id: "benefits",
    category: "benefits",
    q: "ما الفائدة للتاجر من البرنامج؟",
    a: (
      <ul style={{ margin: "6px 0 0", padding: "0 18px", lineHeight: 2 }}>
        <li>تحقق مبيعات أونلاين من خلال الحملات التسويقية.</li>
        <li>تحقق مبيعات أوفلاين من الرفوف بنفس المصاريف، في نفس الوقت.</li>
        <li>زيادة المبيعات أونلاين وأوفلاين بدون أي مصاريف إضافية من جانب التاجر.</li>
        <li>زيادة في الظهور والانتشار للعلامة التجارية في كبرى المتاجر والهايبرات مثل: هلا ماركت، هايبر بنده، وغيرها.</li>
      </ul>
    ),
  },
  {
    id: "benefit-double",
    category: "benefits",
    q: "كيف يستفيد التاجر مرتين من حملة واحدة؟",
    a: "عندما تطلق سلة حملة تسويقية لمنتج التاجر، يُرى المنتج في المتاجر الأونلاين ويُباع أيضاً من رفوف المتاجر الكبرى في نفس الوقت — فيتضاعف الأثر بدون أي تكلفة إضافية على التاجر.",
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    id: "products-selection",
    category: "operations",
    q: "كيف يتم اختيار المنتجات؟",
    a: "اختيار المنتجات سيكون من طرفنا. في حال كان لدى التاجر اقتراحات أخرى يمكننا مناقشتها ودراستها معاً.",
  },
  {
    id: "shipping",
    category: "operations",
    q: "كيف يتم الشحن والتحميل؟",
    a: "الشحن والتحميل من اختصاصنا مبدئياً. نتعامل حالياً مع شركة شامسكو. وفي الأيام القادمة إن شاء الله سيكون هناك تعاملات مع شركات شحن أخرى.",
  },
  {
    id: "quantities",
    category: "operations",
    q: "ما الكميات المطلوبة في البداية؟",
    a: "الكميات المطلوبة في البداية ستكون كميات صغيرة إلى متوسطة. ومع الوقت إن شاء الله تكون أكثر مع التوسع.",
  },

  // ── Finance & Contracts ────────────────────────────────────────────────────
  {
    id: "revenue",
    category: "finance",
    q: "كيف تعمل آلية الحساب والربح؟",
    a: (
      <ul style={{ margin: "6px 0 0", padding: "0 18px", lineHeight: 2 }}>
        <li>نحصل على نسبة ربح على المبيعات فقط.</li>
        <li>النسبة تكون على المبيعات فقط، والباقي يكون مرتجعاً للتاجر.</li>
        <li>يتفق على موعد التسوية المالية.</li>
        <li>يتم إرجاع المنتجات غير المباعة حسب الاتفاق.</li>
      </ul>
    ),
  },
  {
    id: "contract",
    category: "finance",
    q: "ما آلية التعاقد؟",
    a: (
      <ol style={{ margin: "6px 0 0", padding: "0 20px", lineHeight: 2.1 }}>
        <li><strong>تعبئة استمارة</strong> — في حال موافقة العميل، ترسل له الاستمارة ليتم تعبئتها وتوقيعها.</li>
        <li><strong>تحميل تطبيق نمل</strong> — قبل الإطلاق، يقوم العميل بتحميل تطبيق نمل (تطبيق إدارة الطلبات).</li>
        <li><strong>طلب توريد عبر نمل</strong> — يقوم تطبيق نمل بإرسال طلب توريد ثلاثياً إلى المتجر في سلة (مثل الطلبات العادية).</li>
        <li><strong>توريد المنتجات وإطلاق الحملة</strong> — توريد المنتجات للرفوف في المتاجر المتفق عليها (مثل: هلا ماركت، بنده، وغيرها) وبدء حملة الترويج والبيع.</li>
        <li><strong>متابعة المبيعات والبضاعة</strong> — يمكن للعميل متابعة مبيعاته وبضاعته وطلبات التوريد والمرتجعات عبر تطبيق نمل في أي وقت.</li>
      </ol>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function FAQClient() {
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [open,     setOpen]     = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQS.filter(f => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      const text = f.q + " " + (typeof f.a === "string" ? f.a : "");
      return text.toLowerCase().includes(q);
    });
  }, [search, category]);

  const grouped = useMemo(() => {
    const map = new Map<Category, FAQ[]>();
    for (const f of filtered) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, [filtered]);

  return (
    <div dir="rtl" style={{ paddingTop: 16, maxWidth: 760, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px", color: "var(--ink)" }}>
          الأسئلة الشائعة
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
          برنامج سلة إدارة الأوفلاين ماركت — رفوف أوفلاين
        </p>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{
          position: "absolute", insetInlineStart: 13, top: "50%", transform: "translateY(-50%)",
          fontSize: 15, color: "var(--ink-4)", pointerEvents: "none",
        }}>
          🔍
        </span>
        <input
          className="field"
          type="text"
          placeholder="ابحث في الأسئلة…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingInlineStart: 38 }}
        />
      </div>

      {/* Category pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
        <button
          className={`pill${category === "all" ? " active" : ""}`}
          onClick={() => setCategory("all")}
        >
          الكل
          <span style={{ fontSize: 10.5, background: "rgba(0,0,0,.07)", padding: "1px 6px", borderRadius: 999, marginInlineStart: 4 }}>
            {FAQS.length}
          </span>
        </button>
        {CATEGORIES.map(c => {
          const count = FAQS.filter(f => f.category === c.key).length;
          return (
            <button
              key={c.key}
              className={`pill${category === c.key ? " active" : ""}`}
              onClick={() => setCategory(c.key)}
            >
              {c.icon} {c.label}
              <span style={{ fontSize: 10.5, background: "rgba(0,0,0,.07)", padding: "1px 6px", borderRadius: 999, marginInlineStart: 4 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="glass-panel" style={{ padding: "32px 24px", textAlign: "center", color: "var(--ink-3)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 14 }}>لا توجد نتائج مطابقة لـ "{search}"</div>
        </div>
      ) : (
        /* Render by category group */
        CATEGORIES.filter(c => category === "all" || c.key === category).map(cat => {
          const items = grouped.get(cat.key);
          if (!items || items.length === 0) return null;
          return (
            <div key={cat.key} style={{ marginBottom: 24 }}>
              {/* Category header */}
              {category === "all" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 10, fontSize: 13, fontWeight: 600, color: "var(--ink-2)",
                }}>
                  <span style={{ fontSize: 16 }}>{cat.icon}</span>
                  {cat.label}
                  <div style={{ flex: 1, height: 1, background: "var(--g-line)", marginInlineStart: 4 }} />
                </div>
              )}

              {/* FAQ accordion cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(faq => {
                  const isOpen = open.has(faq.id);
                  return (
                    <div
                      key={faq.id}
                      className="glass-panel"
                      style={{
                        overflow: "hidden",
                        border: isOpen ? "1px solid rgba(63,127,214,.22)" : undefined,
                        transition: "border-color .15s",
                      }}
                    >
                      {/* Question row */}
                      <button
                        type="button"
                        onClick={() => toggle(faq.id)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center",
                          gap: 12, padding: "14px 16px",
                          background: "none", border: "none", cursor: "pointer",
                          textAlign: "right",
                        }}
                      >
                        {/* Toggle indicator */}
                        <span style={{
                          width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: isOpen ? "var(--blue)" : "rgba(120,135,160,.14)",
                          color: isOpen ? "#fff" : "var(--ink-3)",
                          fontSize: 13, transition: "all .15s",
                          marginInlineStart: "auto",
                        }}>
                          {isOpen ? "−" : "+"}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", lineHeight: 1.5, flex: 1 }}>
                          {faq.q}
                        </span>
                      </button>

                      {/* Answer */}
                      {isOpen && (
                        <div style={{
                          padding: "0 16px 16px",
                          fontSize: 13,
                          color: "var(--ink-2)",
                          lineHeight: 1.8,
                          borderTop: "1px solid var(--g-line)",
                          paddingTop: 14,
                        }}>
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
