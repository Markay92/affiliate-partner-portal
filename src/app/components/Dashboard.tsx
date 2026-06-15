import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  TrendingUp,
  MousePointerClick,
  CheckCircle,
  DollarSign,
  Copy,
  ExternalLink,
  LogOut,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ArrowLeft,
  FileText,
  Search,
  Layers,
  Activity,
  Award,
} from 'lucide-react';
import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import * as Tabs from '@radix-ui/react-tabs';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Profile } from './Profile';

interface DashboardProps {
  userEmail: string;
  accessToken: string;
  onLogout: () => void;
}

interface Link {
  id: number;
  name: string;
  bank: string;
  url: string;
  clicks: number;
  conversions: number;
  commission: number;
  annualFee: number;
  creditLevel: string;
}

interface Payout {
  id: number;
  date: string;
  amount: number;
  card: string;
  issuer?: string;
  status: string;
}

interface Invoice {
  id: string;
  name: string;
  month: string;
  date: string;
  amount: number;
  approvals: number;
  totalEarnings: number;
  status: string;
  sent: boolean;
  sentZelle: boolean;
  zelle: string;
  notes: string;
}

interface TrackingItem {
  id: string;
  cardName: string;
  status: string;
  totalEarnings: number;
  clickDate: string;
  clickTime: string;
  clicks: number;
  applications: number;
  approvals: number;
  deviceType: string;
  state: string;
}

// ── Filter / sort types & helpers ────────────────────────────────────────────

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'lm' | 'custom';
type SortState  = { field: string; dir: 'asc' | 'desc' };

const DATE_LABELS: Record<DateFilter, string> = {
  today: 'Today', week: 'This Week', month: 'This Month',
  lm: 'Last Month', all: 'All Time', custom: 'Custom',
};

/** Decode common HTML entities in card names coming from external APIs */
function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g,   '&')
    .replace(/&reg;/g,   '®')
    .replace(/&trade;/g, '™')
    .replace(/&copy;/g,  '©')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
}

/** Parse date strings without UTC-shift issues for YYYY-MM-DD values */
function parseLocalDate(str: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

// Map of month names (full + abbreviated, lowercased) → month index (0-11).
// Invoice "month" values are freeform strings like "April 25", "Nov 25", "March 26"
// — mixing full and abbreviated names — so we normalize before matching.
const MONTH_NAME_TO_INDEX: Record<string, number> = {};
for (let m = 0; m < 12; m++) {
  const full = new Date(2000, m, 1).toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const abbr = new Date(2000, m, 1).toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  MONTH_NAME_TO_INDEX[full] = m;
  MONTH_NAME_TO_INDEX[abbr] = m;
  MONTH_NAME_TO_INDEX[abbr.replace('.', '')] = m;
}

/** Parse a freeform invoice "month" string like "April 25" / "Nov 25" / "March 2026"
 *  into { monthIndex, year }, or null if it can't be parsed. Handles both 2-digit
 *  and 4-digit years, and both full and abbreviated month names. */
function parseInvoiceMonth(monthStr: string | undefined): { monthIndex: number; year: number } | null {
  if (!monthStr) return null;
  const parts = monthStr.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const [rawMonth, rawYear] = parts;
  const monthIndex = MONTH_NAME_TO_INDEX[rawMonth];
  if (monthIndex === undefined) return null;
  let year = parseInt(rawYear, 10);
  if (isNaN(year)) return null;
  if (year < 100) year += 2000;
  return { monthIndex, year };
}

/** Format a date string as "Mon, Jan 1, 2026" */
function formatDate(str: string | undefined): string {
  if (!str) return '—';
  const d = parseLocalDate(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Format a time string (ISO or HH:MM:SS) as "6:46 PM" */
function formatTime(str: string | undefined): string {
  if (!str) return '';
  const timeStr = str.includes('T') ? str : `1970-01-01T${str}`;
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getDateBounds(filter: DateFilter, customFrom: string, customTo: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (filter) {
    case 'today': return { from: today, to: null };
    case 'week': {
      const daysFromMon = (today.getDay() + 6) % 7;
      return { from: new Date(today.getTime() - daysFromMon * 86400000), to: null };
    }
    case 'month': {
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: null };
    }
    case 'lm': {
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastOfLastMonth  = new Date(today.getFullYear(), today.getMonth(), 0);
      lastOfLastMonth.setHours(23, 59, 59, 999);
      return { from: firstOfLastMonth, to: lastOfLastMonth };
    }
    case 'custom': {
      const to = customTo ? parseLocalDate(customTo) : null;
      if (to) to.setHours(23, 59, 59, 999);
      return { from: customFrom ? parseLocalDate(customFrom) : null, to };
    }
    default: return { from: null, to: null };
  }
}

function inDateRange(
  dateStr: string | undefined,
  filter: DateFilter,
  customFrom: string,
  customTo: string,
): boolean {
  if (filter === 'all') return true;
  if (!dateStr) return false;
  const date = parseLocalDate(dateStr);
  if (isNaN(date.getTime())) return false;
  const { from, to } = getDateBounds(filter, customFrom, customTo);
  if (from && date < from) return false;
  if (to   && date > to)   return false;
  return true;
}

function applySort<T>(items: T[], sort: SortState): T[] {
  return [...items].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sort.field];
    const bVal = (b as Record<string, unknown>)[sort.field];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    let cmp = 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      const aStr = String(aVal);
      const bStr = String(bVal);
      const aDate = parseLocalDate(aStr);
      const bDate = parseLocalDate(bStr);
      if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
        cmp = aDate.getTime() - bDate.getTime();
      } else {
        cmp = aStr.localeCompare(bStr);
      }
    }
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function toggleSort(current: SortState, field: string): SortState {
  return current.field === field
    ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { field, dir: 'asc' };
}

// ── Shared UI sub-components ─────────────────────────────────────────────────

function FilterBar({
  filter, setFilter, customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  filter: DateFilter; setFilter: (f: DateFilter) => void;
  customFrom: string; setCustomFrom: (s: string) => void;
  customTo: string;   setCustomTo: (s: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-400 flex-shrink-0">Period:</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as DateFilter)}
          className="sm:hidden flex-1 min-w-0 text-xs font-medium bg-slate-100 border border-transparent rounded-lg px-2.5 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          {(['today', 'week', 'month', 'lm', 'all', 'custom'] as DateFilter[]).map((f) => (
            <option key={f} value={f}>{DATE_LABELS[f]}</option>
          ))}
        </select>
        <div className="hidden sm:block overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {(['today', 'week', 'month', 'lm', 'all', 'custom'] as DateFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${
                  filter === f
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                }`}>
                {DATE_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {filter === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
        </div>
      )}
    </div>
  );
}

function SortTh({
  label, field, sort, onSort, align = 'left',
}: {
  label: string; field: string; sort: SortState;
  onSort: (f: string) => void; align?: 'left' | 'right';
}) {
  const icon =
    sort.field === field
      ? sort.dir === 'asc'
        ? <ChevronUp className="w-3 h-3 flex-shrink-0" />
        : <ChevronDown className="w-3 h-3 flex-shrink-0" />
      : <ChevronsUpDown className="w-3 h-3 flex-shrink-0 text-slate-300" />;
  return (
    <th
      onClick={() => onSort(field)}
      aria-sort={sort.field === field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`py-3 px-4 text-slate-500 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100/70 hover:text-slate-700 transition-colors duration-150 text-${align}`}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${sort.field === field ? 'text-indigo-600' : ''}`}>
        {label}{icon}
      </span>
    </th>
  );
}

const PAGE_SIZE = 25;

// ── Dashboard component ───────────────────────────────────────────────────────

export function Dashboard({ userEmail, accessToken, onLogout }: DashboardProps) {
  const navigate = useNavigate();

  // Detect manager impersonation: imp_ token + manager session still in storage
  const isImpersonating = accessToken?.startsWith('imp_') &&
    !!sessionStorage.getItem('managerSessionToken');

  const handleBackToAdmin = () => {
    // Clear impersonated affiliate credentials, leave manager session intact
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('userEmail');
    navigate('/manage/dashboard');
  };

  const [copiedId, setCopiedId] = useState<number | null>(null); // kept for masterLink copy (-1)
  const [links, setLinks]       = useState<Link[]>([]);
  const [payouts, setPayouts]   = useState<Payout[]>([]);
  const [tracking, setTracking] = useState<TrackingItem[]>([]);
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [firstName, setFirstName]   = useState('');
  const [masterLink, setMasterLink] = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Activity tab (Airtable API Output)
  const [trackingFilter,       setTrackingFilter]       = useState<DateFilter>('week');
  const [trackingCustomFrom,   setTrackingCustomFrom]   = useState('');
  const [trackingCustomTo,     setTrackingCustomTo]     = useState('');
  const [trackingSort,         setTrackingSort]         = useState<SortState>({ field: 'clickDate', dir: 'desc' });
  const [trackingStatusFilter, setTrackingStatusFilter] = useState('all');

  // Cards tab — sort + filters + search + group
  const [cardsSort,         setCardsSort]         = useState<SortState>({ field: 'name', dir: 'asc' });
  const [cardsIssuerFilter, setCardsIssuerFilter] = useState('all');
  const [cardsPayoutFilter, setCardsPayoutFilter] = useState('all');
  const [cardsSearch,       setCardsSearch]       = useState('');
  const [cardsGroupBy,      setCardsGroupBy]      = useState(false);
  const [cardsCollapsed,    setCardsCollapsed]    = useState<Set<string>>(new Set());

  // Pagination
  const [cardsVisible,    setCardsVisible]    = useState(PAGE_SIZE);
  const [activityVisible, setActivityVisible] = useState(PAGE_SIZE);
  const [invoicesVisible, setInvoicesVisible] = useState(PAGE_SIZE);

  // Stats grid comparison period
  type StatPeriod = 'today' | 'week' | 'month' | 'lm' | 'year' | 'custom';
  const [statPeriod, setStatPeriod] = useState<StatPeriod>('month');
  const [statCustomFrom, setStatCustomFrom] = useState('');
  const [statCustomTo,   setStatCustomTo]   = useState('');

  // Summary panel visibility — persisted in localStorage
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('dash-visible-panels');
      return saved ? new Set(JSON.parse(saved)) : new Set(['stats', 'charts', 'topCards']);
    } catch { return new Set(['stats', 'charts', 'topCards']); }
  });
  const [insightsTab, setInsightsTab] = useState<'charts' | 'topCards'>('charts');
  const togglePanel = (key: string) => setVisiblePanels(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem('dash-visible-panels', JSON.stringify([...next])); } catch {}
    return next;
  });
  const STAT_PERIOD_LABELS: Record<StatPeriod, string> = {
    today:  'Today vs yesterday',
    week:   'This week vs last week',
    month:  'This month vs last month',
    lm:     'Last month vs month before',
    year:   'This year vs last year',
    custom: 'Custom range',
  };

  // Invoices tab — which rows are expanded to reveal their underlying cards
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

  // ── Derived display data ────────────────────────────────────────────────────
  const displayTracking = applySort(
    tracking.filter(t =>
      inDateRange(t.clickDate, trackingFilter, trackingCustomFrom, trackingCustomTo) &&
      (trackingStatusFilter === 'all' || t.status === trackingStatusFilter)
    ),
    trackingSort,
  );

  // Resolve every card-activity record (clicks/applications/approvals) that
  // falls within a given invoice's month + year — the items behind that payout.
  const getInvoiceItems = (inv: Invoice): TrackingItem[] => {
    if (!inv) return [];
    const target = parseInvoiceMonth(inv.month) || (inv.date ? (() => {
      const d = parseLocalDate(inv.date);
      return isNaN(d.getTime()) ? null : { monthIndex: d.getMonth(), year: d.getFullYear() };
    })() : null);
    if (!target) return [];
    return tracking
      .filter(t => {
        const d = parseLocalDate(t.clickDate);
        if (isNaN(d.getTime())) return false;
        return d.getMonth() === target.monthIndex && d.getFullYear() === target.year;
      })
      .sort((a, b) => parseLocalDate(b.clickDate).getTime() - parseLocalDate(a.clickDate).getTime());
  };

  // Summary: cards ranked by number of approvals (all-time), for the "Most Approved Cards" card
  const mostApprovedCards = (() => {
    const byCard: Record<string, { name: string; approvals: number; earnings: number }> = {};
    tracking.forEach(t => {
      if (t.status !== 'approval') return;
      const key = decodeHtml(t.cardName || 'Unknown');
      if (!byCard[key]) byCard[key] = { name: key, approvals: 0, earnings: 0 };
      byCard[key].approvals += 1;
      byCard[key].earnings  += t.totalEarnings || 0;
    });
    return Object.values(byCard).sort((a, b) => b.approvals - a.approvals || b.earnings - a.earnings).slice(0, 5);
  })();

  // Cards tab: join links (URL + stats) with payouts (issuer + CPA amount) by normalised name
  const _norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const allCards = links.map(link => {
    const cpa = payouts.find(p => _norm(p.card) === _norm(link.name));
    return {
      id:       link.id,
      name:     decodeHtml(link.name),
      issuer:   cpa?.issuer || link.bank || '',
      cpa:      cpa?.amount ?? 0,
      rateDate: cpa?.date   ?? '',
      clicks:       link.clicks,
      conversions:  link.conversions,
      url:      link.url,
    };
  });
  const cardIssuers = Array.from(new Set(allCards.map(c => c.issuer).filter(Boolean))).sort() as string[];
  const displayCards = applySort(
    allCards.filter(c => {
      if (cardsSearch && !c.name.toLowerCase().includes(cardsSearch.toLowerCase()) &&
          !(c.issuer || '').toLowerCase().includes(cardsSearch.toLowerCase())) return false;
      if (cardsIssuerFilter !== 'all' && c.issuer !== cardsIssuerFilter) return false;
      if (cardsPayoutFilter !== 'all') {
        const amt = c.cpa;
        if (cardsPayoutFilter === 'zero'    && amt !== 0)                 return false;
        if (cardsPayoutFilter === 'lt50'    && !(amt > 0 && amt < 50))   return false;
        if (cardsPayoutFilter === '50-200'  && !(amt >= 50 && amt < 200)) return false;
        if (cardsPayoutFilter === '200plus' && !(amt >= 200))             return false;
      }
      return true;
    }),
    cardsSort,
  );

  // ── Data fetching ───────────────────────────────────────────────────────────
  const buildHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken?.startsWith('imp_')) {
      // Supabase infrastructure requires a valid JWT in Authorization even for
      // impersonated sessions — send the anon key to pass infrastructure auth,
      // then the impersonation token for app-level user identification.
      headers['Authorization'] = `Bearer ${publicAnonKey}`;
      headers['X-Impersonation-Token'] = accessToken;
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  };

  const fetchData = async () => {
    setError('');
    try {
      const headers = buildHeaders();
      const [linksRes, payoutsRes, trackingRes, invoicesRes, userRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/links`,    { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/payouts`,  { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/tracking`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/invoices`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/user`,     { headers }),
      ]);

      if (linksRes.status === 401) { onLogout(); return; }

      if (!linksRes.ok) {
        const err = await linksRes.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${linksRes.status}) — try logging out and back in.`);
      }

      const [linksData, payoutsData, trackingData, invoicesData, userData] = await Promise.all([
        linksRes.json(), payoutsRes.json(), trackingRes.json(),
        invoicesRes.json().catch(() => ({})),
        userRes.json().catch(() => ({})),
      ]);

      setLinks(linksData.links         || []);
      if (linksData.masterLink) setMasterLink(linksData.masterLink);
      setTracking(trackingData.tracking || []);
      setPayouts(payoutsData.payouts    || []);
      setInvoices(invoicesData.invoices || []);

      const name = userData.user?.name || '';
      setFirstName(name.split(' ')[0] || '');

      // Surface Airtable errors so they're visible rather than silently empty
      if (payoutsData.error) {
        setError(`CPA rates: ${payoutsData.error}`);
      }
    } catch (err: unknown) {
      setError(`Failed to load data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Period helpers ────────────────────────────────────────────────────────
  const _now = new Date();
  const _today = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());

  const _getDayOffset = (d: Date): number =>
    Math.floor((_today.getTime() - d.getTime()) / 86_400_000);

  const _inRange = (dateStr: string, startDaysAgo: number, endDaysAgo: number) => {
    if (!dateStr) return false;
    const offset = _getDayOffset(parseLocalDate(dateStr));
    return offset >= endDaysAgo && offset < startDaysAgo;
  };

  const _inMonth = (dateStr: string, m: number, y: number) => {
    if (!dateStr) return false;
    const d = parseLocalDate(dateStr);
    return d.getMonth() === m && d.getFullYear() === y;
  };

  // _thisT = records in the selected period (drives both the card numbers AND the % badge)
  // _lastT = records in the prior period (drives the % badge comparison)
  let _thisT: TrackingItem[], _lastT: TrackingItem[], _periodLabel: string;

  if (statPeriod === 'today') {
    _thisT = tracking.filter(t => _inRange(t.clickDate, 1, 0));
    _lastT = tracking.filter(t => _inRange(t.clickDate, 2, 1));
    _periodLabel = 'vs yesterday';
  } else if (statPeriod === 'week') {
    const daysFromMon = (_today.getDay() + 6) % 7; // Mon=0 … Sun=6
    const weekStart   = new Date(_today.getTime() - daysFromMon * 86_400_000);
    const prevWkStart = new Date(weekStart.getTime() - 7 * 86_400_000);
    _thisT = tracking.filter(t => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= weekStart && d <= _now; });
    _lastT = tracking.filter(t => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= prevWkStart && d < weekStart; });
    _periodLabel = 'vs last week';
  } else if (statPeriod === 'month') {
    const _thisM = _now.getMonth(), _thisY = _now.getFullYear();
    const _lastM = _thisM === 0 ? 11 : _thisM - 1;
    const _lastY  = _thisM === 0 ? _thisY - 1 : _thisY;
    _thisT = tracking.filter(t => _inMonth(t.clickDate, _thisM, _thisY));
    _lastT = tracking.filter(t => _inMonth(t.clickDate, _lastM, _lastY));
    _periodLabel = 'vs last month';
  } else if (statPeriod === 'lm') {
    const _lastM  = _now.getMonth() === 0 ? 11 : _now.getMonth() - 1;
    const _lastY  = _now.getMonth() === 0 ? _now.getFullYear() - 1 : _now.getFullYear();
    const _prevM  = _lastM === 0 ? 11 : _lastM - 1;
    const _prevY  = _lastM === 0 ? _lastY - 1 : _lastY;
    _thisT = tracking.filter(t => _inMonth(t.clickDate, _lastM, _lastY));
    _lastT = tracking.filter(t => _inMonth(t.clickDate, _prevM, _prevY));
    _periodLabel = 'vs month before';
  } else if (statPeriod === 'year') {
    const thisYrStart = new Date(_now.getFullYear(), 0, 1);
    const prevYrStart = new Date(_now.getFullYear() - 1, 0, 1);
    _thisT = tracking.filter(t => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= thisYrStart; });
    _lastT = tracking.filter(t => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= prevYrStart && d < thisYrStart; });
    _periodLabel = 'vs last year';
  } else {
    // custom
    const fromD = statCustomFrom ? parseLocalDate(statCustomFrom) : null;
    const toD   = statCustomTo   ? (() => { const d = parseLocalDate(statCustomTo); d.setDate(d.getDate() + 1); return d; })() : null;
    _thisT = tracking.filter(t => {
      if (!t.clickDate) return false;
      const d = parseLocalDate(t.clickDate);
      if (fromD && d < fromD) return false;
      if (toD   && d >= toD)  return false;
      return true;
    });
    _lastT = [];
    _periodLabel = statCustomFrom || statCustomTo ? `${statCustomFrom || '…'} → ${statCustomTo || '…'}` : 'select dates below';
  }

  // ── Stat card numbers — computed from the selected period (_thisT) ─────────
  // This means clicking "Month" shows this month's totals, "7D" shows last 7 days, etc.
  const totalClicks       = _thisT.reduce((s, t) => s + (t.clicks       || 0), 0);
  const totalConversions  = _thisT.reduce((s, t) => s + (t.approvals    || 0), 0);
  const totalApplications = _thisT.reduce((s, t) => s + (t.applications || 0), 0);
  const totalCommissions  = _thisT.reduce((s, t) => s + (t.totalEarnings|| 0), 0);
  const totalPayouts      = payouts.reduce((s, p) => s + p.amount, 0);
  const avgEPC            = totalClicks > 0 ? totalCommissions / totalClicks : 0;

  const _calcPct = (cur: number, prev: number): number | null =>
    prev === 0 ? (cur > 0 ? 100 : null) : Math.round(((cur - prev) / prev) * 100);

  const clicksPct        = _calcPct(
    _thisT.reduce((s, t) => s + t.clicks, 0),
    _lastT.reduce((s, t) => s + t.clicks, 0),
  );
  const approvalsPct     = _calcPct(
    _thisT.reduce((s, t) => s + t.approvals, 0),
    _lastT.reduce((s, t) => s + t.approvals, 0),
  );
  const applicationsPct  = _calcPct(
    _thisT.reduce((s, t) => s + (t.applications || 0), 0),
    _lastT.reduce((s, t) => s + (t.applications || 0), 0),
  );
  const commissionsPct   = _calcPct(
    _thisT.reduce((s, t) => s + t.totalEarnings, 0),
    _lastT.reduce((s, t) => s + t.totalEarnings, 0),
  );

  /** Coloured percentage badge shown under each stat card */
  const PctBadge = ({ pct, compact = false }: { pct: number | null; compact?: boolean }) => {
    if (pct === null) {
      return compact
        ? <span className="text-slate-300 text-xs">—</span>
        : <span className="text-slate-400 text-xs">No prior-period data</span>;
    }
    if (pct === 0) {
      return compact
        ? <span className="text-slate-400 text-xs font-medium">No change</span>
        : <span className="text-slate-400 text-xs flex items-center gap-1">— No change <span className="font-normal">{_periodLabel}</span></span>;
    }
    const up = pct > 0;
    return (
      <div className={`flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
        <TrendingUp className={`w-3 h-3 ${!up ? 'rotate-180' : ''}`} />
        <span>{up ? '+' : ''}{pct}%{!compact ? ` ${_periodLabel}` : ''}</span>
      </div>
    );
  };

  const copyToClipboard = async (text: string, id: number) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-999999px;top:-999999px';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
    } catch {}
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-indigo-100">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      {/* Header */}
      <header className="bg-slate-900/95 backdrop-blur-md sticky top-0 z-10 border-b border-slate-800/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/5 rounded-xl ring-1 ring-white/10">
                <svg width="32" height="30" viewBox="0 0 39 37" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0_logo)">
                    <mask id="mask0_logo" style={{maskType:'luminance'}} maskUnits="userSpaceOnUse" x="0" y="0" width="38" height="37">
                      <path d="M37.9056 0H0.00134277V36.2562H37.9056V0Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask0_logo)">
                      <path d="M17.6325 28.7049C17.6325 27.4888 17.6339 26.2735 17.6306 25.0575C17.6306 24.9135 17.6098 24.7681 17.5877 24.6248C17.5561 24.4184 17.4167 24.2985 17.2145 24.2947C16.9954 24.2908 16.8516 24.4228 16.8153 24.6368C16.7939 24.7605 16.8004 24.8892 16.8023 25.0156C16.8361 27.4471 16.86 29.8777 16.9152 32.3084C16.9249 32.7388 16.7589 33.0015 16.4155 33.2193C15.5412 33.7745 14.5827 34.1421 13.6009 34.4582C12.457 34.8269 11.3106 35.1841 10.1006 35.2964C9.1318 35.386 8.2362 34.9867 7.86482 34.2759C7.60237 33.7733 7.62117 33.289 7.90504 32.7998C8.49669 31.7798 9.38199 31.0157 10.2355 30.2249C10.5491 29.9343 10.8602 29.6422 11.1363 29.3167C11.5011 28.887 11.4959 28.3559 11.5374 27.8455C11.6119 26.9203 11.6573 25.9931 11.7189 25.0663C11.7552 24.5258 11.7377 23.9907 11.5731 23.4683C11.4396 23.0451 11.1505 22.7754 10.728 22.6185C10.0877 22.3799 9.42665 22.3463 8.75463 22.3933C7.93804 22.4503 7.12153 22.5131 6.30496 22.5697C5.16566 22.6484 4.02636 22.7207 2.88706 22.8025C2.42046 22.8361 1.95775 22.8407 1.51577 22.6706C1.09905 22.5107 0.848902 22.2193 0.838535 21.7611C0.817147 20.8199 0.91306 19.8825 0.938341 18.9432C0.953896 18.3841 1.02259 17.8268 1.04203 17.2683C1.09582 15.7172 1.19886 14.1693 1.31617 12.622C1.43865 11.0024 1.55853 9.38268 1.70824 7.76561C1.77303 7.06307 1.80804 6.3573 1.94867 5.66108C2.23382 4.25024 3.05362 3.34013 4.4852 2.96568C5.73077 2.6401 7.00162 2.52332 8.28416 2.47001C9.4604 2.42116 10.6379 2.4478 11.8129 2.3964C13.2108 2.33547 14.6055 2.20029 16.002 2.10699C16.8516 2.04988 17.7031 2.02449 18.5521 1.96039C19.9473 1.85567 21.3472 1.81569 22.7392 1.66083C24.0321 1.51739 25.3276 1.40378 26.6205 1.26098C27.8033 1.13025 28.9912 1.2464 30.1759 1.14929C31.4195 1.0471 32.6688 1.00268 33.9066 0.833222C35.4666 0.619345 36.67 1.37903 37.0141 2.83558C37.1191 3.28048 37.0795 3.74314 37.0343 4.19375C36.9001 5.51575 36.7542 6.83646 36.5949 8.15531C36.4328 9.49376 36.1685 10.8171 35.939 12.1454C35.6883 13.5956 35.4375 15.0458 35.1736 16.4934C35.0176 17.3527 34.8373 18.2077 34.6675 19.0644C34.4724 20.0501 33.8076 20.5889 32.8699 20.8529C31.9859 21.1017 31.0714 21.1645 30.1603 21.2357C28.807 21.3411 27.4532 21.4381 26.1002 21.5389C25.4463 21.5878 24.7917 21.6234 24.1508 21.7865C23.1074 22.0524 22.7691 22.6584 22.7489 23.5463C22.7147 25.0683 22.7379 26.5921 22.7399 28.1146C22.7405 28.727 23.0548 29.1968 23.4663 29.6213C24.0776 30.2523 24.7988 30.7554 25.4785 31.3082C25.7022 31.4898 25.9161 31.6866 26.1111 31.8966C26.7747 32.6118 26.8687 33.4293 26.5369 34.3159C26.4313 34.5977 26.2045 34.7487 25.9369 34.856C25.43 35.059 24.8953 35.1226 24.3562 35.127C22.43 35.1434 20.5979 34.7227 18.8651 33.9122C18.3486 33.6704 17.8743 33.3443 17.7395 32.7268C17.7141 32.6106 17.7084 32.4971 17.7084 32.3821C17.707 31.1559 17.7077 29.9299 17.7077 28.703C17.6831 28.703 17.6584 28.703 17.6339 28.703L17.6325 28.7049ZM18.6416 17.514C18.7906 17.495 18.9396 17.4703 19.0894 17.4575C20.552 17.3369 21.9984 16.1501 22.3907 14.752C22.4521 14.5323 22.3809 14.3712 22.1812 14.2842C21.9836 14.1985 21.7962 14.241 21.6751 14.4333C21.6252 14.5126 21.5974 14.6053 21.5611 14.6923C21.3575 15.1778 21.0627 15.6012 20.6642 15.9533C19.9248 16.6065 19.0452 16.7867 18.0856 16.6674C16.7602 16.503 15.7395 15.933 15.2917 14.616C15.1814 14.293 14.9696 14.1636 14.7155 14.2733C14.4335 14.3953 14.4523 14.632 14.5295 14.8687C14.7266 15.4742 15.059 15.9965 15.5418 16.4244C16.4225 17.2049 17.4951 17.455 18.6416 17.514ZM18.3623 13.7149C18.7789 13.7251 19.1756 13.6438 19.5502 13.4642C20.0854 13.2072 20.3913 12.7147 20.3524 12.1689C20.3077 11.5482 19.974 11.1204 19.357 10.9523C18.6428 10.7574 17.9495 10.8145 17.3072 11.2055C16.4407 11.7329 16.4186 12.8657 17.2606 13.4223C17.5937 13.6425 17.9636 13.7314 18.3623 13.7149ZM12.4538 11.4834C12.8912 11.4879 13.2302 11.1629 13.2341 10.7339C13.238 10.3207 12.8822 9.95521 12.4719 9.95009C12.0559 9.94503 11.6936 10.2966 11.6839 10.7161C11.6742 11.1319 12.0222 11.4784 12.4545 11.4834H12.4538ZM25.4229 10.4458C25.4288 10.0161 25.1119 9.69181 24.6847 9.68865C24.2809 9.68609 23.9149 10.0383 23.9096 10.435C23.9052 10.8119 24.2577 11.1591 24.6555 11.1699C25.0859 11.182 25.4171 10.8697 25.4222 10.4458H25.4229Z" fill="#50C8FD"/>
                      <path d="M18.3577 12.928C18.0285 12.9438 17.7343 12.8759 17.5379 12.5891C17.394 12.3784 17.4057 12.1766 17.5898 11.9868C17.9487 11.6168 18.8696 11.5039 19.3116 11.7786C19.6428 11.9849 19.6272 12.4857 19.2824 12.7084C19.068 12.8468 18.729 12.9273 18.3577 12.928Z" fill="#50C8FD"/>
                    </g>
                  </g>
                  <defs>
                    <clipPath id="clip0_logo">
                      <rect width="38.4" height="36.3765" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              </div>
              <h1 className="hidden sm:block text-white font-semibold text-lg tracking-tight">Affiliate Portal</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="p-2 hover:bg-white/10 active:scale-95 rounded-lg transition-all duration-150 cursor-pointer"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4 text-slate-400" />
              </button>
              {(firstName || userEmail) && (
                <span className="hidden sm:flex items-center gap-2 text-slate-300 text-sm pl-1 pr-3 py-1 rounded-full bg-white/5 ring-1 ring-white/10">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/90 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                    {(firstName || userEmail).charAt(0).toUpperCase()}
                  </span>
                  {firstName ? `Hi, ${firstName}` : userEmail}
                </span>
              )}
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 rounded-lg transition-all duration-150 text-sm cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-100 px-4 sm:px-6 lg:px-8 py-3 text-red-700 text-sm max-w-7xl mx-auto">
          <span className="font-medium">{error}</span> — try refreshing the page or logging out and back in.
        </div>
      )}

      {/* Floating exit pill for manager impersonation */}
      {isImpersonating && (
        <button
          onClick={handleBackToAdmin}
          title="Exit back to Admin Dashboard"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-700 active:scale-95 transition-all duration-150 text-xs font-semibold cursor-pointer ring-1 ring-white/10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Exit to Admin
        </button>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* ── Compact summary bar — all panels in one card, max 30vh ── */}
        {(() => {
          // Build monthly data for charts (all-time, not period-filtered)
          const monthMap: Record<string, { month: string; clicks: number; approvals: number; applications: number }> = {};
          tracking.forEach(t => {
            if (!t.clickDate) return;
            const d = parseLocalDate(t.clickDate);
            if (isNaN(d.getTime())) return;
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (!monthMap[key]) monthMap[key] = { month: d.toLocaleDateString('en-US', { month:'short', year:'2-digit' }), clicks: 0, approvals: 0, applications: 0 };
            monthMap[key].clicks      += t.clicks       || 0;
            monthMap[key].approvals   += t.approvals    || 0;
            monthMap[key].applications+= t.applications || 0;
          });
          const monthlyData = Object.entries(monthMap).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v);

          const isEmptyPeriod = tracking.length > 0 && totalClicks === 0 && totalCommissions === 0;
          const showCharts   = visiblePanels.has('charts')   && monthlyData.length >= 2;
          const showTopCards = visiblePanels.has('topCards') && mostApprovedCards.length > 0;

          const statRows = [
            { label: 'Clicks',       value: totalClicks.toLocaleString(),                  iconColor: 'text-blue-600',    bgColor: 'bg-blue-50',    Icon: MousePointerClick, sub: null,                                                                                              pct: clicksPct },
            { label: 'Approvals',    value: totalConversions.toLocaleString(),              iconColor: 'text-emerald-600', bgColor: 'bg-emerald-50', Icon: CheckCircle,       sub: totalClicks > 0 && totalConversions > 0 ? `${((totalConversions/totalClicks)*100).toFixed(1)}% conv.` : null,    pct: approvalsPct },
            { label: 'Commissions',  value: `$${Math.round(totalCommissions).toLocaleString()}`, iconColor: 'text-indigo-600', bgColor: 'bg-indigo-50', Icon: DollarSign,   sub: avgEPC > 0 ? `EPC $${avgEPC.toFixed(2)}` : null,                                                  pct: commissionsPct },
            { label: 'Applications', value: totalApplications.toLocaleString(),             iconColor: 'text-orange-500',  bgColor: 'bg-orange-50',  Icon: Activity,          sub: totalClicks > 0 && totalApplications > 0 ? `${((totalApplications/totalClicks)*100).toFixed(1)}% c→a` : null,    pct: applicationsPct },
          ];

          return (
            <div className="mb-6 sm:mb-8">
              {/* ── Period header ── */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Performance Overview</h2>
                  <p className="text-xs sm:text-sm text-slate-500">{STAT_PERIOD_LABELS[statPeriod]}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Mobile: dropdown */}
                  <select
                    value={statPeriod}
                    onChange={e => setStatPeriod(e.target.value as StatPeriod)}
                    className="sm:hidden text-xs font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    {([
                      { value: 'today',  label: 'Today' },
                      { value: 'week',   label: 'This Week' },
                      { value: 'month',  label: 'This Month' },
                      { value: 'lm',     label: 'Last Month' },
                      { value: 'year',   label: 'This Year' },
                      { value: 'custom', label: 'Custom' },
                    ] as { value: StatPeriod; label: string }[]).map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {/* Desktop: pill row */}
                  <div className="hidden sm:flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-1 text-xs font-medium shadow-sm">
                    {([
                      { value: 'today',  label: 'Today' },
                      { value: 'week',   label: 'This Week' },
                      { value: 'month',  label: 'This Month' },
                      { value: 'lm',     label: 'Last Month' },
                      { value: 'year',   label: 'This Year' },
                      { value: 'custom', label: 'Custom' },
                    ] as { value: StatPeriod; label: string }[]).map(({ value, label }) => (
                      <button key={value} onClick={() => setStatPeriod(value)}
                        className={`px-2.5 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                          statPeriod === value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Custom date inputs */}
                  {statPeriod === 'custom' && (
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={statCustomFrom} onChange={e => setStatCustomFrom(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                      <span className="text-xs text-slate-400">→</span>
                      <input type="date" value={statCustomTo} onChange={e => setStatCustomTo(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                    </div>
                  )}
                </div>
              </div>

              {isEmptyPeriod && (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <RefreshCw className="w-3 h-3" /> No activity recorded for {STAT_PERIOD_LABELS[statPeriod].split(' vs ')[0].toLowerCase()}
                </div>
              )}

              {/* ── Stat strip — compact, single row, the primary numbers ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
                {statRows.map(({ label, value, iconColor, bgColor, Icon, sub, pct }) => (
                  <div key={label} className="bg-white rounded-xl ring-1 ring-slate-900/5 shadow-sm px-3 py-2.5 flex items-center gap-2.5 hover:shadow-md transition-shadow duration-200 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bgColor} ring-1 ring-inset ${iconColor.replace('text-', 'ring-')}/10`}>
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg sm:text-xl font-bold text-slate-900 leading-none tracking-tight tabular-nums">{value}</span>
                        {pct !== undefined && <PctBadge pct={pct} compact />}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase tracking-wide truncate">
                        {label}{sub ? <span className="text-slate-300 normal-case"> · {sub}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Insights: tabbed chart / top cards ── */}
              {(showCharts || showTopCards) && (
                <div className="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 text-xs font-medium">
                      {showCharts && (
                        <button onClick={() => setInsightsTab('charts')}
                          className={`px-3 py-1.5 rounded-md transition-all duration-150 cursor-pointer ${
                            insightsTab === 'charts' || !showTopCards
                              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}>
                          Monthly Performance
                        </button>
                      )}
                      {showTopCards && (
                        <button onClick={() => setInsightsTab('topCards')}
                          className={`px-3 py-1.5 rounded-md transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                            insightsTab === 'topCards' || !showCharts
                              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}>
                          <Award className="w-3.5 h-3.5 text-emerald-500" /> Top Cards
                        </button>
                      )}
                    </div>
                    {(insightsTab === 'charts' || !showTopCards) && showCharts && (
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#bfdbfe]" />Clicks</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#818cf8]" />Applications</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6366f1]" />Approvals</span>
                      </div>
                    )}
                  </div>

                  {showCharts && (insightsTab === 'charts' || !showTopCards) && (
                    <div className="h-48 sm:h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="month" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }} />
                          <Line dataKey="clicks"       name="Clicks"       stroke="#bfdbfe" strokeWidth={2} dot={false} />
                          <Line dataKey="applications" name="Applications" stroke="#818cf8" strokeWidth={2} dot={false} />
                          <Line dataKey="approvals"    name="Approvals"    stroke="#6366f1" strokeWidth={2.5} dot={{ r:3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {showTopCards && (insightsTab === 'topCards' || !showCharts) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1">
                      {mostApprovedCards.map((c, idx) => (
                        <div key={c.name} className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-slate-50 transition-colors duration-150 min-w-0">
                          <span className={`text-xs font-bold flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
                            idx === 0 ? 'bg-amber-50 text-amber-500' : idx === 1 ? 'bg-slate-100 text-slate-400' : idx === 2 ? 'bg-orange-50 text-orange-500' : 'bg-slate-50 text-slate-300'
                          }`}>{idx+1}</span>
                          <span className="text-sm text-slate-700 truncate flex-1 min-w-0 font-medium">{decodeHtml(c.name)}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0 font-semibold tabular-nums">{c.approvals}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Visibility toggles for the insights panel ── */}
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[11px] font-semibold text-slate-400 mr-0.5 uppercase tracking-wider">Show:</span>
                {(['charts', 'topCards'] as const).map(key => {
                  const labels = { charts: 'Monthly Chart', topCards: 'Top Cards' };
                  return (
                    <button key={key} onClick={() => togglePanel(key)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 border cursor-pointer ${
                        visiblePanels.has(key)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}>
                      {labels[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Tabs */}
        <Tabs.Root defaultValue="cards" className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5">
          <Tabs.List className="flex border-b border-slate-100 overflow-x-auto px-2 pt-1">
            {['cards', 'activity', 'invoices', 'profile'].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="relative px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:font-semibold hover:text-slate-800 transition-colors duration-150 whitespace-nowrap capitalize -mb-px cursor-pointer"
              >
                {tab === 'invoices'
                  ? <span className="flex items-center gap-1.5">Invoices{invoices.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{invoices.length}</span>}</span>
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* ── Cards Tab ── */}
          <Tabs.Content value="cards">
          <div className="p-4 sm:p-6 pb-0">

            {/* ── Master affiliate link ── */}
            {masterLink ? (
              <div className="mb-6 p-5 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
                <p className="relative text-xs font-semibold text-indigo-100 uppercase tracking-wider mb-3">Your Affiliate Link</p>
                <div className="relative flex items-center gap-2">
                  <code className="flex-1 text-sm text-indigo-900 bg-white px-4 py-3 rounded-xl truncate font-mono shadow-sm">
                    {masterLink}
                  </code>
                  <button
                    onClick={() => copyToClipboard(masterLink, -1)}
                    className="flex-shrink-0 p-3 bg-white/15 ring-1 ring-white/20 rounded-xl hover:bg-white/25 active:scale-95 transition-all duration-150 cursor-pointer"
                    title="Copy link"
                  >
                    {copiedId === -1
                      ? <CheckCircle className="w-5 h-5 text-emerald-300" />
                      : <Copy className="w-5 h-5 text-white" />}
                  </button>
                  <a href={masterLink} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 p-3 bg-white/15 ring-1 ring-white/20 rounded-xl hover:bg-white/25 active:scale-95 transition-all duration-150 cursor-pointer"
                    title="Open link">
                    <ExternalLink className="w-5 h-5 text-white" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-slate-50 rounded-2xl ring-1 ring-slate-200/60 text-sm text-slate-500">
                No affiliate link configured yet — contact your manager to set up your link.
              </div>
            )}
          </div>

            {/* ── Sticky filter toolbar ── */}
            <div className="sticky top-16 z-10 bg-white border-b border-slate-100 px-4 sm:px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type="text" placeholder="Search cards or issuer…" value={cardsSearch}
                  onChange={e => { setCardsSearch(e.target.value); setCardsVisible(PAGE_SIZE); }}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white text-slate-700 transition-shadow" />
              </div>
              {/* Issuer */}
              <select value={cardsIssuerFilter} onChange={e => { setCardsIssuerFilter(e.target.value); setCardsVisible(PAGE_SIZE); }}
                className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer">
                <option value="all">All issuers</option>
                {cardIssuers.map(issuer => <option key={issuer} value={issuer}>{issuer}</option>)}
              </select>
              {/* CPA range */}
              <div className="overflow-x-auto">
                <div className="flex items-center gap-1.5 min-w-max">
                  {([
                    { value: 'all', label: 'All CPA' }, { value: 'zero', label: '$0' },
                    { value: 'lt50', label: '<$50' }, { value: '50-200', label: '$50–$200' },
                    { value: '200plus', label: '$200+' },
                  ]).map(({ value, label }) => (
                    <button key={value} onClick={() => { setCardsPayoutFilter(value); setCardsVisible(PAGE_SIZE); }}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${
                        cardsPayoutFilter === value
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
              {/* Group by issuer */}
              <div className="flex items-center gap-2 sm:ml-auto">
                <button onClick={() => { setCardsGroupBy(g => !g); setCardsCollapsed(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all duration-150 cursor-pointer ${
                    cardsGroupBy ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'text-slate-600 bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}>
                  <Layers className="w-3.5 h-3.5" />
                  Group by Issuer
                </button>
                {cardsGroupBy && displayCards.length > 0 && (() => {
                  const allIssuers = Array.from(new Set(displayCards.map(c => c.issuer || 'Other')));
                  const allCollapsed = allIssuers.every(i => cardsCollapsed.has(i));
                  return (
                    <button onClick={() => setCardsCollapsed(allCollapsed ? new Set() : new Set(allIssuers))}
                      className="text-xs text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer">
                      {allCollapsed ? 'Expand All' : 'Collapse All'}
                    </button>
                  );
                })()}
                {(cardsSearch || cardsIssuerFilter !== 'all' || cardsPayoutFilter !== 'all') && (
                  <button onClick={() => { setCardsSearch(''); setCardsIssuerFilter('all'); setCardsPayoutFilter('all'); setCardsVisible(PAGE_SIZE); }}
                    className="text-xs text-indigo-600 hover:underline cursor-pointer">Clear</button>
                )}
              </div>
            </div>
            </div>

          <div className="p-4 sm:p-6 pt-3">
            {displayCards.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-slate-100">
                  <CreditCard className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm text-slate-500 font-medium">{links.length === 0 ? 'No cards loaded yet — try refreshing.' : 'No cards match the filters.'}</p>
              </div>
            ) : (() => {
              const CardRow = ({ card }: { card: any }) => (
                <tr key={card.id} className="border-b border-slate-50 hover:bg-indigo-50/40 transition-colors duration-150">
                  <td className="py-3.5 px-4 font-medium text-sm text-slate-900">{card.name}</td>
                  {!cardsGroupBy && <td className="py-3.5 px-4 text-sm text-slate-500">{card.issuer || '—'}</td>}
                  <td className="py-3.5 px-4 text-right text-sm font-semibold text-slate-900 tabular-nums">
                    {card.cpa > 0 ? `$${card.cpa.toLocaleString()}` : <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="py-3.5 px-4 text-right text-sm text-slate-600 tabular-nums">{card.clicks}</td>
                  <td className="py-3.5 px-4 text-right text-sm text-slate-600 tabular-nums">{card.conversions}</td>
                </tr>
              );
              const colCount = cardsGroupBy ? 4 : 5;
              const pagedCards = displayCards.slice(0, cardsVisible);
              return (
                <>
                  <p className="text-xs text-slate-400 mb-3">
                    Showing {pagedCards.length} of {displayCards.length} cards
                  </p>
                  <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">
                    <table className="w-full">
                      <thead className="bg-slate-50/80">
                        <tr className="border-b border-slate-100">
                          <SortTh label="Card"      field="name"        sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} />
                          {!cardsGroupBy && <SortTh label="Issuer" field="issuer" sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} />}
                          <SortTh label="Your CPA"  field="cpa"         sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                          <SortTh label="Clicks"    field="clicks"      sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                          <SortTh label="Approvals" field="conversions" sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                        </tr>
                      </thead>
                      <tbody>
                        {cardsGroupBy ? (
                          (() => {
                            const groups: Record<string, any[]> = {};
                            pagedCards.forEach(c => { const k = c.issuer || 'Other'; if (!groups[k]) groups[k] = []; groups[k].push(c); });
                            return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([issuer, cards]) => {
                              const isCollapsed = cardsCollapsed.has(issuer);
                              const toggle = () => setCardsCollapsed(prev => { const next = new Set(prev); next.has(issuer) ? next.delete(issuer) : next.add(issuer); return next; });
                              return (
                                <React.Fragment key={`g-${issuer}`}>
                                  <tr onClick={toggle} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors duration-150 select-none">
                                    <td colSpan={colCount} className="py-2.5 px-4">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{issuer}</span>
                                        <span className="text-xs font-normal text-slate-400 ml-0.5">({cards.length})</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {!isCollapsed && cards.map(card => <CardRow key={card.id} card={card} />)}
                                </React.Fragment>
                              );
                            });
                          })()
                        ) : (
                          pagedCards.map(card => <CardRow key={card.id} card={card} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                  {cardsVisible < displayCards.length && (
                    <div className="pt-4 text-center">
                      <button
                        onClick={() => setCardsVisible(n => n + PAGE_SIZE)}
                        className="px-4 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        Show {Math.min(PAGE_SIZE, displayCards.length - cardsVisible)} more
                        <span className="text-slate-400 ml-1">({displayCards.length - cardsVisible} remaining)</span>
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          </Tabs.Content>

          {/* ── Activity Tab ── */}
          <Tabs.Content value="activity">
            {/* Sticky controls */}
            <div className="sticky top-16 z-10 bg-white border-b border-slate-100 px-4 sm:px-6 py-3">
            <div className="flex items-center justify-between mb-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900 tabular-nums">{displayTracking.length}</span>
                {trackingFilter !== 'all' ? <span className="text-slate-400"> of {tracking.length}</span> : ''} activity records
              </p>
              <button
                onClick={fetchData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 active:scale-95 transition-all duration-150 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <FilterBar
                filter={trackingFilter}
                setFilter={v => { setTrackingFilter(v); setActivityVisible(PAGE_SIZE); }}
                customFrom={trackingCustomFrom}
                setCustomFrom={v => { setTrackingCustomFrom(v); setActivityVisible(PAGE_SIZE); }}
                customTo={trackingCustomTo}
                setCustomTo={v => { setTrackingCustomTo(v); setActivityVisible(PAGE_SIZE); }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-400 mr-1">Status:</span>
              {[
                { value: 'all',         label: 'All' },
                { value: 'click',       label: 'Click' },
                { value: 'application', label: 'Application' },
                { value: 'approval',    label: 'Approval' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { setTrackingStatusFilter(value); setActivityVisible(PAGE_SIZE); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                    trackingStatusFilter === value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            </div>

          <div className="p-4 sm:p-6 pt-3">
            {displayTracking.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-slate-100">
                  <TrendingUp className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-slate-500 text-sm font-medium mb-4">
                  {tracking.length === 0
                    ? 'No tracking activity found'
                    : 'No activity matches the selected date range.'}
                </p>
                {tracking.length === 0 && (
                  <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all duration-150 text-sm font-medium shadow-sm cursor-pointer"
                  >
                    Refresh Data
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">
                  Showing {Math.min(activityVisible, displayTracking.length)} of {displayTracking.length} records
                </p>
                <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">
                  <table className="w-full">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        <SortTh label="Date / Time"  field="clickDate"     sort={trackingSort} onSort={(f) => setTrackingSort(toggleSort(trackingSort, f))} />
                        <SortTh label="Card"         field="cardName"      sort={trackingSort} onSort={(f) => setTrackingSort(toggleSort(trackingSort, f))} />
                        <SortTh label="Status"       field="status"        sort={trackingSort} onSort={(f) => setTrackingSort(toggleSort(trackingSort, f))} />
                        <SortTh label="Earnings"     field="totalEarnings" sort={trackingSort} onSort={(f) => setTrackingSort(toggleSort(trackingSort, f))} align="right" />
                        <SortTh label="Device"       field="deviceType"    sort={trackingSort} onSort={(f) => setTrackingSort(toggleSort(trackingSort, f))} />
                        <SortTh label="Location"     field="state"         sort={trackingSort} onSort={(f) => setTrackingSort(toggleSort(trackingSort, f))} />
                      </tr>
                    </thead>
                    <tbody>
                      {displayTracking.slice(0, activityVisible).map((item) => (
                        <tr key={item.id} className="border-b border-slate-50 hover:bg-indigo-50/40 transition-colors duration-150">
                          <td className="py-3.5 px-4 text-sm">
                            <div className="font-medium text-slate-900">{formatDate(item.clickDate)}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{formatTime(item.clickTime)}</div>
                          </td>
                          <td className="py-3.5 px-4 text-sm text-slate-700">{item.cardName}</td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              item.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                              item.status === 'application' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-sm text-right font-semibold text-slate-900 tabular-nums">
                            {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-sm text-slate-500">{item.deviceType || '—'}</td>
                          <td className="py-3.5 px-4 text-sm text-slate-500">{item.state || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activityVisible < displayTracking.length && (
                  <div className="pt-4 text-center">
                    <button
                      onClick={() => setActivityVisible(n => n + PAGE_SIZE)}
                      className="px-4 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      Show {Math.min(PAGE_SIZE, displayTracking.length - activityVisible)} more
                      <span className="text-slate-400 ml-1">({displayTracking.length - activityVisible} remaining)</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          </Tabs.Content>

          {/* ── Invoices Tab ── */}
          <Tabs.Content value="invoices" className="p-4 sm:p-6">
            {invoices.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-slate-100">
                  <FileText className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-slate-500 text-sm font-medium">No invoices found for your account.</p>
              </div>
            ) : (
              <>
              <p className="text-xs text-slate-400 mb-3">
                Showing {Math.min(invoicesVisible, invoices.length)} of {invoices.length} invoices
              </p>
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">
                <table className="w-full">
                  <thead className="bg-slate-50/80">
                    <tr className="border-b border-slate-100">
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider"></th>
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider">Month</th>
                      <th className="py-3 px-4 text-right text-slate-500 text-xs font-semibold uppercase tracking-wider">Amount</th>
                      <th className="py-3 px-4 text-right text-slate-500 text-xs font-semibold uppercase tracking-wider">Approvals</th>
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider">Status</th>
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, invoicesVisible).map(inv => {
                      const isExpanded = expandedInvoices.has(inv.id);
                      const allItems = getInvoiceItems(inv);
                      const approvedItems = allItems.filter(i => i.status === 'approval');
                      const items = isExpanded ? approvedItems : [];
                      const approvalsCount = approvedItems.length;
                      return (
                        <React.Fragment key={inv.id}>
                          <tr
                            className="border-b border-slate-50 hover:bg-indigo-50/40 transition-colors duration-150 cursor-pointer"
                            onClick={() => {
                              setExpandedInvoices(prev => {
                                const next = new Set(prev);
                                if (next.has(inv.id)) next.delete(inv.id); else next.add(inv.id);
                                return next;
                              });
                            }}
                          >
                            <td className="py-3.5 pl-4 pr-1 w-8">
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-sm text-slate-900">{inv.month}</div>
                              {inv.date && <div className="text-xs text-slate-400 mt-0.5">{formatDate(inv.date)}</div>}
                            </td>
                            <td className="py-3.5 px-4 text-right font-semibold text-sm text-slate-900 tabular-nums">
                              {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="py-3.5 px-4 text-right text-sm text-slate-600 tabular-nums">{approvalsCount}</td>
                            <td className="py-3.5 px-4">
                              {inv.status ? (
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                  inv.status.toLowerCase().includes('paid')
                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70'
                                    : inv.status.toLowerCase().includes('pending')
                                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>{inv.status}</span>
                              ) : <span className="text-slate-300 text-sm">—</span>}
                            </td>
                            <td className="py-3.5 px-4">
                              {inv.sent || inv.sentZelle ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70">
                                  <CheckCircle className="w-3 h-3" />
                                  {inv.sentZelle ? 'Zelle sent' : 'Sent'}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">Pending</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-slate-50 bg-slate-50/40">
                              <td colSpan={6} className="px-4 py-3">
                                {items.length === 0 ? (
                                  <p className="text-xs text-slate-400 px-3 py-2">No approvals found for this month.</p>
                                ) : (
                                  <div className="rounded-xl bg-white ring-1 ring-slate-100 overflow-hidden">
                                    <div className="px-4 py-2 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                      Approvals in {inv.month}{inv.date ? ` ${parseLocalDate(inv.date).getFullYear()}` : ''} ({items.length})
                                    </div>
                                    <table className="w-full">
                                      <tbody>
                                        {items.map(item => (
                                          <tr key={item.id} className="border-b border-slate-50 last:border-b-0">
                                            <td className="py-2.5 px-4 text-sm">
                                              <div className="font-medium text-slate-900">{formatDate(item.clickDate)}</div>
                                              <div className="text-xs text-slate-400">{formatTime(item.clickTime)}</div>
                                            </td>
                                            <td className="py-2.5 px-4 text-sm text-slate-700">{decodeHtml(item.cardName)}</td>
                                            <td className="py-2.5 px-4">
                                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                                item.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                                                item.status === 'application' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70' :
                                                'bg-slate-100 text-slate-600'
                                              }`}>
                                                {item.status}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-4 text-sm text-right font-semibold text-slate-900">
                                              {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {invoicesVisible < invoices.length && (
                <div className="pt-4 text-center">
                  <button
                    onClick={() => setInvoicesVisible(n => n + PAGE_SIZE)}
                    className="px-4 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Show {Math.min(PAGE_SIZE, invoices.length - invoicesVisible)} more
                    <span className="text-slate-400 ml-1">({invoices.length - invoicesVisible} remaining)</span>
                  </button>
                </div>
              )}
              </>
            )}
          </Tabs.Content>

          {/* ── Profile Tab ── */}
          <Tabs.Content value="profile">
            <Profile accessToken={accessToken} />
          </Tabs.Content>
        </Tabs.Root>
      </main>
    </div>
  );
}
