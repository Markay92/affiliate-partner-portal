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
} from 'lucide-react';
import React from 'react';
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

type DateFilter = 'all' | 'today' | 'yesterday' | 'mtd' | '7d' | '30d' | '90d' | 'lm' | 'custom';
type SortState  = { field: string; dir: 'asc' | 'desc' };

const DATE_LABELS: Record<DateFilter, string> = {
  all: 'All time', today: 'Today', yesterday: 'Yesterday',
  mtd: 'This Month', '7d': '7 days', '30d': '30 days',
  '90d': '90 days', lm: 'Last Month', custom: 'Custom',
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
    case 'today':     return { from: today, to: null };
    case 'yesterday': {
      const yest = new Date(today.getTime() - 86400000);
      const yestEnd = new Date(yest); yestEnd.setHours(23, 59, 59, 999);
      return { from: yest, to: yestEnd };
    }
    case 'mtd': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: first, to: null };
    }
    case 'lm': {
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastOfLastMonth  = new Date(today.getFullYear(), today.getMonth(), 0);
      lastOfLastMonth.setHours(23, 59, 59, 999);
      return { from: firstOfLastMonth, to: lastOfLastMonth };
    }
    case '7d':  return { from: new Date(today.getTime() - 6  * 86400000), to: null };
    case '30d': return { from: new Date(today.getTime() - 29 * 86400000), to: null };
    case '90d': return { from: new Date(today.getTime() - 89 * 86400000), to: null };
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-400 mr-1">Period:</span>
      {(['all', 'today', 'yesterday', 'mtd', '7d', '30d', '90d', 'lm', 'custom'] as DateFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            filter === f
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          {DATE_LABELS[f]}
        </button>
      ))}
      {filter === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
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
      className={`py-3 px-4 text-slate-500 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50 transition-colors text-${align}`}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}{icon}
      </span>
    </th>
  );
}

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

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [links, setLinks]       = useState<Link[]>([]);
  const [payouts, setPayouts]   = useState<Payout[]>([]);
  const [tracking, setTracking] = useState<TrackingItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Activity tab (Airtable API Output)
  const [trackingFilter,       setTrackingFilter]       = useState<DateFilter>('all');
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

  // Stats grid comparison period
  type StatPeriod = 'yesterday' | 'mtd' | 'month' | '7d' | '30d' | '90d' | 'lm';
  const [statPeriod, setStatPeriod] = useState<StatPeriod>('month');
  const STAT_PERIOD_LABELS: Record<StatPeriod, string> = {
    yesterday: 'Yesterday vs day before',
    mtd:   'Month to date vs same days last month',
    month: 'This month vs last month',
    '7d':  'Last 7 days vs prior 7 days',
    '30d': 'Last 30 days vs prior 30 days',
    '90d': 'Last 90 days vs prior 90 days',
    lm:    'Last month vs month before',
  };

  // ── Derived display data ────────────────────────────────────────────────────
  const displayTracking = applySort(
    tracking.filter(t =>
      inDateRange(t.clickDate, trackingFilter, trackingCustomFrom, trackingCustomTo) &&
      (trackingStatusFilter === 'all' || t.status === trackingStatusFilter)
    ),
    trackingSort,
  );

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

  // Prefer Airtable tracking data (real-time from API Output table) for stats.
  // Fall back to KV-derived values for users who haven't synced yet.
  const totalClicks       = tracking.length > 0
    ? tracking.reduce((s, t) => s + (t.clicks || 0), 0)
    : links.reduce((s, l) => s + l.clicks, 0);
  const totalConversions  = tracking.length > 0
    ? tracking.reduce((s, t) => s + (t.approvals || 0), 0)
    : links.reduce((s, l) => s + l.conversions, 0);
  const totalApplications = tracking.reduce((s, t) => s + (t.applications || 0), 0);
  const totalCommissions  = tracking.reduce((s, t) => s + (t.totalEarnings || 0), 0);
  const totalPayouts      = payouts.reduce((s, p) => s + p.amount, 0);
  const avgEPC            = totalClicks > 0 ? totalCommissions / totalClicks : 0;

  // ── Period-over-period stats from tracking records ────────────────────────
  const _now = new Date();
  const _today = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate()); // midnight local

  const _getDayOffset = (d: Date): number =>
    Math.floor((_today.getTime() - d.getTime()) / 86_400_000);

  const _inRange = (dateStr: string, startDaysAgo: number, endDaysAgo: number) => {
    if (!dateStr) return false;
    const offset = _getDayOffset(parseLocalDate(dateStr));
    return offset >= endDaysAgo && offset < startDaysAgo;
  };

  let _thisT: TrackingItem[], _lastT: TrackingItem[], _periodLabel: string;

  const _inMonth = (dateStr: string, m: number, y: number) => {
    if (!dateStr) return false;
    const d = parseLocalDate(dateStr);
    return d.getMonth() === m && d.getFullYear() === y;
  };

  if (statPeriod === 'yesterday') {
    _thisT = tracking.filter(t => _inRange(t.clickDate, 2, 1)); // yesterday
    _lastT = tracking.filter(t => _inRange(t.clickDate, 3, 2)); // day before
    _periodLabel = 'vs day before';
  } else if (statPeriod === 'mtd') {
    // MTD = 1st of current month to today; compare vs same # of days in prior month
    const dayOfMonth = _now.getDate();
    const _thisM = _now.getMonth(), _thisY = _now.getFullYear();
    const _lastM = _thisM === 0 ? 11 : _thisM - 1;
    const _lastY  = _thisM === 0 ? _thisY - 1 : _thisY;
    _thisT = tracking.filter(t => {
      if (!t.clickDate) return false;
      const d = parseLocalDate(t.clickDate);
      return d.getMonth() === _thisM && d.getFullYear() === _thisY;
    });
    _lastT = tracking.filter(t => {
      if (!t.clickDate) return false;
      const d = parseLocalDate(t.clickDate);
      return d.getMonth() === _lastM && d.getFullYear() === _lastY && d.getDate() <= dayOfMonth;
    });
    _periodLabel = 'vs same days last month';
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
  } else {
    const days = statPeriod === '7d' ? 7 : statPeriod === '30d' ? 30 : 90;
    _thisT = tracking.filter(t => _inRange(t.clickDate, days, 0));
    _lastT = tracking.filter(t => _inRange(t.clickDate, days * 2, days));
    _periodLabel = `vs prior ${days} days`;
  }

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
  const PctBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-slate-400 text-xs">No prior-period data</span>;
    if (pct === 0)    return <span className="text-slate-400 text-xs flex items-center gap-1">— No change <span className="font-normal">{_periodLabel}</span></span>;
    const up = pct > 0;
    return (
      <div className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>
        <TrendingUp className={`w-3.5 h-3.5 ${!up ? 'rotate-180' : ''}`} />
        <span>{up ? '+' : ''}{pct}% {_periodLabel}</span>
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          </div>
          <p className="text-slate-500 text-sm">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500 p-2 rounded-xl">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <h1 className="hidden sm:block text-white font-semibold text-lg tracking-tight">Affiliate Portal</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4 text-slate-400" />
              </button>
              <span className="hidden sm:inline text-slate-400 text-sm">
                {firstName ? `Hi, ${firstName}` : userEmail}
              </span>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
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
          {error} — try refreshing the page or logging out and back in.
        </div>
      )}

      {/* Floating exit pill for manager impersonation */}
      {isImpersonating && (
        <button
          onClick={handleBackToAdmin}
          title="Exit back to Admin Dashboard"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-700 transition-all text-xs font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Exit to Admin
        </button>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats header: period picker */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-xs text-slate-400">
            Comparing <span className="font-medium text-slate-500">{STAT_PERIOD_LABELS[statPeriod].toLowerCase()}</span>
          </p>
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-1 text-xs font-medium shadow-sm">
            {([
              { value: 'yesterday', label: 'Yest.' },
              { value: 'mtd',       label: 'MTD' },
              { value: 'month',     label: 'Month' },
              { value: '7d',        label: '7D' },
              { value: '30d',       label: '30D' },
              { value: '90d',       label: '90D' },
              { value: 'lm',        label: 'Last Mo.' },
            ] as { value: StatPeriod; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatPeriod(value)}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  statPeriod === value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Total Clicks</span>
              <div className="p-2 bg-blue-50 rounded-xl">
                <MousePointerClick className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{totalClicks.toLocaleString()}</div>
            <PctBadge pct={clicksPct} />
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Approvals</span>
              <div className="p-2 bg-emerald-50 rounded-xl">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{totalConversions}</div>
            <PctBadge pct={approvalsPct} />
            {totalClicks > 0 && (
              <div className="text-xs text-slate-400 mt-1">
                {((totalConversions / totalClicks) * 100).toFixed(1)}% conv. rate
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Commissions</span>
              <div className="p-2 bg-indigo-50 rounded-xl">
                <DollarSign className="w-4 h-4 text-indigo-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">${totalCommissions.toLocaleString()}</div>
            <PctBadge pct={commissionsPct} />
            {avgEPC > 0 && (
              <div className="text-xs text-slate-400 mt-1">
                EPC: ${avgEPC.toFixed(2)}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Applications</span>
              <div className="p-2 bg-orange-50 rounded-xl">
                <Activity className="w-4 h-4 text-orange-500" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{totalApplications}</div>
            <PctBadge pct={applicationsPct} />
            {totalClicks > 0 && (
              <div className="text-xs text-slate-400 mt-1">
                {((totalApplications / totalClicks) * 100).toFixed(1)}% click→app
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="cards" className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5">
          <Tabs.List className="flex border-b border-slate-100 overflow-x-auto px-2 pt-1">
            {['cards', 'activity', 'invoices', 'profile'].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors whitespace-nowrap capitalize -mb-px"
              >
                {tab === 'invoices'
                  ? <span className="flex items-center gap-1.5">Invoices{invoices.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{invoices.length}</span>}</span>
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* ── Cards Tab ── */}
          <Tabs.Content value="cards" className="p-6">
            {/* Toolbar */}
            <div className="space-y-3 mb-5">
              {/* Row 1: Search + Group toggle */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search cards or issuer…"
                    value={cardsSearch}
                    onChange={e => setCardsSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                  />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => { setCardsGroupBy(g => !g); setCardsCollapsed(new Set()); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      cardsGroupBy
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'text-slate-600 bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Group by Issuer
                  </button>
                  {cardsGroupBy && displayCards.length > 0 && (() => {
                    const allIssuers = Array.from(new Set(displayCards.map(c => c.issuer || 'Other')));
                    const allCollapsed = allIssuers.every(i => cardsCollapsed.has(i));
                    return (
                      <button onClick={() => setCardsCollapsed(allCollapsed ? new Set() : new Set(allIssuers))}
                        className="text-xs text-slate-500 hover:text-indigo-600 transition-colors">
                        {allCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* Row 2: Issuer + CPA range */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Issuer:</span>
                  <select value={cardsIssuerFilter} onChange={e => setCardsIssuerFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700">
                    <option value="all">All issuers</option>
                    {cardIssuers.map(issuer => <option key={issuer} value={issuer}>{issuer}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-400">Your CPA:</span>
                  {([
                    { value: 'all', label: 'All' }, { value: 'zero', label: '$0' },
                    { value: 'lt50', label: '<$50' }, { value: '50-200', label: '$50–$200' },
                    { value: '200plus', label: '$200+' },
                  ]).map(({ value, label }) => (
                    <button key={value} onClick={() => setCardsPayoutFilter(value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        cardsPayoutFilter === value
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}>{label}</button>
                  ))}
                </div>
                {(cardsSearch || cardsIssuerFilter !== 'all' || cardsPayoutFilter !== 'all') && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-400">{displayCards.length} of {allCards.length} cards</span>
                    <button onClick={() => { setCardsSearch(''); setCardsIssuerFilter('all'); setCardsPayoutFilter('all'); }}
                      className="text-xs text-indigo-600 hover:underline">Clear</button>
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            {displayCards.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm">{links.length === 0 ? 'No cards loaded yet — try refreshing.' : 'No cards match the selected filters.'}</p>
              </div>
            ) : (() => {
              const CardRow = ({ card }: { card: any }) => (
                <tr key={card.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-sm text-slate-900">{card.name}</td>
                  {!cardsGroupBy && <td className="py-3.5 px-4 text-sm text-slate-500">{card.issuer || '—'}</td>}
                  <td className="py-3.5 px-4 text-right text-sm font-semibold text-slate-900">
                    {card.cpa > 0 ? `$${card.cpa.toLocaleString()}` : <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="py-3.5 px-4 text-right text-sm text-slate-600">{card.clicks}</td>
                  <td className="py-3.5 px-4 text-right text-sm text-slate-600">{card.conversions}</td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => copyToClipboard(card.url, card.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Copy link">
                        {copiedId === card.id ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
                      </button>
                      <a href={card.url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Open link">
                        <ExternalLink className="w-4 h-4 text-slate-400" />
                      </a>
                    </div>
                  </td>
                </tr>
              );

              const colCount = cardsGroupBy ? 5 : 6;
              return (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <SortTh label="Card"     field="name"        sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} />
                        {!cardsGroupBy && <SortTh label="Issuer" field="issuer" sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} />}
                        <SortTh label="Your CPA" field="cpa"         sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                        <SortTh label="Clicks"   field="clicks"      sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                        <SortTh label="Approvals" field="conversions" sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                        <th className="py-3 px-4 text-right text-slate-500 text-xs font-semibold uppercase tracking-wider">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardsGroupBy ? (
                        (() => {
                          const groups: Record<string, any[]> = {};
                          displayCards.forEach(c => {
                            const key = c.issuer || 'Other';
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(c);
                          });
                          return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([issuer, cards]) => {
                            const isCollapsed = cardsCollapsed.has(issuer);
                            const toggle = () => setCardsCollapsed(prev => {
                              const next = new Set(prev);
                              next.has(issuer) ? next.delete(issuer) : next.add(issuer);
                              return next;
                            });
                            return (
                              <React.Fragment key={`g-${issuer}`}>
                                <tr onClick={toggle} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                                  <td colSpan={colCount} className="py-2.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{issuer}</span>
                                      <span className="text-xs font-normal text-slate-400 ml-0.5">({cards.length} {cards.length === 1 ? 'card' : 'cards'})</span>
                                    </div>
                                  </td>
                                </tr>
                                {!isCollapsed && cards.map(card => <CardRow key={card.id} card={card} />)}
                              </React.Fragment>
                            );
                          });
                        })()
                      ) : (
                        displayCards.map(card => <CardRow key={card.id} card={card} />)
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </Tabs.Content>

          {/* ── Activity Tab ── */}
          <Tabs.Content value="activity" className="p-6">
            <div className="flex items-center justify-between mb-5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{displayTracking.length}</span>
                {trackingFilter !== 'all' ? <span className="text-slate-400"> of {tracking.length}</span> : ''} activity records
              </p>
              <button
                onClick={fetchData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <FilterBar
                filter={trackingFilter}     setFilter={setTrackingFilter}
                customFrom={trackingCustomFrom} setCustomFrom={setTrackingCustomFrom}
                customTo={trackingCustomTo}     setCustomTo={setTrackingCustomTo}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="text-xs font-medium text-slate-400 mr-1">Status:</span>
              {[
                { value: 'all',         label: 'All' },
                { value: 'click',       label: 'Click' },
                { value: 'application', label: 'Application' },
                { value: 'approval',    label: 'Approval' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTrackingStatusFilter(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    trackingStatusFilter === value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {displayTracking.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-slate-500 text-sm mb-4">
                  {tracking.length === 0
                    ? 'No tracking activity found'
                    : 'No activity matches the selected date range.'}
                </p>
                {tracking.length === 0 && (
                  <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                  >
                    Refresh Data
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                    {displayTracking.map((item) => (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
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
                        <td className="py-3.5 px-4 text-sm text-right font-semibold text-slate-900">
                          {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="py-3.5 px-4 text-sm text-slate-500">{item.deviceType || '—'}</td>
                        <td className="py-3.5 px-4 text-sm text-slate-500">{item.state || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tabs.Content>

          {/* ── Invoices Tab ── */}
          <Tabs.Content value="invoices" className="p-6">
            {invoices.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-slate-500 text-sm">No invoices found for your account.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider">Month</th>
                      <th className="py-3 px-4 text-right text-slate-500 text-xs font-semibold uppercase tracking-wider">Amount</th>
                      <th className="py-3 px-4 text-right text-slate-500 text-xs font-semibold uppercase tracking-wider">Approvals</th>
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider">Status</th>
                      <th className="py-3 px-4 text-left text-slate-500 text-xs font-semibold uppercase tracking-wider">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-sm text-slate-900">{inv.month}</div>
                          {inv.date && <div className="text-xs text-slate-400 mt-0.5">{formatDate(inv.date)}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-sm text-slate-900">
                          {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right text-sm text-slate-600">{inv.approvals}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
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
