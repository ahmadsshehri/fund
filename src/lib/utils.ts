import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'SAR') {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number, decimals = 2) {
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatPercent(num: number, decimals = 2) {
  return `${num.toFixed(decimals)}%`;
}

export function formatDate(date: Date | string | undefined, fmt = 'dd/MM/yyyy') {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return format(d, fmt, { locale: ar });
}

export function formatDateTime(date: Date | undefined) {
  if (!date) return '—';
  return format(date, 'dd/MM/yyyy HH:mm', { locale: ar });
}

export function timeAgo(date: Date | undefined) {
  if (!date) return '—';
  return formatDistanceToNow(date, { addSuffix: true, locale: ar });
}

export function calcDurationDays(from: Date, to: Date = new Date()) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function calcAnnualReturn(profit: number, invested: number, durationDays: number) {
  if (!invested || !durationDays) return 0;
  return (profit / invested / (durationDays / 365)) * 100;
}

export function generateId(prefix: string, num: number) {
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

export const INVESTMENT_TYPES: Record<string, string> = {
  closed_return: 'مغلق بعائد نهائي',
  periodic_dividend: 'يوزع أرباحًا دورية',
  accumulative: 'تراكمي',
  distressed: 'متعثر',
  frozen: 'مجمد',
};

export const INVESTMENT_STATUSES: Record<string, string> = {
  active: 'قائم',
  closed: 'مغلق',
  distressed: 'متعثر',
  frozen: 'مجمد',
};

export const EXPENSE_TYPES: Record<string, string> = {
  zakat: 'زكاة',
  bank_fees: 'رسوم بنكية',
  admin: 'إدارية',
  legal: 'قانونية',
  other: 'أخرى',
};

export const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقداً',
  check: 'شيك',
  other: 'أخرى',
};

export const DISTRIBUTION_TYPES: Record<string, string> = {
  profit_distribution: 'توزيع أرباح',
  reinvestment: 'إعادة استثمار',
  new_investor: 'دخول مستثمر جديد',
  capital_increase: 'زيادة رأس المال',
  capital_decrease: 'تخفيض رأس المال',
  investor_exit: 'خروج مستثمر',
  increase_contribution: 'زيادة مساهمة',
  decrease_contribution: 'تخفيض مساهمة',
  restructure: 'إعادة هيكلة',
  share_price_adjustment: 'تعديل سعر الحصة',
};

export const USER_ROLES: Record<string, string> = {
  manager: 'مدير',
  admin: 'مستخدم إداري',
  investor: 'مستثمر',
};

export const DISTRESS_STATUSES: Record<string, string> = {
  under_follow_up: 'تحت المتابعة',
  legal_case: 'قضية قانونية',
  settlement: 'تسوية',
  written_off: 'شطب',
};
