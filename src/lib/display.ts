import type { LocalizedName } from "../types";

export function primaryName(name: LocalizedName) {
  return name.zh || name.en;
}

export function secondaryName(name: LocalizedName) {
  return name.zh && name.zh.trim().toLowerCase() !== name.en.trim().toLowerCase() ? name.en : null;
}

export function formatAmount(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}

export function formatVersion(version: string) {
  return version.replace(/[-\s]*(LIVE|PTU|EPTU)\.(\d+)$/i, " $1").replace(/\s+/g, " ").trim();
}

export function formatDate(value: string | null) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export const reputationLabels: Record<string, string> = {
  "New Customer": "新顾客",
  "Very Good Customer": "非常好的顾客",
  "Very Best Customer": "最好的顾客",
};

export function reputationLabel(value: string | null) {
  if (value === null) return "无";
  return reputationLabels[value] ?? value;
}
