import { db } from '../db/index';
import {
  clients,
  payments,
  providerAccounts,
  providerDeposits,
  settings,
  utilityAccounts,
  utilityReadings,
} from '../db/schema';
import { eq } from 'drizzle-orm';

let isConnectedToCloudSql = false;
let lastSyncTimestamp: string | null = null;
let connectionError: string | null = null;

export function isCloudSqlAvailable(): boolean {
  return Boolean(process.env['SQL_HOST'] && process.env['SQL_USER'] && process.env['SQL_DB_NAME']);
}

export function getCloudSqlDbStatus() {
  return {
    provider: 'Google Cloud SQL (PostgreSQL)',
    host: process.env['SQL_HOST'] || null,
    database: process.env['SQL_DB_NAME'] || null,
    connected: isConnectedToCloudSql || isCloudSqlAvailable(),
    lastSync: lastSyncTimestamp,
    error: connectionError,
  };
}

export async function loadAllFromCloudSql(): Promise<{
  clients: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  providerAccounts: Record<string, unknown>[];
  providerDeposits: Record<string, unknown>[];
  utilityAccounts: Record<string, unknown>[];
  utilityReadings: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
} | null> {
  if (!isCloudSqlAvailable()) return null;

  try {
    const [
      allClients,
      allPayments,
      allAccounts,
      allDeposits,
      allSettings,
      allUtilityAccounts,
      allUtilityReadings,
    ] = await Promise.all([
      db.select().from(clients),
      db.select().from(payments),
      db.select().from(providerAccounts),
      db.select().from(providerDeposits),
      db.select().from(settings),
      db.select().from(utilityAccounts),
      db.select().from(utilityReadings),
    ]);

    isConnectedToCloudSql = true;
    lastSyncTimestamp = new Date().toISOString();
    connectionError = null;

    let settingsObj: Record<string, unknown> | null = null;
    if (allSettings.length > 0) {
      const globalDoc = allSettings.find((s) => s.id === 'global') || allSettings[0];
      const rest = { ...globalDoc };
      delete (rest as { id?: string }).id;
      settingsObj = rest as Record<string, unknown>;
    }

    return {
      clients: allClients as Record<string, unknown>[],
      payments: allPayments as Record<string, unknown>[],
      providerAccounts: allAccounts as Record<string, unknown>[],
      providerDeposits: allDeposits as Record<string, unknown>[],
      utilityAccounts: allUtilityAccounts as Record<string, unknown>[],
      utilityReadings: allUtilityReadings as Record<string, unknown>[],
      settings: settingsObj,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Cloud SQL] loadAll error:', msg);
    connectionError = msg;
    return null;
  }
}

export async function saveClientToCloudSql(client: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: String(client['id']),
      fullName: String(client['fullName'] || ''),
      phone: String(client['phone'] || ''),
      iptvLogin: String(client['iptvLogin'] || ''),
      deviceInfo: client['deviceInfo'] ? String(client['deviceInfo']) : null,
      subscriptionPlan: client['subscriptionPlan'] ? String(client['subscriptionPlan']) : null,
      costUsd: Number(client['costUsd']) || 1,
      monthlyPrice: Number(client['monthlyPrice']) || 100,
      startDate: String(client['startDate'] || ''),
      activeUntil: String(client['activeUntil'] || ''),
      balance: Number(client['balance']) || 0,
      status: String(client['status'] || 'active'),
      providerAccountId: client['providerAccountId'] ? String(client['providerAccountId']) : null,
      telegramChatId: client['telegramChatId'] ? String(client['telegramChatId']) : null,
      telegramUsername: client['telegramUsername'] ? String(client['telegramUsername']) : null,
      viberId: client['viberId'] ? String(client['viberId']) : null,
      notes: client['notes'] ? String(client['notes']) : null,
      lastReminderDate: client['lastReminderDate'] ? String(client['lastReminderDate']) : null,
      lastReminderStatus: client['lastReminderStatus'] ? String(client['lastReminderStatus']) : null,
      createdAt: String(client['createdAt'] || new Date().toISOString()),
      updatedAt: String(client['updatedAt'] || new Date().toISOString()),
    };

    await db.insert(clients)
      .values(data)
      .onConflictDoUpdate({
        target: clients.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] saveClient error:', err);
    return false;
  }
}

export async function deleteClientFromCloudSql(clientId: string): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await db.delete(clients).where(eq(clients.id, clientId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] deleteClient error:', err);
    return false;
  }
}

export async function savePaymentToCloudSql(payment: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: String(payment['id']),
      clientId: String(payment['clientId']),
      clientName: String(payment['clientName']),
      amount: Number(payment['amount']) || 0,
      monthlyPrice: Number(payment['monthlyPrice']) || 0,
      previousBalance: Number(payment['previousBalance']) || 0,
      newBalance: Number(payment['newBalance']) || 0,
      monthsAdded: Number(payment['monthsAdded']) || 0,
      costUsdPerMonth: payment['costUsdPerMonth'] != null ? Number(payment['costUsdPerMonth']) : null,
      totalUsdDeducted: payment['totalUsdDeducted'] != null ? Number(payment['totalUsdDeducted']) : null,
      previousActiveUntil: String(payment['previousActiveUntil']),
      newActiveUntil: String(payment['newActiveUntil']),
      date: String(payment['date']),
      note: payment['note'] ? String(payment['note']) : null,
    };

    await db.insert(payments)
      .values(data)
      .onConflictDoUpdate({
        target: payments.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] savePayment error:', err);
    return false;
  }
}

export async function deletePaymentFromCloudSql(paymentId: string): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await db.delete(payments).where(eq(payments.id, paymentId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] deletePayment error:', err);
    return false;
  }
}

export async function saveProviderAccountToCloudSql(account: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: String(account['id']),
      name: String(account['name']),
      login: String(account['login']),
      password: account['password'] ? String(account['password']) : null,
      playlistUrl: account['playlistUrl'] ? String(account['playlistUrl']) : null,
      serverUrl: account['serverUrl'] ? String(account['serverUrl']) : null,
      maxSlots: Number(account['maxSlots']) || 2,
      assignedClientIds: Array.isArray(account['assignedClientIds']) ? (account['assignedClientIds'] as string[]) : [],
      pricePerMonthUsd: Number(account['pricePerMonthUsd']) || 1,
      startDate: account['startDate'] ? String(account['startDate']) : null,
      monthsCount: Number(account['monthsCount']) || 0,
      validUntil: String(account['validUntil']),
      totalDeductedUsd: Number(account['totalDeductedUsd']) || 0,
      renewals: Array.isArray(account['renewals']) ? (account['renewals'] as Record<string, unknown>[]) : [],
      notes: account['notes'] ? String(account['notes']) : null,
      createdAt: String(account['createdAt'] || new Date().toISOString()),
      updatedAt: String(account['updatedAt'] || new Date().toISOString()),
    };

    await db.insert(providerAccounts)
      .values(data)
      .onConflictDoUpdate({
        target: providerAccounts.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] saveProviderAccount error:', err);
    return false;
  }
}

export async function deleteProviderAccountFromCloudSql(accountId: string): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await db.delete(providerAccounts).where(eq(providerAccounts.id, accountId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] deleteProviderAccount error:', err);
    return false;
  }
}

export async function saveProviderDepositToCloudSql(deposit: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: String(deposit['id']),
      date: String(deposit['date']),
      amountUsd: Number(deposit['amountUsd']) || 0,
      spentUah: Number(deposit['spentUah']) || 0,
      exchangeRate: deposit['exchangeRate'] != null ? Number(deposit['exchangeRate']) : null,
      paymentMethod: deposit['paymentMethod'] ? String(deposit['paymentMethod']) : null,
      note: deposit['note'] ? String(deposit['note']) : null,
      createdAt: String(deposit['createdAt'] || new Date().toISOString()),
    };

    await db.insert(providerDeposits)
      .values(data)
      .onConflictDoUpdate({
        target: providerDeposits.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] saveProviderDeposit error:', err);
    return false;
  }
}

export async function deleteProviderDepositFromCloudSql(depositId: string): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await db.delete(providerDeposits).where(eq(providerDeposits.id, depositId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] deleteProviderDeposit error:', err);
    return false;
  }
}

export async function saveUtilityAccountToCloudSql(account: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: String(account['id']),
      type: String(account['type'] || 'electricity'),
      name: String(account['name'] || ''),
      accountNumber: String(account['accountNumber'] || ''),
      address: account['address'] ? String(account['address']) : null,
      meterNumber: account['meterNumber'] ? String(account['meterNumber']) : null,
      electricityTariffType: String(account['electricityTariffType'] || 'single'),
      residentsCount: Number(account['residentsCount']) || 1,
      initialReadingT1: Number(account['initialReadingT1']) || 0,
      initialReadingT2: Number(account['initialReadingT2']) || 0,
      initialReadingWater: Number(account['initialReadingWater']) || 0,
      waterEnabled: account['waterEnabled'] !== undefined ? Boolean(account['waterEnabled']) : true,
      wasteEnabled: account['wasteEnabled'] !== undefined ? Boolean(account['wasteEnabled']) : true,
      notes: account['notes'] ? String(account['notes']) : null,
      createdAt: String(account['createdAt'] || new Date().toISOString()),
      updatedAt: account['updatedAt'] ? String(account['updatedAt']) : null,
    };

    await db.insert(utilityAccounts)
      .values(data)
      .onConflictDoUpdate({
        target: utilityAccounts.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] saveUtilityAccount error:', err);
    return false;
  }
}

export async function deleteUtilityAccountFromCloudSql(accountId: string): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await db.delete(utilityAccounts).where(eq(utilityAccounts.id, accountId));
    await db.delete(utilityReadings).where(eq(utilityReadings.accountId, accountId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] deleteUtilityAccount error:', err);
    return false;
  }
}

export async function saveUtilityReadingToCloudSql(reading: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: String(reading['id']),
      accountId: String(reading['accountId']),
      utilityType: String(reading['utilityType'] || 'electricity'),
      date: String(reading['date']),
      periodMonth: reading['periodMonth'] ? String(reading['periodMonth']) : null,
      readingT1: reading['readingT1'] != null ? Number(reading['readingT1']) : null,
      readingT2: reading['readingT2'] != null ? Number(reading['readingT2']) : null,
      consumptionT1: reading['consumptionT1'] != null ? Number(reading['consumptionT1']) : null,
      consumptionT2: reading['consumptionT2'] != null ? Number(reading['consumptionT2']) : null,
      rateT1: reading['rateT1'] != null ? Number(reading['rateT1']) : null,
      rateT2: reading['rateT2'] != null ? Number(reading['rateT2']) : null,
      totalCost: Number(reading['totalCost']) || 0,
      season: reading['season'] ? String(reading['season']) : null,
      isPaid: Boolean(reading['isPaid']),
      paidDate: reading['paidDate'] ? String(reading['paidDate']) : null,
      paidAmount: reading['paidAmount'] != null ? Number(reading['paidAmount']) : null,
      note: reading['note'] ? String(reading['note']) : null,
      createdAt: String(reading['createdAt'] || new Date().toISOString()),
    };

    await db.insert(utilityReadings)
      .values(data)
      .onConflictDoUpdate({
        target: utilityReadings.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] saveUtilityReading error:', err);
    return false;
  }
}

export async function deleteUtilityReadingFromCloudSql(readingId: string): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await db.delete(utilityReadings).where(eq(utilityReadings.id, readingId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] deleteUtilityReading error:', err);
    return false;
  }
}

export async function saveSettingsToCloudSql(settingsObj: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const data = {
      id: 'global',
      telegramBotToken: String(settingsObj['telegramBotToken'] || ''),
      telegramBotUsername: String(settingsObj['telegramBotUsername'] || ''),
      telegramSenderName: String(settingsObj['telegramSenderName'] || ''),
      defaultMonthlyPrice: Number(settingsObj['defaultMonthlyPrice']) || 100,
      reminderDaysBefore: Number(settingsObj['reminderDaysBefore']) || 7,
      cardRequisites: String(settingsObj['cardRequisites'] || ''),
      reminderMessageTemplate: String(settingsObj['reminderMessageTemplate'] || ''),
      autoReminderEnabled: Boolean(settingsObj['autoReminderEnabled']),
      viberAuthToken: settingsObj['viberAuthToken'] ? String(settingsObj['viberAuthToken']) : null,
      viberSenderName: settingsObj['viberSenderName'] ? String(settingsObj['viberSenderName']) : null,
      viberReminderMessageTemplate: settingsObj['viberReminderMessageTemplate'] ? String(settingsObj['viberReminderMessageTemplate']) : null,
      viberRenewalMessageTemplate: settingsObj['viberRenewalMessageTemplate'] ? String(settingsObj['viberRenewalMessageTemplate']) : null,
      utilityTariffsSettings: settingsObj['utilityTariffsSettings'] || null,
    };

    await db.insert(settings)
      .values(data)
      .onConflictDoUpdate({
        target: settings.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] saveSettings error:', err);
    return false;
  }
}

export async function getSettingsFromCloudSql(): Promise<Record<string, unknown> | null> {
  if (!isCloudSqlAvailable()) return null;
  try {
    const allSettings = await db.select().from(settings);
    if (allSettings.length > 0) {
      const globalDoc = allSettings.find((s) => s.id === 'global') || allSettings[0];
      const rest = { ...globalDoc };
      delete (rest as { id?: string }).id;
      return rest as Record<string, unknown>;
    }
    return null;
  } catch (err: unknown) {
    console.warn('[Cloud SQL] getSettings error:', err);
    return null;
  }
}

export async function seedInitialDataToCloudSql(fullDb: Record<string, unknown>): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    const clientsList = fullDb['clients'];
    if (Array.isArray(clientsList) && clientsList.length > 0) {
      for (const client of clientsList) {
        await saveClientToCloudSql(client as Record<string, unknown>);
      }
    }
    const paymentsList = fullDb['payments'];
    if (Array.isArray(paymentsList) && paymentsList.length > 0) {
      for (const payment of paymentsList) {
        await savePaymentToCloudSql(payment as Record<string, unknown>);
      }
    }
    const providerAccountsList = fullDb['providerAccounts'];
    if (Array.isArray(providerAccountsList) && providerAccountsList.length > 0) {
      for (const acc of providerAccountsList) {
        await saveProviderAccountToCloudSql(acc as Record<string, unknown>);
      }
    }
    const providerDepositsList = fullDb['providerDeposits'];
    if (Array.isArray(providerDepositsList) && providerDepositsList.length > 0) {
      for (const dep of providerDepositsList) {
        await saveProviderDepositToCloudSql(dep as Record<string, unknown>);
      }
    }
    const utilityAccountsList = fullDb['utilityAccounts'];
    if (Array.isArray(utilityAccountsList) && utilityAccountsList.length > 0) {
      for (const acc of utilityAccountsList) {
        await saveUtilityAccountToCloudSql(acc as Record<string, unknown>);
      }
    }
    const utilityReadingsList = fullDb['utilityReadings'];
    if (Array.isArray(utilityReadingsList) && utilityReadingsList.length > 0) {
      for (const r of utilityReadingsList) {
        await saveUtilityReadingToCloudSql(r as Record<string, unknown>);
      }
    }
    if (fullDb['settings']) {
      await saveSettingsToCloudSql(fullDb['settings'] as Record<string, unknown>);
    }
    console.log('[Cloud SQL] Successfully seeded initial data to Cloud SQL');
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] seedInitialData error:', err);
    return false;
  }
}

export async function purgeTestDataFromCloudSql(): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await Promise.all([
      db.delete(clients),
      db.delete(payments),
      db.delete(providerAccounts),
      db.delete(providerDeposits),
      db.delete(utilityAccounts),
      db.delete(utilityReadings),
      db.delete(settings),
    ]);
    lastSyncTimestamp = new Date().toISOString();
    console.log('[Cloud SQL] Purged all test data');
    return true;
  } catch (err: unknown) {
    console.error('[Cloud SQL] purgeTestData error:', err);
    return false;
  }
}
