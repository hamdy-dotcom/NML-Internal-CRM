/**
 * Seed script — generates 200 merchants across every stage with realistic data.
 * Run: npm run seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const [key, ...vals] = line.split("=");
  if (key?.trim()) env[key.trim()] = vals.join("=").trim();
}

const supabase = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"]!,
  env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false } },
);

// ── Data pools ─────────────────────────────────────────────────────────────
const STORE_NAMES = [
  "متجر نوران", "Layali Perfumes", "بيت التمر", "Nabt Store", "Zahra Kids",
  "Oud Al Sharq", "Rukn Al Hadaya", "Al Noor Fashion", "Green Valley Store",
  "متجر السمر", "Haya Collection", "Al Baraka Sweets", "متجر الربيع",
  "Luma Beauty", "Saad Electronics", "Al Reef Organics", "متجر الفجر",
  "Nada Home", "Blue Sea Clothing", "Al Madinah Dates", "Raha Store",
  "متجر الضياء", "Qamar Fashion", "Al Wafa Cosmetics", "Salam Store",
  "بيت الأزياء", "Fresh Harvest", "Rayyan Perfumes", "Al Nakheel Dates",
  "Layla Kids", "متجر الربوة", "Creative Home", "Al Jabal Store",
  "Nour Fashion", "Sweet Moments", "Al Reef Honey", "متجر المدينة",
  "Bayt Al Ward", "Shifa Herbs", "Al Barr Trading",
];

const CITIES = ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah", "Khobar", "Taif", "Buraidah"];
const CATEGORIES = ["Perfumes", "Fashion", "Food & Dates", "Kids", "Home & Living", "Beauty", "Electronics", "Organic"];
const STAGES = ["new", "assigned", "contacted", "interested", "form_sent", "cta_completed", "onboarding", "active", "on_hold", "lost"] as const;
const STAGE_WEIGHTS = [15, 20, 20, 15, 10, 5, 5, 5, 3, 2]; // distribution

function weighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

function daysAgo(d: number): string {
  const dt = new Date(Date.now() - d * 86400000);
  return dt.toISOString();
}

function saudiPhone(): string {
  const prefixes = ["05", "055", "054", "053", "056", "059"];
  const prefix = rand(prefixes)!;
  const rest = String(Math.floor(Math.random() * 10000000)).padStart(7, "0");
  return `966${prefix.slice(1)}${rest}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting seed...");

  // Get user IDs for assignment
  const { data: profiles } = await supabase.from("profiles").select("id, role");
  const specialists = profiles?.filter(p => ["acq_specialist", "acq_manager"].includes(p.role)) ?? [];
  const ams = profiles?.filter(p => p.role === "account_manager") ?? [];

  if (specialists.length === 0) {
    console.log("⚠️  No acquisition specialists found. Run `update profiles set role = ... where email = ...' first.");
    console.log("   Seeding merchants without assignments.");
  }

  // Get default onboarding template
  const { data: templates } = await supabase.from("onboarding_templates").select("id").eq("is_default", true).limit(1);
  const templateId = templates?.[0]?.id ?? null;

  // Create a seed batch
  const { data: batch } = await supabase.from("lead_batches").insert({
    name: "Seed batch — 200 merchants",
    source: "salla_export",
    total_rows: 200,
    imported_rows: 200,
  }).select("id").single();

  const batchId = batch?.id;

  const merchants: Record<string, unknown>[] = [];

  for (let i = 0; i < 200; i++) {
    const stage = weighted(STAGES as unknown as string[], STAGE_WEIGHTS);
    const createdDaysAgo = randInt(30, 180);
    const city = rand(CITIES);
    const category = rand(CATEGORIES);
    const specialistId = specialists.length > 0 ? rand(specialists)!.id : null;
    const amId = ams.length > 0 ? rand(ams)!.id : null;

    const merchant: Record<string, unknown> = {
      store_name: STORE_NAMES[i % STORE_NAMES.length]! + (i >= STORE_NAMES.length ? ` ${Math.floor(i / STORE_NAMES.length) + 1}` : ""),
      store_url: `https://store.salla.sa/store-${1000 + i}`,
      salla_store_id: String(1000000 + i),
      owner_name: ["Ahmed Al Rashid", "Sara Al Mutairi", "Khaled Bin Nasser", "Noura Al Qahtani", "Faisal Al Dosari"][i % 5],
      phone: saudiPhone(),
      city,
      category,
      products_count: randInt(10, 500),
      rating: (3 + Math.random() * 2).toFixed(1),
      followers: randInt(100, 50000),
      stage,
      priority: rand(["high", "medium", "low"] as const),
      source: "salla_export",
      batch_id: batchId,
      created_at: daysAgo(createdDaysAgo),
    };

    // Stage-appropriate timestamps and assignments
    if (stage !== "new") {
      merchant.acquisition_owner_id = specialistId;
      merchant.assigned_at = daysAgo(createdDaysAgo - randInt(0, 2));
    }
    if (["contacted", "interested", "form_sent", "cta_completed", "onboarding", "active"].includes(stage)) {
      merchant.first_contact_at = daysAgo(createdDaysAgo - randInt(3, 10));
    }
    if (["interested", "form_sent", "cta_completed", "onboarding", "active"].includes(stage)) {
      merchant.interested_at = daysAgo(createdDaysAgo - randInt(10, 20));
    }
    if (["form_sent", "cta_completed", "onboarding", "active"].includes(stage)) {
      merchant.form_sent_at = daysAgo(createdDaysAgo - randInt(20, 30));
    }
    if (["cta_completed", "onboarding", "active"].includes(stage)) {
      merchant.cta_completed_at = daysAgo(createdDaysAgo - randInt(25, 40));
      merchant.account_manager_id = amId;
      merchant.cr_number = `1010${String(randInt(100000, 999999))}`;
      merchant.vat_number = `3100${String(randInt(10000000, 99999999))}10003`;
      merchant.iban = `SA${String(randInt(10, 99))}${String(randInt(1000000000000000, 9999999999999999))}`;
      merchant.default_margin_pct = String(randInt(15, 35));
    }
    if (["onboarding", "active"].includes(stage)) {
      merchant.onboarding_started_at = daysAgo(createdDaysAgo - randInt(35, 45));
    }
    if (stage === "active") {
      merchant.activated_at = daysAgo(randInt(1, 20));
    }
    if (stage === "on_hold") {
      merchant.hold_reason = rand(["Merchant requested delay", "Pending document review", "Price negotiation in progress"]);
      merchant.previous_stage = "interested";
    }
    if (stage === "lost") {
      merchant.lost_reason = rand(["Not interested", "Already with a competitor", "Margin not accepted", "No response after 5 attempts"]);
      merchant.lost_at = daysAgo(randInt(1, 30));
    }

    // Some have next_action_at in the past (overdue)
    if (!["active", "lost", "on_hold"].includes(stage)) {
      const overdueChance = Math.random();
      if (overdueChance < 0.3) {
        merchant.next_action_at = daysAgo(randInt(1, 5)); // overdue
      } else if (overdueChance < 0.7) {
        const future = new Date(Date.now() + randInt(1, 7) * 86400000);
        merchant.next_action_at = future.toISOString();
      }
    }

    merchants.push(merchant);
  }

  // Insert in batches of 50
  console.log("📦 Inserting merchants...");
  for (let i = 0; i < merchants.length; i += 50) {
    const batch = merchants.slice(i, i + 50);
    const { error } = await supabase.from("merchants").insert(batch);
    if (error) { console.error("Insert error:", error.message); }
    else { console.log(`  ✓ ${Math.min(i + 50, merchants.length)} / 200`); }
  }

  // Seed activities for some merchants
  console.log("💬 Seeding activities...");
  const { data: seededMerchants } = await supabase.from("merchants").select("id, stage").limit(200);
  const activityTypes = ["call", "whatsapp", "email", "note"] as const;
  const outcomes = ["answered", "no_answer", "interested", "callback"] as const;

  const activities: Record<string, unknown>[] = [];
  for (const m of seededMerchants ?? []) {
    const count = randInt(1, 5);
    for (let a = 0; a < count; a++) {
      const type = rand(activityTypes);
      activities.push({
        merchant_id: m.id,
        type,
        outcome: type === "call" ? rand(outcomes) : null,
        body: type === "note" ? "Called, discussed partnership terms" : null,
        created_at: daysAgo(randInt(0, 30)),
      });
    }
  }
  for (let i = 0; i < activities.length; i += 100) {
    await supabase.from("activities").insert(activities.slice(i, i + 100));
  }

  // Seed products for cta_completed+ merchants
  console.log("📦 Seeding products...");
  const ctaMerchants = seededMerchants?.filter(m => ["cta_completed", "onboarding", "active"].includes(m.stage)) ?? [];
  const productStatuses = ["ready_for_shelf", "in_review", "shelved", "rejected"] as const;
  const products: Record<string, unknown>[] = [];
  for (const m of ctaMerchants) {
    const count = randInt(3, 15);
    for (let p = 0; p < count; p++) {
      products.push({
        merchant_id: m.id,
        name: `Product ${p + 1} — ${rand(CATEGORIES)}`,
        price: (randInt(20, 500)).toFixed(2),
        stock: randInt(0, 200),
        category: rand(CATEGORIES),
        status: rand(productStatuses),
        source: "salla_scrape",
      });
    }
  }
  for (let i = 0; i < products.length; i += 100) {
    await supabase.from("products").insert(products.slice(i, i + 100));
  }

  console.log("\n✅ Seed complete!");
  console.log(`   200 merchants · ${activities.length} activities · ${products.length} products`);
  console.log("   Remember to make yourself admin: UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';");
}

main().catch(e => { console.error(e); process.exit(1); });
