export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── Enums ──────────────────────────────────────────────────────────────────
export type UserRole = "admin" | "acq_manager" | "acq_specialist" | "account_manager" | "catalog_ops" | "viewer";
export type TeamType = "acquisition" | "account_management" | "catalog";
export type MerchantStage = "new" | "assigned" | "contacted" | "interested" | "form_sent" | "cta_completed" | "onboarding" | "active" | "on_hold" | "lost" | "not_interested";
export type MerchantPriority = "high" | "medium" | "low";
export type LeadSource = "salla_export" | "product_search" | "manual" | "referral" | "inbound";
export type ActivityType = "call" | "whatsapp" | "email" | "meeting" | "visit" | "note" | "system";
export type ActivityOutcome = "answered" | "no_answer" | "busy" | "wrong_number" | "interested" | "not_interested" | "callback" | "deal_agreed";
export type ProductStatus = "discovered" | "ready_for_shelf" | "in_review" | "shelved" | "rejected" | "archived";
export type TaskStatus = "open" | "done" | "cancelled";
export type StepStatus = "pending" | "in_progress" | "done" | "skipped" | "blocked";
export type FormLinkStatus = "sent" | "opened" | "submitted" | "expired" | "revoked";
export type AssignmentRole = "acquisition" | "account_manager";

// ── Tables ─────────────────────────────────────────────────────────────────
export interface Team {
  id: string;
  name: string;
  type: TeamType;
  manager_id: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  role: UserRole;
  team_id: string | null;
  is_active: boolean;
  max_open_merchants: number;
  avatar_url: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadBatch {
  id: string;
  name: string;
  source: LeadSource;
  file_path: string | null;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  column_map: Json | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Merchant {
  id: string;
  merchant_code: string;
  store_name: string;
  store_name_ar: string | null;
  store_url: string | null;
  store_url_key: string | null;
  salla_store_id: string | null;
  owner_name: string | null;
  phone: string | null;
  phone_key: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  pickup_address: string | null;
  category: string | null;
  sub_category: string | null;
  products_count: number | null;
  rating: string | null;
  followers: number | null;
  monthly_orders_est: number | null;
  cr_number: string | null;
  vat_number: string | null;
  iban: string | null;
  default_margin_pct: string | null;
  pricing_agreed_at: string | null;
  pricing_notes: string | null;
  stage: MerchantStage;
  previous_stage: MerchantStage | null;
  priority: MerchantPriority;
  score: number | null;
  lost_reason: string | null;
  hold_reason: string | null;
  tags: string[];
  notes: string | null;
  acquisition_owner_id: string | null;
  account_manager_id: string | null;
  source: LeadSource;
  batch_id: string | null;
  raw: Json | null;
  assigned_at: string | null;
  first_contact_at: string | null;
  interested_at: string | null;
  form_sent_at: string | null;
  cta_completed_at: string | null;
  onboarding_started_at: string | null;
  activated_at: string | null;
  lost_at: string | null;
  next_action_at: string | null;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerchantAssignment {
  id: string;
  merchant_id: string;
  role_type: AssignmentRole;
  from_user_id: string | null;
  to_user_id: string | null;
  assigned_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  merchant_id: string;
  user_id: string | null;
  type: ActivityType;
  direction: "inbound" | "outbound" | null;
  outcome: ActivityOutcome | null;
  body: string | null;
  duration_sec: number | null;
  meta: Json | null;
  created_at: string;
}

export interface Task {
  id: string;
  merchant_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_at: string | null;
  status: TaskStatus;
  priority: MerchantPriority;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: Json;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormLink {
  id: string;
  merchant_id: string;
  template_id: string;
  token: string;
  status: FormLinkStatus;
  channel: string | null;
  sent_by: string | null;
  sent_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  expires_at: string;
  renew_requested_at: string | null;
  created_at: string;
}

export interface FormSubmission {
  id: string;
  form_link_id: string;
  merchant_id: string;
  template_id: string;
  data: Json;
  files: Json;
  submitted_ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  merchant_id: string;
  external_id: string | null;
  name: string;
  name_ar: string | null;
  sku: string | null;
  url: string | null;
  image_url: string | null;
  images: string[];
  price: string | null;
  sale_price: string | null;
  nml_cost: string | null;
  currency: string;
  stock: number | null;
  category: string | null;
  brand: string | null;
  weight_g: number | null;
  description: string | null;
  status: ProductStatus;
  source: string;
  review_notes: string | null;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  ready_at: string | null;
  shelved_at: string | null;
  raw: Json | null;
  created_at: string;
  updated_at: string;
}

export interface SearchList {
  id: string;
  name: string;
  query: string | null;
  filters: Json | null;
  created_by: string | null;
  created_at: string;
}

export interface SearchResult {
  id: string;
  list_id: string;
  product_name: string | null;
  product_url: string | null;
  image_url: string | null;
  price: string | null;
  store_name: string | null;
  store_url: string | null;
  store_url_key: string | null;
  salla_store_id: string | null;
  matched_merchant: string | null;
  converted: boolean;
  raw: Json | null;
  created_at: string;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface OnboardingTemplateStep {
  id: string;
  template_id: string;
  order_index: number;
  title: string;
  description: string | null;
  owner_role: UserRole;
  sla_days: number;
  is_required: boolean;
}

export interface MerchantOnboarding {
  id: string;
  merchant_id: string;
  template_id: string | null;
  progress: number;
  started_at: string;
  completed_at: string | null;
}

export interface MerchantOnboardingStep {
  id: string;
  onboarding_id: string;
  merchant_id: string;
  order_index: number;
  title: string;
  description: string | null;
  is_required: boolean;
  status: StepStatus;
  blocked_reason: string | null;
  owner_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string;
  merchant_id: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  before: Json | null;
  after: Json | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Lookup {
  id: string;
  kind: string;
  value: string;
  value_ar: string | null;
  sort_order: number;
  is_active: boolean;
}

// ── View types ─────────────────────────────────────────────────────────────
export interface VMerchantList extends Merchant {
  acquisition_owner_name: string | null;
  account_manager_name: string | null;
  batch_name: string | null;
  product_total: number;
  product_ready: number;
  onboarding_progress: number | null;
}

export interface VProductMargin extends Product {
  store_name: string;
  merchant_code: string;
  default_margin_pct: string | null;
  effective_cost: string | null;
  margin_amount: string | null;
  margin_pct: string | null;
  cost_is_override: boolean;
}

export interface VSpecialistPerformance {
  user_id: string;
  full_name: string | null;
  max_open_merchants: number;
  open_now: number;
  assigned: number;
  contacted: number;
  forms_sent: number;
  cta_done: number;
  lost: number;
  conversion_pct: string | null;
  avg_days_to_cta: string | null;
  avg_days_to_contact: string | null;
}

// Helper — makes all columns optional for Insert/Update while keeping Row exact.
// Intersection with Record<string,unknown> gives each Row/Insert/Update an index
// signature so the type satisfies Supabase's GenericTable constraint.
type TableDef<R> = {
  Row:           R & Record<string, unknown>;
  Insert:        { [K in keyof R]?: R[K] } & Record<string, unknown>;
  Update:        { [K in keyof R]?: R[K] } & Record<string, unknown>;
  Relationships: never[];
};

// ── Database shape (for createClient generic) ──────────────────────────────
export type Database = {
  public: {
    Tables: {
      teams:                      TableDef<Team>;
      profiles:                   TableDef<Profile>;
      lead_batches:               TableDef<LeadBatch>;
      merchants:                  TableDef<Merchant>;
      merchant_assignments:       TableDef<MerchantAssignment>;
      activities:                 TableDef<Activity>;
      tasks:                      TableDef<Task>;
      form_templates:             TableDef<FormTemplate>;
      form_links:                 TableDef<FormLink>;
      form_submissions:           TableDef<FormSubmission>;
      products:                   TableDef<Product>;
      search_lists:               TableDef<SearchList>;
      search_results:             TableDef<SearchResult>;
      onboarding_templates:       TableDef<OnboardingTemplate>;
      onboarding_template_steps:  TableDef<OnboardingTemplateStep>;
      merchant_onboarding:        TableDef<MerchantOnboarding>;
      merchant_onboarding_steps:  TableDef<MerchantOnboardingStep>;
      attachments:                TableDef<Attachment>;
      audit_log:                  TableDef<AuditLog>;
      notifications:              TableDef<Notification>;
      lookups:                    TableDef<Lookup>;
    };
    Views: {
      v_merchants_list:         { Row: VMerchantList         & Record<string, unknown>; Relationships: never[] };
      v_product_margin:         { Row: VProductMargin        & Record<string, unknown>; Relationships: never[] };
      v_specialist_performance: { Row: VSpecialistPerformance & Record<string, unknown>; Relationships: never[] };
    };
    Functions: {
      my_role:          { Args: Record<string, never>; Returns: UserRole };
      is_admin:         { Args: Record<string, never>; Returns: boolean };
      is_manager:       { Args: Record<string, never>; Returns: boolean };
      can_see_merchant: { Args: { p_merchant: string }; Returns: boolean };
      can_edit_merchant:{ Args: { p_merchant: string }; Returns: boolean };
    };
    Enums: {
      user_role:        UserRole;
      merchant_stage:   MerchantStage;
      merchant_priority:MerchantPriority;
      lead_source:      LeadSource;
      activity_type:    ActivityType;
      activity_outcome: ActivityOutcome;
      product_status:   ProductStatus;
      task_status:      TaskStatus;
      step_status:      StepStatus;
      form_link_status: FormLinkStatus;
    };
  };
};
