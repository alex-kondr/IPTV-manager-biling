import { UtilityAccount } from '../../models/utility.model';

export const OOEK_DEFAULT_PORTMONE_PAYEE_ID = '119174';
export const OOEK_DEFAULT_PORTMONE_ATTR3 = '0_2';

export interface StoredOoekPortmoneConfig {
  payeeId: string;
  attribute3: string;
  address?: string;
}

export interface OoekPortmoneDecodedData {
  rawQuery: string;
  params: Record<string, string>;
  payeeId: string;
  description: string;
  amount: string;
  attribute1: string;
  attribute2: string;
  attribute3: string;
  attribute4: string;
}

export interface OoekPortmoneLinkResponse {
  success: boolean;
  paymentLink?: string;
  rawQuery?: string;
  payeeId?: string;
  descriptionSlash?: string;
  contractNumber12?: string;
  amountUah?: number;
  amountFormatted?: string;
  address?: string;
  attribute3?: string;
  source?: 'ondo_live' | 'local_gzip';
  consumer?: Record<string, unknown> | null;
  ondoError?: string | null;
  decoded?: OoekPortmoneDecodedData;
  error?: string;
}

export function formatOoekAccountSlashClient(rawPrimary?: string | null, rawSecondary?: string | null): string {
  const raw = String(rawSecondary || rawPrimary || '')
    .replace(/^№\s*/i, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!raw) return '';

  if (raw.includes('/')) {
    const [prefixRaw, suffixRaw] = raw.split('/');
    const prefix = (prefixRaw || '').replace(/\D+/g, '');
    const suffixDigits = (suffixRaw || '').replace(/\D+/g, '');
    if (prefix && suffixDigits) {
      const unpadded = suffixDigits.replace(/^0+/, '') || '0';
      return `${prefix}/${unpadded.padStart(8, '0')}`;
    }
    return raw;
  }

  const digits = raw.replace(/\D+/g, '');
  if (!digits) return raw;

  if (digits.length === 12 && digits.startsWith('000')) {
    const nine = digits.slice(3);
    const prefix = nine.slice(0, 5);
    const unpadded = nine.slice(5).replace(/^0+/, '') || '0';
    return `${prefix}/${unpadded.padStart(8, '0')}`;
  }

  if (digits.length >= 8 && digits.length <= 13) {
    const prefix = digits.slice(0, 5);
    const unpadded = digits.slice(5).replace(/^0+/, '') || '0';
    return `${prefix}/${unpadded.padStart(8, '0')}`;
  }

  return digits;
}

function getStorageKey(accountId: string): string {
  return `ooek_portmone_cfg_v1_${accountId}`;
}

export function loadStoredOoekPortmoneConfig(accountId: string): StoredOoekPortmoneConfig | null {
  if (!accountId || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOoekPortmoneConfig>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      payeeId: String(parsed.payeeId || OOEK_DEFAULT_PORTMONE_PAYEE_ID).replace(/\D+/g, '') || OOEK_DEFAULT_PORTMONE_PAYEE_ID,
      attribute3: String(parsed.attribute3 || OOEK_DEFAULT_PORTMONE_ATTR3).trim() || OOEK_DEFAULT_PORTMONE_ATTR3,
      address: typeof parsed.address === 'string' ? parsed.address.trim() : undefined,
    };
  } catch {
    return null;
  }
}

export function saveStoredOoekPortmoneConfig(accountId: string, cfg: StoredOoekPortmoneConfig): void {
  if (!accountId || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      getStorageKey(accountId),
      JSON.stringify({
        payeeId: String(cfg.payeeId || OOEK_DEFAULT_PORTMONE_PAYEE_ID).replace(/\D+/g, '') || OOEK_DEFAULT_PORTMONE_PAYEE_ID,
        attribute3: String(cfg.attribute3 || OOEK_DEFAULT_PORTMONE_ATTR3).trim() || OOEK_DEFAULT_PORTMONE_ATTR3,
        address: typeof cfg.address === 'string' ? cfg.address.trim() : undefined,
      })
    );
  } catch {
    // ignore quota errors
  }
}

export function resolveInitialPortmoneParams(
  acc: UtilityAccount,
  dueAmountUah: number
): {
  description: string;
  amountUah: number;
  payeeId: string;
  attribute3: string;
  address: string;
} {
  const stored = loadStoredOoekPortmoneConfig(acc.id);
  const description = formatOoekAccountSlashClient(acc.accountNumber, acc.ooekAccountNumber);

  const fallbackAddressParts = [
    acc.city?.trim() || '',
    acc.street?.trim() || '',
    acc.houseNum?.trim() ? `буд.${acc.houseNum.trim()}` : '',
  ].filter(Boolean);

  const address =
    stored?.address ||
    acc.ooekPaymentRequisites?.address?.trim() ||
    fallbackAddressParts.join(', ') ||
    acc.name?.trim() ||
    '';

  const safeAmount =
    Number.isFinite(dueAmountUah) && dueAmountUah > 0 ? Math.round(dueAmountUah * 100) / 100 : 0;

  return {
    description,
    amountUah: safeAmount,
    payeeId: stored?.payeeId || OOEK_DEFAULT_PORTMONE_PAYEE_ID,
    attribute3: stored?.attribute3 || OOEK_DEFAULT_PORTMONE_ATTR3,
    address,
  };
}
