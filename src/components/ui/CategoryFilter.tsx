"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CategoryCount {
  value: string;
  count: number;
}

interface Props {
  nmlCategory: string;
  nmlSubcategory: string;
  onChange: (cat: string, sub: string) => void;
  /** Called once on mount. Must return [{value, count}] sorted by count desc. */
  loadCategories: () => Promise<CategoryCount[]>;
  /** Called each time nmlCategory changes. Must return subcategory options for that category. */
  loadSubcategories: (category: string) => Promise<CategoryCount[]>;
}

interface DropdownState {
  open: boolean;
  search: string;
}

function Dropdown({
  id, label, value, options, state, disabled,
  onSearchChange, onOpen, onClose, onSelect, onClear,
}: {
  id: string;
  label: string;
  value: string;
  options: CategoryCount[];
  state: DropdownState;
  disabled?: boolean;
  onSearchChange: (s: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (v: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = options
    .filter(o => !state.search || o.value.toLowerCase().includes(state.search.toLowerCase()))
    .slice(0, 40);

  return (
    <div style={{ position: "relative", flex: "1 1 180px", minWidth: 150 }}>
      <label style={{
        display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)",
        marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em",
      }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <button
          id={id}
          onClick={() => { if (!disabled) { state.open ? onClose() : onOpen(); } }}
          disabled={disabled}
          style={{
            width: "100%", padding: "8px 32px 8px 12px", borderRadius: 8,
            border: "1px solid var(--g-line)",
            background: disabled ? "rgba(0,0,0,.03)" : value ? "rgba(220,38,38,.05)" : "rgba(255,255,255,.7)",
            color: disabled ? "var(--ink-4)" : value ? "var(--ink)" : "var(--ink-3)",
            fontSize: 13, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            boxSizing: "border-box", direction: "rtl",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {value || (disabled ? "— select category first —" : `All ${label.toLowerCase()}s`)}
          </span>
          <span style={{ fontSize: 9, opacity: .5, flexShrink: 0, marginRight: 6, direction: "ltr" }}>
            {state.open ? "▲" : "▼"}
          </span>
        </button>
        {value && !disabled && (
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)",
              fontSize: 16, lineHeight: 1, padding: "0 2px",
            }}
          >
            ×
          </button>
        )}
      </div>

      {state.open && !disabled && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, marginTop: 4,
          background: "rgba(255,255,255,.99)", border: "1px solid var(--g-line)",
          borderRadius: 10, boxShadow: "0 12px 32px rgba(40,60,110,.16)",
          display: "flex", flexDirection: "column", maxHeight: 280,
        }}>
          {/* Search inside dropdown */}
          <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid rgba(0,0,0,.06)", flexShrink: 0 }}>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              placeholder="Search…"
              value={state.search}
              onChange={e => onSearchChange(e.target.value)}
              style={{
                width: "100%", padding: "5px 9px", borderRadius: 7,
                border: "1px solid var(--g-line)", background: "var(--g-panel, #f5f6f8)",
                fontSize: 12.5, boxSizing: "border-box", outline: "none",
                color: "var(--ink)",
              }}
            />
          </div>

          {/* "All X" option */}
          <div
            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12.5, color: "var(--ink-3)", flexShrink: 0 }}
            onMouseDown={e => { e.preventDefault(); onSelect(""); }}
          >
            All {label.toLowerCase()}s
          </div>

          {/* Options */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--ink-3)" }}>No matches</div>
            ) : visible.map(o => (
              <div
                key={o.value}
                onMouseDown={e => { e.preventDefault(); onSelect(o.value); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "8px 12px", cursor: "pointer", fontSize: 13,
                  borderTop: "1px solid rgba(0,0,0,.03)",
                  background: value === o.value ? "rgba(220,38,38,.06)" : "transparent",
                  direction: "rtl",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.value}</span>
                <span style={{ color: "var(--ink-3)", fontSize: 11, flexShrink: 0, direction: "ltr", fontVariantNumeric: "tabular-nums" }}>
                  {o.count.toLocaleString("en-US")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoryFilter({ nmlCategory, nmlSubcategory, onChange, loadCategories, loadSubcategories }: Props) {
  const [catOptions, setCatOptions] = useState<CategoryCount[]>([]);
  const [subOptions, setSubOptions] = useState<CategoryCount[]>([]);
  const [catState,   setCatState]   = useState<DropdownState>({ open: false, search: "" });
  const [subState,   setSubState]   = useState<DropdownState>({ open: false, search: "" });
  const containerRef = useRef<HTMLDivElement>(null);

  // Load categories once
  useEffect(() => {
    loadCategories().then(setCatOptions).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload subcategories when category changes
  const prevCat = useRef("");
  useEffect(() => {
    if (nmlCategory && nmlCategory !== prevCat.current) {
      prevCat.current = nmlCategory;
      setSubOptions([]);
      loadSubcategories(nmlCategory).then(setSubOptions).catch(() => {});
    } else if (!nmlCategory) {
      prevCat.current = "";
      setSubOptions([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nmlCategory]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!catState.open && !subState.open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCatState(s => ({ ...s, open: false }));
        setSubState(s => ({ ...s, open: false }));
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catState.open, subState.open]);

  const selectCategory = useCallback((v: string) => {
    setCatState(s => ({ ...s, open: false, search: "" }));
    onChange(v, ""); // selecting a category always clears subcategory
  }, [onChange]);

  const selectSubcategory = useCallback((v: string) => {
    setSubState(s => ({ ...s, open: false, search: "" }));
    onChange(nmlCategory, v);
  }, [onChange, nmlCategory]);

  return (
    <div ref={containerRef}>
      {/* Two dropdowns side by side */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Dropdown
          id="cat-filter"
          label="Category"
          value={nmlCategory}
          options={catOptions}
          state={catState}
          onSearchChange={s => setCatState(prev => ({ ...prev, search: s }))}
          onOpen={() => { setCatState(s => ({ ...s, open: true })); setSubState(s => ({ ...s, open: false })); }}
          onClose={() => setCatState(s => ({ ...s, open: false }))}
          onSelect={selectCategory}
          onClear={() => selectCategory("")}
        />
        <Dropdown
          id="sub-filter"
          label="Subcategory"
          value={nmlSubcategory}
          options={subOptions}
          state={subState}
          disabled={!nmlCategory}
          onSearchChange={s => setSubState(prev => ({ ...prev, search: s }))}
          onOpen={() => { setSubState(s => ({ ...s, open: true })); setCatState(s => ({ ...s, open: false })); }}
          onClose={() => setSubState(s => ({ ...s, open: false }))}
          onSelect={selectSubcategory}
          onClear={() => selectSubcategory("")}
        />
      </div>

      {/* Active selection chips */}
      {(nmlCategory || nmlSubcategory) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {nmlCategory && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px 3px 12px", borderRadius: 99,
              background: "rgba(220,38,38,.1)", color: "#b91c1c",
              fontSize: 12, fontWeight: 500, direction: "rtl",
            }}>
              {nmlCategory}
              <button
                onClick={() => selectCategory("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1, padding: 0, display: "flex" }}
              >
                ×
              </button>
            </span>
          )}
          {nmlSubcategory && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px 3px 12px", borderRadius: 99,
              background: "rgba(0,0,0,.06)", color: "var(--ink-2)",
              fontSize: 12, fontWeight: 500, direction: "rtl",
            }}>
              {nmlSubcategory}
              <button
                onClick={() => selectSubcategory("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1, padding: 0, display: "flex" }}
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
