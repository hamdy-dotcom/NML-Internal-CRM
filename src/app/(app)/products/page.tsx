import { Suspense } from "react";
import ProductsTable from "./ProductsTable";

export default function ProductsPage() {
  return (
    <div style={{ paddingTop: 16 }}>
      <Suspense fallback={<div style={{ color: "var(--ink-3)" }}>Loading…</div>}>
        <ProductsTable />
      </Suspense>
    </div>
  );
}
