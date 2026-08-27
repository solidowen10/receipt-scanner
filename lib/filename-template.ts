import { CATEGORY_OPTIONS } from "@/lib/constants";

export type FilenameToken =
  | "date"
  | "month"
  | "invoiceNumber"
  | "payerShortName"
  | "total"
  | "merchant"
  | "category"
  | "paymentMethod"
  | "timestamp";

export type FilenameSegment =
  | { id: string; type: "token"; token: FilenameToken }
  | { id: string; type: "text"; value: string };

export type FilenameValues = {
  date?: string | null;
  invoiceNumber?: string | null;
  payerShortName?: string | null;
  total?: number | string | null;
  merchant?: string | null;
  category?: string | null;
  paymentMethod?: string | null;
  timestamp?: string | null;
};

export const TOKEN_LABELS: Record<FilenameToken, string> = {
  date: "日期",
  month: "月份",
  invoiceNumber: "發票號碼",
  payerShortName: "支付方簡稱",
  total: "支付總計額",
  merchant: "店家",
  category: "類別",
  paymentMethod: "支付方式",
  timestamp: "上傳時間",
};

export const TOKEN_EXAMPLES: Record<FilenameToken, string> = {
  date: "2026-08-27",
  month: "2026-08",
  invoiceNumber: "AB12345678",
  payerShortName: "OL",
  total: "1280",
  merchant: "全聯福利中心",
  category: CATEGORY_OPTIONS[1],
  paymentMethod: "信用卡",
  timestamp: "20260827-1430",
};

export const DEFAULT_TEMPLATE: FilenameSegment[] = [
  { id: "date", type: "token", token: "date" },
  { id: "sep-1", type: "text", value: "_" },
  { id: "invoice", type: "token", token: "invoiceNumber" },
  { id: "sep-2", type: "text", value: "_" },
  { id: "payer", type: "token", token: "payerShortName" },
  { id: "sep-3", type: "text", value: "_" },
  { id: "total", type: "token", token: "total" },
];

export function parseTemplate(raw?: string | null): FilenameSegment[] {
  if (!raw) return [...DEFAULT_TEMPLATE];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_TEMPLATE];
    const segments = parsed
      .map((segment): FilenameSegment | null => {
        if (!segment || typeof segment !== "object") return null;
        if (segment.type === "text") {
          return {
            id: String(segment.id || cryptoId()),
            type: "text",
            value: String(segment.value ?? ""),
          };
        }
        if (segment.type === "token" && segment.token in TOKEN_LABELS) {
          return {
            id: String(segment.id || cryptoId()),
            type: "token",
            token: segment.token as FilenameToken,
          };
        }
        return null;
      })
      .filter((segment): segment is FilenameSegment => Boolean(segment));

    return segments.length > 0 ? segments : [...DEFAULT_TEMPLATE];
  } catch {
    return [...DEFAULT_TEMPLATE];
  }
}

export function serializeTemplate(template: FilenameSegment[]) {
  return JSON.stringify(template);
}

export function renderFilenameBase(template: FilenameSegment[], values: FilenameValues) {
  const rendered = template
    .map((segment) => {
      if (segment.type === "text") return segment.value;
      return valueForToken(segment.token, values);
    })
    .join("");

  const sanitized = sanitizeFilename(rendered);
  return sanitized || fallbackFilename(values);
}

export function renderFilenamePreview(template: FilenameSegment[], values?: Partial<FilenameValues>) {
  return renderFilenameBase(template, {
    date: values?.date ?? TOKEN_EXAMPLES.date,
    invoiceNumber: values?.invoiceNumber ?? TOKEN_EXAMPLES.invoiceNumber,
    payerShortName: values?.payerShortName ?? TOKEN_EXAMPLES.payerShortName,
    total: values?.total ?? TOKEN_EXAMPLES.total,
    merchant: values?.merchant ?? TOKEN_EXAMPLES.merchant,
    category: values?.category ?? TOKEN_EXAMPLES.category,
    paymentMethod: values?.paymentMethod ?? TOKEN_EXAMPLES.paymentMethod,
    timestamp: values?.timestamp ?? TOKEN_EXAMPLES.timestamp,
  });
}

export function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[-_ ]{3,}/g, "__")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 140);
}

export function extensionForFile(filename?: string | null, mimeType?: string | null) {
  const ext = filename?.match(/\.([A-Za-z0-9]{2,5})$/)?.[1]?.toLowerCase();
  if (ext) return `.${ext === "jpeg" ? "jpg" : ext}`;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/heic") return ".heic";
  if (mimeType === "application/pdf") return ".pdf";
  return ".jpg";
}

function valueForToken(token: FilenameToken, values: FilenameValues) {
  if (token === "month") return (values.date || "").slice(0, 7) || formatMonth(new Date());
  if (token === "timestamp") return values.timestamp || formatTimestamp(new Date());
  if (token === "total") return formatAmount(values.total);
  const raw = values[token];
  return raw == null || raw === "" ? TOKEN_LABELS[token] : String(raw);
}

function fallbackFilename(values: FilenameValues) {
  const date = values.date || formatDate(new Date());
  const invoice = values.invoiceNumber || "receipt";
  return sanitizeFilename(`${date}_${invoice}`);
}

function formatAmount(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  if (typeof value === "string" && value.trim()) return value.replace(/[^\d.-]/g, "");
  return TOKEN_LABELS.total;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatMonth(date: Date) {
  return formatDate(date).slice(0, 7);
}

export function formatTimestamp(date: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}`;
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
