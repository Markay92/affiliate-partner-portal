import { useState, useEffect } from 'react';
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
  ChevronsUpDown
} from 'lucide-react';
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

type DateFilter = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';
type SortState  = { field: string; dir: 'asc' | 'desc' };

const DATE_LABELS: Record<DateFilter, string> = {
  all: 'All time', today: 'Today', '7d': '7 days',
  '30d': '30 days', '90d': '90 days', custom: 'Custom',
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
    case 'today': return { from: today, to: null };
    case '7d':    return { from: new Date(today.getTime() - 6  * 86400000), to: null };
    case '30d':   return { from: new Date(today.getTime() - 29 * 86400000), to: null };
    case '90d':   return { from: new Date(today.getTime() - 89 * 86400000), to: null };
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
      <span className="text-xs font-medium text-gray-500 mr-1">Period:</span>
      {(['all', 'today', '7d', '30d', '90d', 'custom'] as DateFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filter === f
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
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
            className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
      : <ChevronsUpDown className="w-3 h-3 flex-shrink-0 text-gray-400" />;
  return (
    <th
      onClick={() => onSort(field)}
      className={`py-3 px-4 text-gray-600 cursor-pointer select-none hover:bg-gray-100 transition-colors text-${align}`}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}{icon}
      </span>
    </th>
  );
}

// ── Dashboard component ───────────────────────────────────────────────────────

export function Dashboard({ userEmail, accessToken, onLogout }: DashboardProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [links, setLinks]       = useState<Link[]>([]);
  const [payouts, setPayouts]   = useState<Payout[]>([]);
  const [tracking, setTracking] = useState<TrackingItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Activity tab (Airtable API Output)
  const [trackingFilter,       setTrackingFilter]       = useState<DateFilter>('all');
  const [trackingCustomFrom,   setTrackingCustomFrom]   = useState('');
  const [trackingCustomTo,     setTrackingCustomTo]     = useState('');
  const [trackingSort,         setTrackingSort]         = useState<SortState>({ field: 'clickDate', dir: 'desc' });
  const [trackingStatusFilter, setTrackingStatusFilter] = useState('all');

  // Cards tab — sort + filters
  const [cardsSort,         setCardsSort]         = useState<SortState>({ field: 'name', dir: 'asc' });
  const [cardsIssuerFilter, setCardsIssuerFilter] = useState('all');
  const [cardsPayoutFilter, setCardsPayoutFilter] = useState('all');

  // Stats grid comparison period
  type StatPeriod = 'month' | '7d' | '30d' | '90d';
  const [statPeriod, setStatPeriod] = useState<StatPeriod>('month');
  const STAT_PERIOD_LABELS: Record<StatPeriod, string> = {
    month: 'This month vs last month',
    '7d':  'Last 7 days vs prior 7 days',
    '30d': 'Last 30 days vs prior 30 days',
    '90d': 'Last 90 days vs prior 90 days',
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
      const [linksRes, payoutsRes, trackingRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/links`,    { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/payouts`,  { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/tracking`, { headers }),
      ]);

      if (linksRes.status === 401) { onLogout(); return; }

      if (!linksRes.ok) {
        const err = await linksRes.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${linksRes.status}) — try logging out and back in.`);
      }

      const [linksData, payoutsData, trackingData] = await Promise.all([
        linksRes.json(), payoutsRes.json(), trackingRes.json(),
      ]);

      setLinks(linksData.links       || []);
      setTracking(trackingData.tracking || []);
      setPayouts(payoutsData.payouts   || []);

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
  const totalClicks      = tracking.length > 0
    ? tracking.reduce((s, t) => s + (t.clicks || 0), 0)
    : links.reduce((s, l) => s + l.clicks, 0);
  const totalConversions = tracking.length > 0
    ? tracking.reduce((s, t) => s + (t.approvals || 0), 0)
    : links.reduce((s, l) => s + l.conversions, 0);
  const totalCommissions = tracking.reduce((s, t) => s + (t.totalEarnings || 0), 0);
  const totalPayouts     = payouts.reduce((s, p) => s + p.amount, 0);

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

  if (statPeriod === 'month') {
    const _thisM = _now.getMonth(), _thisY = _now.getFullYear();
    const _lastM = _thisM === 0 ? 11 : _thisM - 1;
    const _lastY  = _thisM === 0 ? _thisY - 1 : _thisY;
    const _inMonth = (dateStr: string, m: number, y: number) => {
      if (!dateStr) return false;
      const d = parseLocalDate(dateStr);
      return d.getMonth() === m && d.getFullYear() === y;
    };
    _thisT = tracking.filter(t => _inMonth(t.clickDate, _thisM, _thisY));
    _lastT = tracking.filter(t => _inMonth(t.clickDate, _lastM, _lastY));
    _periodLabel = 'vs last month';
  } else {
    const days = statPeriod === '7d' ? 7 : statPeriod === '30d' ? 30 : 90;
    _thisT = tracking.filter(t => _inRange(t.clickDate, days, 0));
    _lastT = tracking.filter(t => _inRange(t.clickDate, days * 2, days));
    _periodLabel = `vs prior ${days} days`;
  }

  const _calcPct = (cur: number, prev: number): number | null =>
    prev === 0 ? (cur > 0 ? 100 : null) : Math.round(((cur - prev) / prev) * 100);

  const clicksPct      = _calcPct(
    _thisT.reduce((s, t) => s + t.clicks, 0),
    _lastT.reduce((s, t) => s + t.clicks, 0),
  );
  const approvalsPct   = _calcPct(
    _thisT.reduce((s, t) => s + t.approvals, 0),
    _lastT.reduce((s, t) => s + t.approvals, 0),
  );
  const commissionsPct = _calcPct(
    _thisT.reduce((s, t) => s + t.totalEarnings, 0),
    _lastT.reduce((s, t) => s + t.totalEarnings, 0),
  );

  /** Coloured percentage badge shown under each stat card */
  const PctBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-gray-400 text-sm">No prior-period data</span>;
    if (pct === 0)    return <span className="text-gray-500 text-sm flex items-center gap-1">— No change <span className="font-normal">{_periodLabel}</span></span>;
    const up = pct > 0;
    return (
      <div className={`flex items-center gap-1 text-sm ${up ? 'text-green-600' : 'text-red-500'}`}>
        <TrendingUp className={`w-4 h-4 ${!up ? 'rotate-180' : ''}`} />
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <h1 className="hidden sm:block">Affiliate Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchData}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4 text-gray-600" />
              </button>
              <span className="hidden sm:inline text-gray-600">{userEmail}</span>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 lg:px-8 py-3 text-red-800 text-sm max-w-7xl mx-auto">
          {error} — try refreshing the page or logging out and back in.
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats header: title + period picker */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs text-gray-400">
            Percentage change compares <strong>{STAT_PERIOD_LABELS[statPeriod].toLowerCase()}</strong>
          </p>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 text-xs font-medium">
            {(['month', '7d', '30d', '90d'] as StatPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setStatPeriod(p)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  statPeriod === p
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'month' ? 'Month' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Total Clicks</span>
              <MousePointerClick className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl mb-1">{totalClicks.toLocaleString()}</div>
            <PctBadge pct={clicksPct} />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Approvals</span>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl mb-1">{totalConversions}</div>
            <PctBadge pct={approvalsPct} />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Commissions</span>
              <DollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-3xl mb-1">${totalCommissions.toLocaleString()}</div>
            <PctBadge pct={commissionsPct} />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">CPA Rates</span>
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl mb-1">{payouts.length}</div>
            <div className="text-gray-500">Active cards</div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="cards" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <Tabs.List className="flex border-b border-gray-200 overflow-x-auto">
            {['cards', 'activity', 'profile'].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap capitalize"
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* ── Cards Tab ── */}
          <Tabs.Content value="cards" className="p-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {/* Issuer filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Issuer:</span>
                <select
                  value={cardsIssuerFilter}
                  onChange={e => setCardsIssuerFilter(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="all">All issuers</option>
                  {cardIssuers.map(issuer => (
                    <option key={issuer} value={issuer}>{issuer}</option>
                  ))}
                </select>
              </div>

              {/* CPA range filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Your CPA:</span>
                {([
                  { value: 'all',     label: 'All' },
                  { value: 'zero',    label: '$0' },
                  { value: 'lt50',    label: '<$50' },
                  { value: '50-200',  label: '$50–$200' },
                  { value: '200plus', label: '$200+' },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setCardsPayoutFilter(value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      cardsPayoutFilter === value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(cardsIssuerFilter !== 'all' || cardsPayoutFilter !== 'all') && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-gray-500">{displayCards.length} of {allCards.length} cards</span>
                  <button
                    onClick={() => { setCardsIssuerFilter('all'); setCardsPayoutFilter('all'); }}
                    className="text-xs text-indigo-600 hover:underline"
                  >Clear filters</button>
                </div>
              )}
            </div>

            {/* Table */}
            {displayCards.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>{links.length === 0 ? 'No cards loaded yet — try refreshing.' : 'No cards match the selected filters.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <SortTh label="Card"     field="name"        sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} />
                      <SortTh label="Issuer"   field="issuer"      sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} />
                      <SortTh label="Your CPA" field="cpa"         sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                      <SortTh label="Clicks"   field="clicks"      sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                      <SortTh label="Approvals" field="conversions" sort={cardsSort} onSort={f => setCardsSort(toggleSort(cardsSort, f))} align="right" />
                      <th className="py-3 px-4 text-right text-gray-600 font-medium text-sm">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayCards.map(card => (
                      <tr key={card.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-sm">{card.name}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{card.issuer || '—'}</td>
                        <td className="py-3 px-4 text-right text-sm font-medium">
                          {card.cpa > 0 ? `$${card.cpa.toLocaleString()}` : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-gray-600">{card.clicks}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-600">{card.conversions}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => copyToClipboard(card.url, card.id)}
                              className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                              title="Copy link"
                            >
                              {copiedId === card.id
                                ? <CheckCircle className="w-4 h-4 text-green-600" />
                                : <Copy className="w-4 h-4 text-gray-500" />}
                            </button>
                            <a
                              href={card.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                              title="Open link"
                            >
                              <ExternalLink className="w-4 h-4 text-gray-500" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tabs.Content>

          {/* ── Activity Tab ── */}
          <Tabs.Content value="activity" className="p-6">
            <div className="mb-4 p-4 bg-green-50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-green-800">
                <strong>Activity:</strong> Real-time data from Airtable showing all card clicks, applications, and approvals.
                ({displayTracking.length}{trackingFilter !== 'all' ? ` of ${tracking.length}` : ''} records)
              </p>
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex-shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
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
              <span className="text-xs font-medium text-gray-500 mr-1">Status:</span>
              {[
                { value: 'all',         label: 'All' },
                { value: 'click',       label: 'Click' },
                { value: 'application', label: 'Application' },
                { value: 'approval',    label: 'Approval' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTrackingStatusFilter(value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    trackingStatusFilter === value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {displayTracking.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-4">
                  {tracking.length === 0
                    ? 'No tracking activity found'
                    : 'No activity matches the selected date range.'}
                </p>
                {tracking.length === 0 && (
                  <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Refresh Data
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
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
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">
                          <div>{formatDate(item.clickDate)}</div>
                          <div className="text-xs text-gray-500">{formatTime(item.clickTime)}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">{item.cardName}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.status === 'approval'    ? 'bg-green-100 text-green-800' :
                            item.status === 'application' ? 'bg-blue-100 text-blue-800'  :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium">
                          {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{item.deviceType || '-'}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{item.state || '-'}</td>
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
