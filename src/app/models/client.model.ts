import { UtilityTariffsSettings, OutageScheduleViewVariant } from './utility.model';

export type ClientStatus = 'active' | 'expiring_soon' | 'expired' | 'paused';
export type SubscriptionPlanType = '1usd' | '2usd' | 'custom';

export type UserRole = 'admin' | 'user' | 'new';

export type AppTabId =
  | 'outage_schedule'
  | 'clients'
  | 'accounts'
  | 'budget'
  | 'analytics'
  | 'payments'
  | 'electricity'
  | 'water'
  | 'waste'
  | 'water_waste'
  | 'users'
  | 'settings';

export type SettingScopeType = 'user' | 'system';

export type SettingsSectionId =
  | 'theme'
  | 'outage_display'
  | 'house_visibility'
  | 'electricity_tariffs'
  | 'water_tariffs'
  | 'waste_tariffs'
  | 'water_waste_tariffs'
  | 'outage_sync_interval'
  | 'billing'
  | 'viber'
  | 'database'
  | 'backup';

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  label: string;
  subtitle: string;
  icon: string;
  defaultScope: SettingScopeType;
  isSystem?: boolean;
  dbTable: string;
}

export const ALL_SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: 'theme',
    label: 'Тема оформлення додатка',
    subtitle: 'Світла, темна або автоматична (системна)',
    icon: 'dark_mode',
    defaultScope: 'user',
    dbTable: 'user_settings.theme_mode',
  },
  {
    id: 'outage_display',
    label: 'Вигляд графіку відключень',
    subtitle: '10 стилів відображення погодинного графіку ДТЕК',
    icon: 'view_timeline',
    defaultScope: 'user',
    dbTable: 'user_settings.outage_schedule_view_variant',
  },
  {
    id: 'house_visibility',
    label: 'Відображення будинків по вкладках',
    subtitle: 'Індивідуальний показ або приховування спільних будинків для кожної вкладки',
    icon: 'visibility',
    defaultScope: 'user',
    dbTable: 'user_settings.hidden_house_tabs',
  },
  {
    id: 'electricity_tariffs',
    label: 'Тариф електро',
    subtitle: 'Індивідуальний однозонний та двозонний тариф (День/Ніч), ліміти',
    icon: 'bolt',
    defaultScope: 'user',
    dbTable: 'user_settings.electricity_tariffs',
  },
  {
    id: 'water_tariffs',
    label: 'Тариф на воду',
    subtitle: 'Індивідуальна вартість 1 м³ води, щомісячна абонплата та історія',
    icon: 'water_drop',
    defaultScope: 'user',
    dbTable: 'user_settings.water_tariffs',
  },
  {
    id: 'waste_tariffs',
    label: 'Тариф на вивіз сміття',
    subtitle: 'Індивідуальний тариф на вивіз ТПВ (грн/міс за 1 особу) та історія',
    icon: 'delete_outline',
    defaultScope: 'user',
    dbTable: 'user_settings.waste_tariffs',
  },
  {
    id: 'outage_sync_interval',
    label: 'Час оновлення графіку відключень',
    subtitle: 'Інтервал автоматичної синхронізації графіку ДТЕК з сайтом у БД (хв)',
    icon: 'update',
    defaultScope: 'system',
    isSystem: true,
    dbTable: 'settings / system_settings_config',
  },
  {
    id: 'billing',
    label: 'Загальні налаштування та реквізити IPTV',
    subtitle: 'Стандартний тариф IPTV, картка / IBAN, нагадування',
    icon: 'payments',
    defaultScope: 'system',
    dbTable: 'settings',
  },
  {
    id: 'viber',
    label: 'Шаблони повідомлень Viber',
    subtitle: 'Тексти нагадувань та підтверджень оплати',
    icon: 'chat',
    defaultScope: 'system',
    dbTable: 'settings',
  },
  {
    id: 'database',
    label: 'Бази даних PostgreSQL',
    subtitle: 'Керування Aiven PostgreSQL та Cloud SQL, копіювання таблиць',
    icon: 'storage',
    defaultScope: 'system',
    isSystem: true,
    dbTable: 'settings / system_settings_config',
  },
  {
    id: 'backup',
    label: 'Резервне копіювання JSON',
    subtitle: 'Експорт та відновлення повної бази даних із JSON',
    icon: 'cloud_download',
    defaultScope: 'system',
    isSystem: true,
    dbTable: 'system_settings_config',
  },
];

export interface UserPersonalSettings {
  userId: string;
  themeMode: 'light' | 'dark' | 'system';
  outageScheduleViewVariant: OutageScheduleViewVariant;
  hiddenHouseTabs: Record<string, string[]>;
  electricityTariffs?: {
    electricitySingle?: UtilityTariffsSettings['electricitySingle'];
    electricityDual?: UtilityTariffsSettings['electricityDual'];
  } | null;
  waterTariffs?: UtilityTariffsSettings['water'] | null;
  wasteTariffs?: UtilityTariffsSettings['waste'] | null;
  customPreferences?: Record<string, unknown>;
  updatedAt?: string;
}

export interface SystemSettingsConfig {
  id: string;
  scopesConfig: Record<string, SettingScopeType>;
  systemValues?: Record<string, unknown>;
  updatedAt?: string;
}

export const ALL_USER_ASSIGNABLE_TABS: { id: AppTabId; label: string; icon: string; badgeColor: string }[] = [
  { id: 'electricity', label: 'Електроенергія та Графік', icon: 'bolt', badgeColor: 'amber' },
  { id: 'water', label: 'Вода', icon: 'water_drop', badgeColor: 'cyan' },
  { id: 'waste', label: 'Вивіз сміття', icon: 'delete_outline', badgeColor: 'emerald' },
  { id: 'clients', label: 'Клієнти IPTV', icon: 'group', badgeColor: 'emerald' },
  { id: 'payments', label: 'Оплати', icon: 'receipt_long', badgeColor: 'indigo' },
  { id: 'accounts', label: 'Акаунти IPTV', icon: 'dns', badgeColor: 'purple' },
  { id: 'budget', label: 'Бюджет ($/₴)', icon: 'account_balance_wallet', badgeColor: 'teal' },
  { id: 'analytics', label: 'Аналітика', icon: 'analytics', badgeColor: 'sky' },
  { id: 'settings', label: 'Налаштування', icon: 'settings', badgeColor: 'slate' },
];

export const DEFAULT_USER_TABS: AppTabId[] = [
  'outage_schedule',
  'electricity',
  'water',
  'waste',
  'water_waste',
  'settings',
];
export const ALL_ADMIN_TABS: AppTabId[] = [
  'outage_schedule',
  'clients',
  'accounts',
  'budget',
  'analytics',
  'payments',
  'electricity',
  'water',
  'waste',
  'water_waste',
  'users',
  'settings',
];

export const SETTINGS_PERMISSION_PREFIX = 'settings:';

export function getDefaultUserSettingsSections(
  scopesConfig?: Record<string, SettingScopeType> | null
): SettingsSectionId[] {
  const scopes = scopesConfig || {};
  return ALL_SETTINGS_SECTIONS.filter((s) => (scopes[s.id] || s.defaultScope) === 'user').map(
    (s) => s.id
  );
}

export function extractAllowedSettingsFromUser(
  user?: Partial<AppUser> | null,
  scopesConfig?: Record<string, SettingScopeType> | null
): SettingsSectionId[] {
  if (!user) return [];
  if (user.role === 'admin') {
    return ALL_SETTINGS_SECTIONS.map((s) => s.id);
  }
  const set = new Set<SettingsSectionId>();
  const validIds = new Set<string>(ALL_SETTINGS_SECTIONS.map((s) => s.id));
  const addSection = (raw: string) => {
    if (raw === 'water_waste_tariffs') {
      set.add('water_tariffs');
      set.add('waste_tariffs');
      return;
    }
    if (validIds.has(raw)) {
      set.add(raw as SettingsSectionId);
    }
  };
  for (const defSec of getDefaultUserSettingsSections(scopesConfig)) {
    set.add(defSec);
  }
  if (Array.isArray(user.allowedSettings)) {
    for (const s of user.allowedSettings) {
      addSection(s);
    }
  }
  if (Array.isArray(user.allowedTabs)) {
    for (const t of user.allowedTabs) {
      if (typeof t === 'string' && t.startsWith(SETTINGS_PERMISSION_PREFIX)) {
        const sec = t.slice(SETTINGS_PERMISSION_PREFIX.length);
        addSection(sec);
      }
    }
  }
  return Array.from(set);
}

export type UserAccountStatus = 'active' | 'inactive';

export type HouseholdAccessLevel = 'view_only' | 'full';

export type MemberRelationTag =
  | 'family'
  | 'wife'
  | 'husband'
  | 'father'
  | 'mother'
  | 'brother'
  | 'sister'
  | 'son'
  | 'daughter'
  | 'grandmother'
  | 'grandfather'
  | 'friend_male'
  | 'friend_female'
  | 'acquaintance';

export interface MemberRelationTagMeta {
  id: MemberRelationTag;
  label: string;
  icon: string;
  badgeClass: string;
  activeClass: string;
  iconColorClass: string;
}

export const MEMBER_RELATION_TAGS: MemberRelationTagMeta[] = [
  {
    id: 'family',
    label: "Сім'я",
    icon: 'family_restroom',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-xs',
    iconColorClass: 'text-rose-500',
  },
  {
    id: 'wife',
    label: 'Дружина',
    icon: 'favorite',
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',
    activeClass: 'bg-pink-600 text-white border-pink-600 shadow-xs',
    iconColorClass: 'text-pink-500',
  },
  {
    id: 'husband',
    label: 'Чоловік',
    icon: 'favorite_border',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
    iconColorClass: 'text-indigo-500',
  },
  {
    id: 'father',
    label: 'Батько',
    icon: 'man',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-xs',
    iconColorClass: 'text-blue-500',
  },
  {
    id: 'mother',
    label: 'Мати',
    icon: 'woman',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    activeClass: 'bg-purple-600 text-white border-purple-600 shadow-xs',
    iconColorClass: 'text-purple-500',
  },
  {
    id: 'brother',
    label: 'Брат',
    icon: 'man_4',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    activeClass: 'bg-cyan-600 text-white border-cyan-600 shadow-xs',
    iconColorClass: 'text-cyan-500',
  },
  {
    id: 'sister',
    label: 'Сестра',
    icon: 'woman_2',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    activeClass: 'bg-violet-600 text-white border-violet-600 shadow-xs',
    iconColorClass: 'text-violet-500',
  },
  {
    id: 'son',
    label: 'Син',
    icon: 'boy',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
    iconColorClass: 'text-indigo-500',
  },
  {
    id: 'daughter',
    label: 'Донька',
    icon: 'girl',
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',
    activeClass: 'bg-pink-600 text-white border-pink-600 shadow-xs',
    iconColorClass: 'text-pink-500',
  },
  {
    id: 'grandmother',
    label: 'Бабуся',
    icon: 'elderly_woman',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    activeClass: 'bg-amber-600 text-white border-amber-600 shadow-xs',
    iconColorClass: 'text-amber-500',
  },
  {
    id: 'grandfather',
    label: 'Дідусь',
    icon: 'elderly',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
    iconColorClass: 'text-emerald-500',
  },
  {
    id: 'friend_male',
    label: 'Друг',
    icon: 'face_6',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    activeClass: 'bg-sky-600 text-white border-sky-600 shadow-xs',
    iconColorClass: 'text-sky-500',
  },
  {
    id: 'friend_female',
    label: 'Подруга',
    icon: 'face_3',
    badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    activeClass: 'bg-fuchsia-600 text-white border-fuchsia-600 shadow-xs',
    iconColorClass: 'text-fuchsia-500',
  },
  {
    id: 'acquaintance',
    label: 'Знайомий',
    icon: 'emoji_people',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    activeClass: 'bg-teal-600 text-white border-teal-600 shadow-xs',
    iconColorClass: 'text-teal-500',
  },
];

export interface HouseholdInvite {
  id: string;
  code: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPicture?: string;
  houseIds: string[];
  houseNames: string[];
  accessLevel: HouseholdAccessLevel; // 'view_only' (За замовчуванням) | 'full' (Повний доступ)
  includeSharedBudget: boolean;
  memberTags: MemberRelationTag[];
  label?: string;
  acceptedByUserIds: string[];
  createdAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole; // 'admin' (Всі права), 'user' (Індивідуальний доступ), 'new' (Зовсім без доступу)
  status?: UserAccountStatus; // 'active' (Активний) | 'inactive' (Неактивний / Заблокований)
  allowedTabs?: AppTabId[]; // Вкладки, доступні користувачу
  allowedSettings?: SettingsSectionId[]; // Окремі пункти налаштувань, відкриті адміністратором
  assignedUtilityAccountIds?: string[]; // ID прив'язаних адміністратором будинків / комунальних рахунків
  assignedClientIds?: string[]; // ID прив'язаних абонентів IPTV
  defaultUtilityAccountId?: string; // ID будинку за замовчуванням для відображення графіку відключень
  outageScheduleViewVariant?: OutageScheduleViewVariant; // Персональний вигляд графіку відключень для користувача
  canManageOwnData?: boolean; // Дозвіл додавати та редагувати власні дані й показники (за замовчуванням true)
  householdAccessLevel?: HouseholdAccessLevel; // 'view_only' (Тільки для перегляду) | 'full' (Повний доступ)
  memberTags?: MemberRelationTag[]; // Теги: Сім'я, Друг, Подруга, Донька, Син, Знайомий
  invitedByUserId?: string;
  invitedByUserName?: string;
  sharedBudgetWithUserId?: string;
  createdAt: string;
  lastLoginAt: string;
  sub?: string;
}

export function isUserAccountActive(user?: Partial<AppUser> | null): boolean {
  if (!user) return false;
  if (user.status === 'inactive') return false;
  if (user.role === 'new') return false;
  return true;
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
  ownerUserId?: string;
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
  balanceBeforeUsd?: number; // Provider balance before this deposit ($)
  balanceAfterUsd?: number; // Provider balance after this deposit ($)
  createdAt: string;
}

export type LedgerEntryType = 'income' | 'expense' | 'deduction' | 'adjustment';
export type LedgerCategory = 'client_payment' | 'account_payment' | 'provider_topup' | 'provider_adjustment' | 'custom';

export interface ProviderBalanceAdjustment {
  id: string;
  date: string;
  amountUsd: number;
  note?: string;
  createdAt: string;
}

export interface AccountDeductionOverride {
  id: string; // e.g. "ded_acc_m1"
  accountId?: string;
  isExcluded?: boolean;
  amountUsd?: number;
  amountUah?: number;
  date?: string;
  title?: string;
  subtitle?: string;
  note?: string;
}

export interface BudgetLedgerItem {
  id: string;
  type: LedgerEntryType;
  category?: LedgerCategory;
  date: string;
  amountUah: number; // positive for income (+), negative for expense (-)
  amountUsd?: number;
  balanceBeforeUsd?: number; // Provider balance before this operation ($)
  balanceAfterUsd?: number; // Provider balance after this operation ($)
  title: string;
  subtitle: string;
  note?: string;
  paymentMethod?: string;
  clientId?: string;
  clientName?: string;
  accountId?: string;
  accountName?: string;
  isCustom?: boolean;
}

export interface BudgetApiResponse {
  summary: BudgetSummary & {
    runwayMonths?: number;
    activeClientsCount?: number;
    calculatedProviderBalanceUsd?: number;
    providerBalanceAdjustmentsSum?: number;
  };
  deposits: ProviderDeposit[];
  adjustments?: ProviderBalanceAdjustment[];
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
  notes?: string;
  groupName?: string; // Назва групи (якщо один клієнт має декілька підписок)
  groupBalance?: number; // Залишок гривень на балансі даної групи (₴)
  lastReminderDate?: string;
  lastReminderStatus?: 'sent' | 'failed' | 'manual';
  ownerUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientGroupView {
  groupKey: string;
  groupName: string;
  isGrouped: boolean;
  groupBalance: number;
  totalMonthlyPrice: number;
  clients: Client[];
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
  calculatedProviderBalanceUsd?: number;
  providerBalanceAdjustmentsSum?: number;
  runwayMonths?: number;
  activeClientsCount?: number;
}

export interface AppSettings {
  defaultMonthlyPrice: number;
  reminderDaysBefore: number; // default 7
  cardRequisites: string;
  reminderMessageTemplate: string;
  autoReminderEnabled: boolean;
  autoReminderCron?: string;
  // Viber Message Templates
  viberRenewalMessageTemplate?: string;
  viberReminderMessageTemplate?: string;
  outageScheduleViewVariant?: string;
  dtekSyncIntervalMinutes?: number;
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
