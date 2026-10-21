// rMoney Multi-Currency & Regional Formatting System
import { useState, useEffect } from 'react';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  symbolPosition: 'prefix' | 'suffix';
  decimalDigits: number;
  thousandSeparator: string;
  decimalSeparator: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    symbolPosition: 'suffix',
    decimalDigits: 2,
    thousandSeparator: '.',
    decimalSeparator: ',',
  },
  {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'CAD',
    symbol: 'C$',
    name: 'Canadian Dollar',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'AUD',
    symbol: 'A$',
    name: 'Australian Dollar',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'JPY',
    symbol: '¥',
    name: 'Japanese Yen',
    symbolPosition: 'prefix',
    decimalDigits: 0,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'CHF',
    symbol: 'CHF ',
    name: 'Swiss Franc',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: "'",
    decimalSeparator: '.',
  },
  {
    code: 'INR',
    symbol: '₹',
    name: 'Indian Rupee',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'BRL',
    symbol: 'R$',
    name: 'Brazilian Real',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: '.',
    decimalSeparator: ',',
  },
  {
    code: 'MXN',
    symbol: 'Mex$',
    name: 'Mexican Peso',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'NZD',
    symbol: 'NZ$',
    name: 'New Zealand Dollar',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'SGD',
    symbol: 'S$',
    name: 'Singapore Dollar',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'HKD',
    symbol: 'HK$',
    name: 'Hong Kong Dollar',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ',',
    decimalSeparator: '.',
  },
  {
    code: 'SEK',
    symbol: ' kr',
    name: 'Swedish Krona',
    symbolPosition: 'suffix',
    decimalDigits: 2,
    thousandSeparator: ' ',
    decimalSeparator: ',',
  },
  {
    code: 'NOK',
    symbol: ' kr',
    name: 'Norwegian Krone',
    symbolPosition: 'suffix',
    decimalDigits: 2,
    thousandSeparator: ' ',
    decimalSeparator: ',',
  },
  {
    code: 'DKK',
    symbol: ' kr.',
    name: 'Danish Krone',
    symbolPosition: 'suffix',
    decimalDigits: 2,
    thousandSeparator: '.',
    decimalSeparator: ',',
  },
  {
    code: 'ZAR',
    symbol: 'R ',
    name: 'South African Rand',
    symbolPosition: 'prefix',
    decimalDigits: 2,
    thousandSeparator: ' ',
    decimalSeparator: '.',
  },
];

export type DateFormatOption = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'DD.MM.YYYY';

export const SUPPORTED_DATE_FORMATS: { id: DateFormatOption; label: string; sample: string }[] = [
  { id: 'YYYY-MM-DD', label: 'ISO Standard (YYYY-MM-DD)', sample: '2026-10-19' },
  { id: 'MM/DD/YYYY', label: 'US Standard (MM/DD/YYYY)', sample: '10/19/2026' },
  { id: 'DD/MM/YYYY', label: 'UK & European (DD/MM/YYYY)', sample: '19/10/2026' },
  { id: 'DD.MM.YYYY', label: 'German & Nordic (DD.MM.YYYY)', sample: '19.10.2026' },
];

const CURRENCY_STORAGE_KEY = 'rmoney_currency_code';
const DATE_FORMAT_STORAGE_KEY = 'rmoney_date_format';

export function getCurrencyConfig(): CurrencyInfo {
  const code = localStorage.getItem(CURRENCY_STORAGE_KEY) || 'USD';
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return found || SUPPORTED_CURRENCIES[0];
}

export function setCurrencyConfig(code: string): void {
  localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  window.dispatchEvent(new CustomEvent('rmoney_regional_changed', { detail: { currency: code } }));
}

export function getDateFormat(): DateFormatOption {
  const format = localStorage.getItem(DATE_FORMAT_STORAGE_KEY) as DateFormatOption;
  if (format && SUPPORTED_DATE_FORMATS.some((f) => f.id === format)) {
    return format;
  }
  return 'YYYY-MM-DD';
}

export function setDateFormat(format: DateFormatOption): void {
  localStorage.setItem(DATE_FORMAT_STORAGE_KEY, format);
  window.dispatchEvent(new CustomEvent('rmoney_regional_changed', { detail: { dateFormat: format } }));
}

/**
 * Formats a numeric amount with the currently selected currency.
 */
export function formatCurrency(
  amount: number,
  options?: {
    showSign?: boolean;
    decimals?: number;
    currency?: CurrencyInfo;
    compact?: boolean;
  }
): string {
  const curr = options?.currency || getCurrencyConfig();
  const absAmount = Math.abs(amount);
  const isNegative = amount < 0;
  const isPositive = amount > 0;

  const decimals = options?.decimals !== undefined ? options.decimals : curr.decimalDigits;

  let formattedNumber = '';
  if (options?.compact && absAmount >= 1000000) {
    formattedNumber = (absAmount / 1000000).toFixed(1) + 'M';
  } else if (options?.compact && absAmount >= 10000) {
    formattedNumber = (absAmount / 1000).toFixed(1) + 'k';
  } else {
    const fixed = absAmount.toFixed(decimals);
    const parts = fixed.split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1];

    // Group thousands
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, curr.thousandSeparator);

    formattedNumber = decimalPart ? `${integerPart}${curr.decimalSeparator}${decimalPart}` : integerPart;
  }

  let withSymbol = '';
  if (curr.symbolPosition === 'prefix') {
    withSymbol = `${curr.symbol}${formattedNumber}`;
  } else {
    withSymbol = `${formattedNumber} ${curr.symbol.trim()}`;
  }

  if (isNegative) {
    return options?.showSign ? `-${withSymbol}` : `-${withSymbol}`;
  } else if (isPositive && options?.showSign) {
    return `+${withSymbol}`;
  }

  return withSymbol;
}

/**
 * Converts a Date object to a local YYYY-MM-DD string (avoiding UTC timezone drift).
 */
export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's date (or offset in days) as a local YYYY-MM-DD string.
 */
export function getLocalTodayStr(daysOffset: number = 0): string {
  const d = new Date();
  if (daysOffset !== 0) {
    d.setDate(d.getDate() + daysOffset);
  }
  return toLocalDateStr(d);
}

/**
 * Detects whether a transaction payee represents an internal transfer or opening balance
 * so that internal account movements do not inflate income or spending reports/budgets.
 */
export function isTransferPayee(payee?: string | null): boolean {
  if (!payee) return false;
  const p = payee.trim();
  return (
    p.startsWith('Transfer to ') ||
    p.startsWith('Transfer from ') ||
    p.includes(' (To: ') ||
    p.includes(' (From: ') ||
    p === 'Opening Balance'
  );
}

/**
 * Formats a YYYY-MM-DD string or Date object into the user's chosen date format.
 */
export function formatDate(dateInput: string | Date, customFormat?: DateFormatOption): string {
  let dateStr = '';
  if (dateInput instanceof Date) {
    dateStr = toLocalDateStr(dateInput);
  } else {
    dateStr = String(dateInput || '');
  }

  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;

  const year = parts[0];
  const month = parts[1];
  const day = parts[2].substring(0, 2);

  const format = customFormat || getDateFormat();
  switch (format) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'DD.MM.YYYY':
      return `${day}.${month}.${year}`;
    case 'YYYY-MM-DD':
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Custom React Hook to subscribe components to currency and date format changes.
 */
export function useRegionalSettings() {
  const [currency, setCurrencyState] = useState<CurrencyInfo>(() => getCurrencyConfig());
  const [dateFormat, setDateFormatState] = useState<DateFormatOption>(() => getDateFormat());

  useEffect(() => {
    const handler = () => {
      setCurrencyState(getCurrencyConfig());
      setDateFormatState(getDateFormat());
    };

    window.addEventListener('rmoney_regional_changed', handler);
    return () => window.removeEventListener('rmoney_regional_changed', handler);
  }, []);

  return {
    currency,
    dateFormat,
    formatCurrency: (amount: number, options?: { showSign?: boolean; decimals?: number; compact?: boolean }) =>
      formatCurrency(amount, { currency, ...options }),
    formatDate: (dateInput: string | Date) => formatDate(dateInput, dateFormat),
    setCurrency: (code: string) => setCurrencyConfig(code),
    setDateFormat: (format: DateFormatOption) => setDateFormat(format),
  };
}
