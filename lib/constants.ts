export const APP_BASE_PATH = "/receipt-scanner";

export const APP_NAME = "Receipt Scanner";

export const DEFAULT_TOOLS_ORIGIN = "https://luruee.com";

export const LURU_TOOLS_ORIGIN =
  (process.env.NEXT_PUBLIC_LURU_TOOLS_ORIGIN || process.env.LURU_TOOLS_ORIGIN || DEFAULT_TOOLS_ORIGIN).replace(/\/+$/, "");

export const LOGO_SRC = `${APP_BASE_PATH}/luruee-logo.png`;

export const CATEGORY_OPTIONS = ["餐飲", "超市", "交通", "娛樂", "醫療", "購物", "住宿", "辦公", "其他"] as const;

export type ReceiptCategory = (typeof CATEGORY_OPTIONS)[number];

export const PAYMENT_METHODS = ["現金", "信用卡", "LINE Pay", "Apple Pay", "轉帳", "公司卡", "其他"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
