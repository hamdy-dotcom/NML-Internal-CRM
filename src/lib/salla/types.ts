// Shared types for the Salla storefront extraction pipeline.
// Used by lib/salla/* AND scripts/salla-worker.ts — no Next.js imports here.

export interface NormalizedProduct {
  salla_id:        number;
  name:            string;
  sku:             string | null;
  mpn:             string | null;
  gtin:            string | null;
  price:           number | null;
  compare_at:      number | null;  // regular_price when is_on_sale
  currency:        string;
  image:           string | null;  // primary image → products.image_url
  images:          string[];       // full gallery → products.images jsonb
  brand:           string | null;
  brand_id:        number | null;  // internal; used for brand-axis walking
  category:        string | null;
  category_url:    string | null;  // internal; mined for sub-category walking
  weight:          number | null;
  in_stock:        boolean;
  has_options:     boolean;
  external_url:    string;
  description_html: string | null;
  description:     string | null;  // prose before "=====" separator
  specs:           { label: string; value: string }[];
  found_via:       string;         // "latest" | "category:id" | "brand:id"
}

export interface RecentProduct {
  salla_id: number;
  name:     string;
  sku:      string | null;
  price:    number | null;
  currency: string;
  image:    string | null;
}

export interface WalkProgress {
  phase:               string;
  products_found:      number;
  images_found:        number;
  request_count:       number;
  categories_crawled:  string[];
  brands_crawled:      string[];
  recent_products?:    RecentProduct[];  // rolling 50-item buffer for live popup feed
}
