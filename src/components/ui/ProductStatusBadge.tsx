import { productStatusBadgeClass, PRODUCT_STATUS_LABELS } from "@/lib/utils";
import type { ProductStatus } from "@/lib/database.types";

export default function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <span className={productStatusBadgeClass(status)}>{PRODUCT_STATUS_LABELS[status]}</span>;
}
