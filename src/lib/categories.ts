export const NML_CATEGORIES = [
  { ar: "حبوب القهوة والمحاصيل",      en: "Specialty Coffee Beans" },
  { ar: "أدوات وماكينات القهوة",       en: "Coffee Equipment & Machines" },
  { ar: "شامبو وعناية بالشعر",          en: "Shampoo & Hair Care" },
  { ar: "أدوات تصفيف الشعر",           en: "Hair Styling Tools" },
  { ar: "إزالة الشعر",                  en: "Hair Removal" },
  { ar: "عناية بالبشرة والوجه",         en: "Skincare & Face Care" },
  { ar: "عناية بالجسم والاستحمام",      en: "Body & Bath Care" },
  { ar: "مزيلات العرق",                 en: "Deodorants & Antiperspirants" },
  { ar: "عناية بالفم والأسنان",         en: "Oral Care" },
  { ar: "مكياج وألوان",                 en: "Makeup & Color Cosmetics" },
  { ar: "عطور",                          en: "Perfumes & Fragrances" },
  { ar: "بخور وعود",                    en: "Incense & Oud" },
  { ar: "هواتف ذكية",                   en: "Smartphones" },
  { ar: "ملحقات الهواتف والأجهزة",      en: "Phone & Device Accessories" },
  { ar: "أجهزة لوحية وحواسيب",          en: "Tablets & Computers" },
  { ar: "سماعات وصوتيات",               en: "Audio & Headphones" },
  { ar: "ساعات ذكية",                   en: "Smartwatches" },
  { ar: "كاميرات ومراقبة",              en: "Cameras & Surveillance" },
  { ar: "أجهزة منزلية كبيرة",           en: "Major Home Appliances" },
  { ar: "أجهزة مطبخ كهربائية",          en: "Kitchen Appliances" },
  { ar: "مستلزمات مطبخ وأواني",         en: "Kitchenware & Cookware" },
  { ar: "منزل وأثاث وديكور",            en: "Home, Furniture & Decor" },
  { ar: "مفارش ومنسوجات منزلية",        en: "Bedding & Home Textiles" },
  { ar: "منتجات تنظيف ومنظفات",         en: "Cleaning Products & Detergents" },
  { ar: "منتجات الأطفال والرضع",         en: "Baby & Infant Products" },
  { ar: "ألعاب ومركبات للأطفال",         en: "Children's Toys & Vehicles" },
  { ar: "مكملات غذائية وصيدلية",        en: "Dietary Supplements & Health" },
  { ar: "تجهيزات صالونات",              en: "Salon & Beauty Equipment" },
  { ar: "قطع غيار",                     en: "Spare Parts & Components" },
  { ar: "نظارات وعدسات",                en: "Eyewear & Lenses" },
  { ar: "حقائب وسفر",                   en: "Bags & Travel" },
  { ar: "خيام ورحلات",                  en: "Camping & Outdoor" },
] as const;

export type NMLCategory = typeof NML_CATEGORIES[number]["ar"];

export const NML_CATEGORY_VALUES = NML_CATEGORIES.map(c => c.ar);

export const NML_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  NML_CATEGORIES.map(c => [c.ar, `${c.ar} — ${c.en}`])
);
