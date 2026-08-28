import { CATEGORY_OPTIONS, type ReceiptCategory } from "@/lib/constants";

export type ReceiptItem = {
  name: string;
  qty?: number | null;
  price?: number | null;
  subtotal?: number | null;
};

export type ReceiptDraft = {
  date: string | null;
  merchant: string | null;
  invoiceNumber: string | null;
  total: number | null;
  category: ReceiptCategory | null;
  items: ReceiptItem[];
  notes: string | null;
  ocrText: string;
};

const TOTAL_WORDS = /總\s*計|合\s*計|應\s*付|應\s*收|實\s*收|總金額|金額總計|小\s*計/i;
const NOISE_WORDS =
  /^(?:統一編號|發票|電子發票|電話|地址|日期|時間|交易|明細|品名|數量|單價|金額|隨機碼|買受人|賣方|買方|賣方統編|QRCode|QR Code|載具|退貨|折讓)/i;

export function parseReceiptText(text: string): ReceiptDraft {
  const normalized = normalizeOcrText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const merchant = extractMerchant(lines);
  const category = categorizeReceipt(`${merchant || ""}\n${normalized}`);

  return {
    date: extractDate(normalized),
    merchant,
    invoiceNumber: extractInvoiceNumber(normalized),
    total: extractTotal(lines, normalized),
    category,
    items: extractItems(lines),
    notes: null,
    ocrText: normalized,
  };
}

export function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractInvoiceNumber(text: string) {
  const match = text.toUpperCase().match(/\b[A-Z]{2}[-\s]?\d{8}\b/);
  return match ? match[0].replace(/[-\s]/g, "") : null;
}

function extractDate(text: string) {
  const gregorian = text.match(/\b(20\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
  if (gregorian) return makeDate(gregorian[1], gregorian[2], gregorian[3]);

  const roc = text.match(/(?:民國\s*)?(1\d{2}|\d{2,3})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})?/);
  if (roc) {
    const year = Number(roc[1]);
    if (year > 0 && year < 200) return makeDate(String(year + 1911), roc[2], roc[3] || "1");
  }

  const compact = text.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compact) return makeDate(compact[1], compact[2], compact[3]);

  return null;
}

function makeDate(year: string, month: string, day: string) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractTotal(lines: string[], text: string) {
  const totalLines = lines.filter((line) => TOTAL_WORDS.test(line));
  for (const line of totalLines.reverse()) {
    const amount = lastAmountOnLine(line);
    if (amount != null) return amount;
  }

  const labelled = text.match(/(?:總\s*計|合\s*計|應\s*付|實\s*收)[^\d]{0,14}(\d[\d,]*)/i);
  if (labelled) return toAmount(labelled[1]);

  return null;
}

function lastAmountOnLine(line: string) {
  const matches = [...line.matchAll(/(?:NT\$|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{2,7})(?:\.00)?/g)]
    .map((match) => toAmount(match[1]))
    .filter((amount): amount is number => amount != null && amount > 0);
  return matches.length ? matches[matches.length - 1] : null;
}

function toAmount(value: string) {
  const amount = Number(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount);
}

function extractMerchant(lines: string[]) {
  const seller = lines
    .map((line) => line.match(/(?:營業人|店名|商店)[:：\s]+(.{2,40})/)?.[1]?.trim())
    .find((value) => value && !/^\d{8}$/.test(value));
  if (seller) return cleanupMerchant(seller);

  const brandLine = lines.find((line) => {
    if (NOISE_WORDS.test(line)) return false;
    if (extractInvoiceNumber(line)) return false;
    if (/^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(line)) return false;
    if (/^(?:dodohome\s*)?嘟嘟房$/i.test(line)) return true;
    return false;
  });
  if (brandLine) return cleanupMerchant(brandLine.replace(/^dodohome\s*/i, ""));

  const companyPattern = /[\p{Script=Han}A-Za-z0-9（）()\-&\s]{2,}(?:股份有限公司|有限公司|公司|企業社|商行|銀行|藥局|診所|醫院|門市|超商|超市|餐廳|咖啡|旅店|飯店|福利中心)/u;
  const preferred = lines.find((line) => !NOISE_WORDS.test(line) && companyPattern.test(line));
  const match = preferred?.match(companyPattern)?.[0];
  if (match) return cleanupMerchant(match);

  const firstUseful = lines.find((line) => {
    if (NOISE_WORDS.test(line)) return false;
    if (extractInvoiceNumber(line)) return false;
    if (lastAmountOnLine(line) != null) return false;
    return /[\p{Script=Han}A-Za-z]{2,}/u.test(line);
  });
  return firstUseful ? cleanupMerchant(firstUseful) : null;
}

function cleanupMerchant(value: string) {
  return value
    .replace(/統一編號.*$/g, "")
    .replace(/電話.*$/g, "")
    .replace(/地址.*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 40);
}

function extractItems(lines: string[]) {
  const items: ReceiptItem[] = [];
  for (const line of lines) {
    if (items.length >= 12) break;
    if (NOISE_WORDS.test(line) || TOTAL_WORDS.test(line) || extractInvoiceNumber(line)) continue;
    const subtotal = lastAmountOnLine(line);
    if (subtotal == null) continue;
    const name = line
      .replace(/(?:NT\$|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{2,7})(?:\.00)?\s*$/g, "")
      .replace(/^\d+\s*[xX＊*]\s*/g, "")
      .trim();
    if (name.length < 2 || !/[\p{Script=Han}A-Za-z]/u.test(name)) continue;
    items.push({ name: name.slice(0, 36), qty: null, price: null, subtotal });
  }
  return items;
}

function categorizeReceipt(text: string): ReceiptCategory | null {
  const normalized = text.toLowerCase();
  const checks: Array<[ReceiptCategory, RegExp]> = [
    ["餐飲", /餐廳|咖啡|小吃|火鍋|拉麵|麵|飲料|茶|便當|早餐|food|cafe|coffee|restaurant/],
    ["超市", /全聯|家樂福|costco|超市|超商|7-?11|familymart|全家|便利商店|market/],
    ["交通", /加油|停車|嘟嘟房|dodohome|捷運|台鐵|高鐵|計程車|uber|taxi|交通/],
    ["娛樂", /電影|影城|遊戲|ktv|展覽|娛樂/],
    ["醫療", /藥局|診所|醫院|牙醫|醫療|pharmacy|clinic/],
    ["購物", /百貨|購物|商場|服飾|鞋|電器|shop|store/],
    ["住宿", /旅店|飯店|酒店|hotel|inn|住宿/],
    ["辦公", /文具|印刷|影印|辦公|stationery|office/],
  ];

  return checks.find(([, pattern]) => pattern.test(normalized))?.[0] || (CATEGORY_OPTIONS.includes("其他") ? "其他" : null);
}
