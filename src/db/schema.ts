import { pgTable, text, real, integer, boolean, jsonb } from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  iptvLogin: text('iptv_login').notNull(),
  deviceInfo: text('device_info'),
  subscriptionPlan: text('subscription_plan'),
  costUsd: real('cost_usd').notNull().default(1),
  monthlyPrice: real('monthly_price').notNull().default(100),
  startDate: text('start_date').notNull(),
  activeUntil: text('active_until').notNull(),
  balance: real('balance').notNull().default(0),
  status: text('status').notNull().default('active'),
  providerAccountId: text('provider_account_id'),
  telegramChatId: text('telegram_chat_id'),
  telegramUsername: text('telegram_username'),
  viberId: text('viber_id'),
  notes: text('notes'),
  lastReminderDate: text('last_reminder_date'),
  lastReminderStatus: text('last_reminder_status'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull(),
  amount: real('amount').notNull(),
  monthlyPrice: real('monthly_price').notNull(),
  previousBalance: real('previous_balance').notNull(),
  newBalance: real('new_balance').notNull(),
  monthsAdded: integer('months_added').notNull(),
  costUsdPerMonth: real('cost_usd_per_month'),
  totalUsdDeducted: real('total_usd_deducted'),
  previousActiveUntil: text('previous_active_until').notNull(),
  newActiveUntil: text('new_active_until').notNull(),
  date: text('date').notNull(),
  note: text('note'),
});

export const providerAccounts = pgTable('provider_accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  login: text('login').notNull(),
  password: text('password'),
  playlistUrl: text('playlist_url'),
  serverUrl: text('server_url'),
  maxSlots: integer('max_slots').notNull().default(2),
  assignedClientIds: jsonb('assigned_client_ids').$type<string[]>().notNull().default([]),
  pricePerMonthUsd: real('price_per_month_usd').notNull().default(1),
  startDate: text('start_date'),
  monthsCount: integer('months_count').notNull().default(0),
  validUntil: text('valid_until').notNull(),
  totalDeductedUsd: real('total_deducted_usd').notNull().default(0),
  renewals: jsonb('renewals').$type<Record<string, unknown>[]>() ,
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
});

export const providerDeposits = pgTable('provider_deposits', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  amountUsd: real('amount_usd').notNull(),
  spentUah: real('spent_uah').notNull(),
  exchangeRate: real('exchange_rate'),
  paymentMethod: text('payment_method'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  telegramBotToken: text('telegram_bot_token').notNull().default(''),
  telegramBotUsername: text('telegram_bot_username').notNull().default(''),
  telegramSenderName: text('telegram_sender_name').notNull().default(''),
  defaultMonthlyPrice: real('default_monthly_price').notNull().default(100),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(7),
  cardRequisites: text('card_requisites').notNull().default(''),
  reminderMessageTemplate: text('reminder_message_template').notNull().default(''),
  autoReminderEnabled: boolean('auto_reminder_enabled').notNull().default(false),
  viberAuthToken: text('viber_auth_token'),
  viberSenderName: text('viber_sender_name'),
  viberReminderMessageTemplate: text('viber_reminder_message_template'),
  viberRenewalMessageTemplate: text('viber_renewal_message_template'),
  utilityTariffsSettings: jsonb('utility_tariffs_settings'),
});

export const utilityAccounts = pgTable('utility_accounts', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'electricity' | 'water_waste'
  name: text('name').notNull(),
  accountNumber: text('account_number').notNull(),
  address: text('address'),
  meterNumber: text('meter_number'),
  electricityTariffType: text('electricity_tariff_type').notNull().default('single'), // 'single' | 'dual'
  residentsCount: integer('residents_count').notNull().default(1),
  initialReadingT1: real('initial_reading_t1').default(0),
  initialReadingT2: real('initial_reading_t2').default(0),
  initialReadingWater: real('initial_reading_water').default(0),
  waterEnabled: boolean('water_enabled').default(true),
  wasteEnabled: boolean('waste_enabled').default(true),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
});

export const utilityReadings = pgTable('utility_readings', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  utilityType: text('utility_type').notNull(), // 'electricity' | 'water' | 'waste'
  date: text('date').notNull(), // YYYY-MM-DD
  periodMonth: text('period_month'), // YYYY-MM
  readingT1: real('reading_t1'),
  readingT2: real('reading_t2'),
  consumptionT1: real('consumption_t1'),
  consumptionT2: real('consumption_t2'),
  rateT1: real('rate_t1'),
  rateT2: real('rate_t2'),
  totalCost: real('total_cost').notNull().default(0),
  season: text('season'), // 'summer' | 'winter'
  isPaid: boolean('is_paid').default(false),
  paidDate: text('paid_date'),
  paidAmount: real('paid_amount'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});
