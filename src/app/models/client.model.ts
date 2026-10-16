import { UtilityTariffsSettings } from './utility.model';

export type ClientStatus = 'active' | 'expiring_soon' | 'expired' | 'paused';
export type SubscriptionPlanType = '1usd' | '2usd' | 'custom';

export type UserRole = 'admin' | 'user' | 'new';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole; // 'admin' (Всі права), 'user' (Тільки перегляд), 'new' (Зовсім без доступу)
  createdAt: string;
  lastLoginAt: string;
  sub?: string;
}

export interface SubscriptionPlanDef {
  id: SubscriptionPlanType;
  name: string;
  costUsd: number; // Cost deducted from admin provider balance in USD
  priceUah: number; // Price taken from client in UAH
  description: string;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanType, SubscriptionPlanDef> = {
  '1usd': {
    id: '1usd',
    name: 'Підписка $1 (100 грн/міс)',
    costUsd: 1,
    priceUah: 100,
    description: 'Списання $1 з акаунту, плата з клієнта 100 грн',
  },
  '2usd': {
    id: '2usd',
    name: 'Підписка $2 (150 грн/міс)',
    costUsd: 2,
    priceUah: 150,
    description: 'Списання $2 з акаунту, плата з клієнта 150 грн',
  },
  custom: {
    id: 'custom',
    name: 'Індивідуальний тариф',
    costUsd: 1,
    priceUah: 160,
    description: 'Налаштовується вручну',
  },
};

export interface ProviderAccountRenewal {
  id: string;
  date: string; // YYYY-MM-DD
  months: number; // e.g. 1, 3, 6, 12
  pricePerMonthUsd: number; // 1 or 2
  totalCostUsd: number; // months * pricePerMonthUsd
  previousValidUntil?: string;
  newValidUntil: string;
  note?: string;
}

export interface ProviderAccount {
  id: string;
  name: string; // e.g. "Акаунт IPTV #1"
  login: string; // Provider login / user
  password?: string;
  playlistUrl?: string; // M3U / Portal URL
  serverUrl?: string;
  maxSlots: number; // Always 2 as per requirement
  assignedClientIds: string[]; // IDs of clients assigned (max 2)
  pricePerMonthUsd: number; // 1 or 2 ($ per month at provider)
  startDate?: string; // Connection start date (YYYY-MM-DD)
  monthsCount: number; // Number of months connected / extended
  validUntil: string; // Date until which the line is paid at the provider
  totalDeductedUsd: number; // Total USD deducted from main balance for this account
  renewals?: ProviderAccountRenewal[];
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConnectedClientBrief {
  id: string;
  fullName: string;
  phone: string;
  iptvLogin: string;
  subscriptionPlan: SubscriptionPlanType;
  costUsd: number;
  monthlyPrice: number;
  activeUntil: string;
  status: ClientStatus;
}

export interface ProviderAccountDetailed extends ProviderAccount {
  clients?: ConnectedClientBrief[];
  occupiedSlots?: number;
  availableSlots?: number;
  isFull?: boolean;
  daysRemaining?: number;
  status?: 'active' | 'expiring_soon' | 'expired';
}

export interface ProviderDeposit {
  id: string;
  date: string; // YYYY-MM-DD
  amountUsd: number; // Amount added to provider account in USD ($)
  spentUah: number; // Actual amount spent in UAH including commission (MINUS in budget)
  exchangeRate?: number; // Calculated effective rate (spentUah / amountUsd)
  paymentMethod?: string; // e.g. "Монобанк", "Крипта", "USDT"
  note?: string; // Note or comment
  createdAt: string;
}

export interface BudgetLedgerItem {
  id: string;
  type: 'income' | 'expense';
  date: string;
  amountUah: number; // positive for income (+), negative for expense (-)
  amountUsd?: number;
  title: string;
  subtitle: string;
  note?: string;
  paymentMethod?: string;
  clientId?: string;
}

export interface BudgetApiResponse {
  summary: BudgetSummary & {
    runwayMonths?: number;
    activeClientsCount?: number;
  };
  deposits: ProviderDeposit[];
  ledger: BudgetLedgerItem[];
}

export interface Client {
  id: string;
  fullName: string;
  phone: string;
  iptvLogin: string;
  deviceInfo?: string;
  subscriptionPlan: SubscriptionPlanType; // '1usd' | '2usd' | 'custom'
  costUsd: number; // 1 or 2 (or custom)
  monthlyPrice: number; // Tariff per month in UAH (100 or 150)
  startDate: string; // YYYY-MM-DD
  activeUntil: string; // YYYY-MM-DD (exact date-to-date)
  balance: number; // leftover balance in UAH
  status: ClientStatus;
  providerAccountId?: string; // Linked provider account ID (max 2 users per account)
  telegramChatId?: string; // Telegram Chat ID for automated bot messages
  telegramUsername?: string; // Telegram @username
  viberId?: string; // Legacy field if present
  notes?: string;
  lastReminderDate?: string;
  lastReminderStatus?: 'sent' | 'failed' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  clientId: string;
  clientName: string;
  amount: number; // Deposit amount from client in UAH (PLUS in budget)
  monthlyPrice: number;
  previousBalance: number;
  newBalance: number;
  monthsAdded: number; // Number of months extended
  costUsdPerMonth?: number; // Cost in USD per month
  totalUsdDeducted?: number; // monthsAdded * costUsd
  previousActiveUntil: string;
  newActiveUntil: string;
  date: string; // ISO date-time
  note?: string;
}

export interface BudgetSummary {
  totalIncomeUah: number; // All payments from users in UAH (+)
  totalExpensesUah: number; // All expenses on provider deposits / subscriptions in UAH (-)
  netProfitUah: number; // totalIncomeUah - totalExpensesUah
  totalDepositedUsd: number; // Total $ put into provider account
  totalDeductedUsd: number; // Total $ deducted based on user subscriptions
  providerBalanceUsd: number; // Current remaining $ on provider account
  monthlyBurnUsd: number; // Sum of costUsd of all currently active clients
  averageExchangeRate: number; // Average spent UAH per $ deposited
}

export interface AppSettings {
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramSenderName: string;
  viberAuthToken?: string;
  viberSenderName?: string;
  defaultMonthlyPrice: number;
  reminderDaysBefore: number; // default 7
  cardRequisites: string;
  reminderMessageTemplate: string;
  autoReminderEnabled: boolean;
  autoReminderCron?: string;
  // Viber Message Templates
  viberRenewalMessageTemplate?: string;
  viberReminderMessageTemplate?: string;
  utilityTariffsSettings?: UtilityTariffsSettings;
}

export interface ViberMessageParams {
  name: string;
  login: string;
  phone: string;
  activeUntil: string;
  currentDate: string;
  amount: number | string;
  price: number | string;
  card: string;
  balance?: number | string;
  months?: number | string;
  device?: string;
  notes?: string;
}

export const DEFAULT_VIBER_REMINDER_TEMPLATE =
  'Доброго дня, {name}! Нагадуємо, що термін дії вашої підписки IPTV (логін: {login}) закінчується {active_until}. Сума до сплати: {amount} грн. Реквізити картки: {card}. Сьогодні {current_date}. Дякуємо, що ви з нами!';

export const DEFAULT_VIBER_RENEWAL_TEMPLATE =
  'Доброго дня, {name}! Вашу IPTV підписку (логін: {login}) успішно продовжено до {active_until}. Сума оплати: {amount} грн. Дата: {current_date}. Приємного перегляду!';

/**
 * Replaces placeholders like {name}, {login}, {active_until}, {amount}, {price}, {card}, {current_date}, {device}, {notes}
 */
export function interpolateViberMessage(template: string, params: ViberMessageParams): string {
  if (!template) return '';
  return template
    .replace(/\{name\}/g, params.name || '')
    .replace(/\{login\}/g, params.login || '')
    .replace(/\{phone\}/g, params.phone || '')
    .replace(/\{active_until\}/g, params.activeUntil || '')
    .replace(/\{expiry_date\}/g, params.activeUntil || '') // alias for compatibility
    .replace(/\{current_date\}/g, params.currentDate || '')
    .replace(/\{amount\}/g, String(params.amount ?? ''))
    .replace(/\{amount_to_pay\}/g, String(params.amount ?? '')) // alias
    .replace(/\{price\}/g, String(params.price ?? ''))
    .replace(/\{card\}/g, params.card || '')
    .replace(/\{card_number\}/g, params.card || '') // alias
    .replace(/\{balance\}/g, String(params.balance ?? '0'))
    .replace(/\{months\}/g, String(params.months ?? '1'))
    .replace(/\{device\}/g, params.device || '')
    .replace(/\{device_info\}/g, params.device || '') // alias
    .replace(/\{notes\}/g, params.notes || '')
    .replace(/\{comment\}/g, params.notes || ''); // alias
}

export interface MonthRevenueStat {
  monthKey: string; // YYYY-MM
  monthName: string; // e.g. "Вересень 2026"
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  paymentsCount: number;
  depositsCount: number;
  usdDeposits: number;
  usdExpenses: number;
  newClientsCount?: number;
}

export interface YearlyMonthIncomeStat {
  monthIndex: number; // 1 to 12
  monthKey: string; // YYYY-MM (e.g. "2026-09")
  monthName: string; // "Січень", "Лютий", etc.
  monthShort: string; // "Січ", "Лют", etc.
  year: number;
  totalIncome: number; // UAH
  paymentsCount: number;
  averagePayment: number; // UAH
  cumulativeIncome: number; // Running total from Jan to this month
  growthPct: number | null; // % growth compared to previous month
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

export interface CurrentYearStatsSummary {
  year: number;
  totalYearIncome: number;
  averageMonthlyIncome: number;
  totalYearPaymentsCount: number;
  highestMonth: {
    monthName: string;
    amount: number;
  } | null;
  currentMonthIncome: number;
  projectedYearEndIncome: number;
}

export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  expiringSoonClients: number; // <= 7 days
  expiredClients: number;
  pausedClients: number;
  currentMonthRevenue: number;
  projectedMonthlyRevenue: number;
  totalBalanceSum: number;
  paymentsThisMonthCount: number;
}

/**
 * Adds exact calendar months to a YYYY-MM-DD date ("число в число").
 * Preserves the exact day of month, capping at month end if needed (e.g. Jan 31 -> Feb 28).
 */
export function addMonthsExact(dateStr: string, monthsToAdd: number): string {
  if (!dateStr || monthsToAdd === 0) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];

  const totalMonths = (y * 12 + (m - 1)) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12; // 0-11

  // Day count in target month
  const maxDaysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const targetDay = Math.min(d, maxDaysInMonth);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonthIndex + 1)}-${pad(targetDay)}`;
}

export interface ExtensionCalculation {
  totalAvailable: number;
  monthsToAdd: number;
  monthsAdded: number;
  newBalance: number;
  leftoverBalance: number;
  newActiveUntil: string;
}

/**
 * Calculates payment extension based on deposit sum, current balance, and monthly price.
 * Supports calling with (currentActiveUntil, monthlyPrice, currentBalance, depositAmount)
 * or (currentBalance, depositAmount, monthlyPrice, currentActiveUntil).
 */
export function calculateExtension(
  arg1: string | number,
  arg2: number,
  arg3: number,
  arg4: string | number
): ExtensionCalculation {
  let currentActiveUntil: string;
  let monthlyPrice: number;
  let currentBalance: number;
  let depositAmount: number;

  if (typeof arg1 === 'string') {
    currentActiveUntil = arg1;
    monthlyPrice = arg2;
    currentBalance = arg3;
    depositAmount = typeof arg4 === 'number' ? arg4 : 0;
  } else {
    currentBalance = arg1;
    depositAmount = arg2;
    monthlyPrice = arg3;
    currentActiveUntil = typeof arg4 === 'string' ? arg4 : new Date().toISOString().split('T')[0];
  }

  const price = monthlyPrice > 0 ? monthlyPrice : 1;
  const totalAvailable = Math.max(0, currentBalance + depositAmount);
  const monthsToAdd = Math.floor(totalAvailable / price);
  const newBalance = totalAvailable % price;

  const newActiveUntil = monthsToAdd > 0
    ? addMonthsExact(currentActiveUntil, monthsToAdd)
    : currentActiveUntil;

  return {
    totalAvailable,
    monthsToAdd,
    monthsAdded: monthsToAdd,
    newBalance,
    leftoverBalance: newBalance,
    newActiveUntil,
  };
}

/**
 * Calculates days remaining until activeUntil date relative to today.
 */
export function getDaysRemaining(activeUntilStr: string): number {
  if (!activeUntilStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [y, m, d] = activeUntilStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  targetDate.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Evaluates client status from activeUntil and days remaining.
 */
export function computeClientStatus(client: { activeUntil: string; status?: ClientStatus }): ClientStatus {
  if (client.status === 'paused') return 'paused';
  const days = getDaysRemaining(client.activeUntil);
  if (days < 0) return 'expired';
  if (days <= 7) return 'expiring_soon';
  return 'active';
}

/**
 * Formats YYYY-MM-DD to readable Ukrainian format "15 жовтня 2026" or "15.10.2026".
 */
export function formatDateUa(dateStr: string, short = false): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  if (short) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d)}.${pad(m)}.${y}`;
  }
  const monthsUa = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  return `${d} ${monthsUa[m - 1]} ${y}`;
}

/**
 * Formats phone number for Viber deep link (e.g. +380971234567 -> 380971234567 or clean digits).
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}
