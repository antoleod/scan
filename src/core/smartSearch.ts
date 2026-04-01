import type { ScanRecord } from '../types';
import type { NoteItem } from './notes';

export type SearchKind = 'empty' | 'pi' | 'office' | 'ticket' | 'text';
export type HistorySort = 'recent' | 'most_used' | 'not_used';
export type HistoryDateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

function normalizeText(value: string) {
  return String(value || '').toLowerCase().trim();
}

function compactCode(value: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function looksTicket(value: string) {
  return /^(RITM|REQ|INC|SCTASK)\d+$/i.test(compactCode(value));
}

function looksPi(value: string) {
  const c = compactCode(value);
  return /^0?2?PI\d{3,}$/.test(c) || /^PI\d{3,}$/.test(c);
}

function looksOffice(value: string) {
  const c = compactCode(value);
  if (!c || looksPi(c) || looksTicket(c)) return false;
  return /^[A-Z0-9]{3,}$/.test(c);
}

export function detectSearchKind(query: string): SearchKind {
  const raw = String(query || '').trim();
  if (!raw) return 'empty';
  if (looksPi(raw)) return 'pi';
  if (looksTicket(raw)) return 'ticket';
  if (looksOffice(raw)) return 'office';
  return 'text';
}

export function matchesNoteByQuery(item: NoteItem, query: string): boolean {
  const raw = String(query || '').trim();
  if (!raw) return true;

  const kind = detectSearchKind(raw);
  const text = normalizeText(item.text);
  const compactText = compactCode(item.text);
  const q = normalizeText(raw);
  const compactQ = compactCode(raw);

  if (kind === 'text') {
    return text.includes(q);
  }

  return compactText.includes(compactQ);
}

function matchesDate(record: ScanRecord, dateFilter: HistoryDateFilter, selectedDate: Date | null): boolean {
  const itemDate = new Date(record.date);
  if (selectedDate) {
    return itemDate.toDateString() === selectedDate.toDateString();
  }
  if (dateFilter === 'ALL') return true;

  const now = new Date();
  if (dateFilter === 'TODAY') {
    return itemDate.toDateString() === now.toDateString();
  }
  if (dateFilter === 'WEEK') {
    return itemDate.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000;
  }
  return itemDate.getTime() > now.getTime() - 30 * 24 * 60 * 60 * 1000;
}

function matchesHistoryQuery(record: ScanRecord, query: string, normalizedType: string): boolean {
  const raw = String(query || '').trim();
  if (!raw) return true;

  const kind = detectSearchKind(raw);
  const q = normalizeText(raw);
  const compactQ = compactCode(raw);

  const textHaystack = normalizeText(
    [
      record.codeNormalized,
      record.notes || '',
      record.customLabel || '',
      record.ticketNumber || '',
      record.officeCode || '',
      normalizedType,
    ].join(' ')
  );

  if (kind === 'text') return textHaystack.includes(q);
  if (kind === 'pi') return compactCode(record.codeNormalized).includes(compactQ);
  if (kind === 'office') return compactCode(record.officeCode || record.codeNormalized).includes(compactQ);
  if (kind === 'ticket') return compactCode(record.ticketNumber || record.notes || '').includes(compactQ);
  return true;
}

function sortHistory(items: ScanRecord[], sortBy: HistorySort): ScanRecord[] {
  const copy = [...items];
  if (sortBy === 'recent') {
    return copy.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  if (sortBy === 'not_used') {
    return copy
      .filter((item) => !item.used)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return copy.sort((a, b) => {
    const usedA = a.used ? 1 : 0;
    const usedB = b.used ? 1 : 0;
    if (usedA !== usedB) return usedB - usedA;
    const dateUsedA = a.dateUsed ? new Date(a.dateUsed).getTime() : 0;
    const dateUsedB = b.dateUsed ? new Date(b.dateUsed).getTime() : 0;
    if (dateUsedA !== dateUsedB) return dateUsedB - dateUsedA;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function filterAndSortHistory(params: {
  history: ScanRecord[];
  query: string;
  filterType: string;
  dateFilter: HistoryDateFilter;
  selectedDate: Date | null;
  sortBy: HistorySort;
  visibleScanType: (type: string) => string;
}) {
  const { history, query, filterType, dateFilter, selectedDate, sortBy, visibleScanType } = params;
  const filtered = history.filter((record) => {
    const normalizedType = visibleScanType(record.type);
    const matchesType = filterType === 'ALL' || normalizedType === filterType;
    return (
      matchesType &&
      matchesDate(record, dateFilter, selectedDate) &&
      matchesHistoryQuery(record, query, normalizedType)
    );
  });
  return sortHistory(filtered, sortBy);
}

