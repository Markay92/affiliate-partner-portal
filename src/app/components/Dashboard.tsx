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

interface ActivityItem {
  id: number;
  date: string;
  card: string;
  type: string;
  amount: number;
  status: string;
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
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [payouts, setPayouts]   = useState<Payout[]>([]);
  const [tracking, setTracking] = useState<TrackingItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Activity tab
  const [activityFilter,     setActivityFilter]     = useState<DateFilter>('all');
  const [activityCustomFrom, setActivityCustomFrom] = useState('');
  const [activityCustomTo,   setActivityCustomTo]   = useState('');
  const [activitySort,       setActivitySort]       = useState<SortState>({ field: 'date', dir: 'desc' });

  // Payouts tab
  const [payoutsFilter,     setPayoutsFilter]     = useState<DateFilter>('all');
  const [payoutsCustomFrom, setPayoutsCustomFrom] = useState('');
  const [payoutsCustomTo,   setPayoutsCustomTo]   = useState('');
  const [payoutsSort,       setPayoutsSort]       = useState<SortState>({ field: 'date', dir: 'desc' });

  // API Tracking tab
  const [trackingFilter,       setTrackingFilter]       = useState<DateFilter>('all');
  const [trackingCustomFrom,   setTrackingCustomFrom]   = useState('');
  const [trackingCustomTo,     setTrackingCustomTo]     = useState('');
  const [trackingSort,         setTrackingSort]         = useState<SortState>({ field: 'clickDate', dir: 'desc' });
  const [trackingStatusFilter, setTrackingStatusFilter] = useState('all');

  // Links tab — sort + filters
  const [linksSort,         setLinksSort]         = useState<SortState>({ field: 'name', dir: 'asc' });
  const [linksIssuerFilter, setLinksIssuerFilter] = useState('all');
  const [linksPayoutFilter, setLinksPayoutFilter] = useState('all');

  // Payouts tab — extra filters (issuer + payout range, on top of existing date filter)
  const [payoutsIssuerFilter, setPayoutsIssuerFilter] = useState('all');
  const [payoutsAmountFilter, setPayoutsAmountFilter] = useState('all');

  // ── Derived display data ────────────────────────────────────────────────────
  const displayActivity = applySort(
    activity.filter(a => inDateRange(a.date, activityFilter, activityCustomFrom, activityCustomTo)),
    activitySort,
  );
  // Unique issuers for Payouts tab filter
  const payoutIssuers = Array.from(new Set(payouts.map(p => p.issuer).filter(Boolean))).sort();

  const displayPayouts = applySort(
    payouts.filter(p => {
      if (!inDateRange(p.date, payoutsFilter, payoutsCustomFrom, payoutsCustomTo)) return false;
      if (payoutsIssuerFilter !== 'all' && p.issuer !== payoutsIssuerFilter) return false;
      if (payoutsAmountFilter !== 'all') {
        const amt = p.amount || 0;
        if (payoutsAmountFilter === 'zero'    && amt !== 0)                  return false;
        if (payoutsAmountFilter === 'lt50'    && !(amt > 0 && amt < 50))     return false;
        if (payoutsAmountFilter === '50-200'  && !(amt >= 50 && amt < 200))  return false;
        if (payoutsAmountFilter === '200plus' && !(amt >= 200))              return false;
      }
      return true;
    }),
    { ...payoutsSort, field: payoutsSort.field === 'method' ? 'card' : payoutsSort.field },
  );
  const displayTracking = applySort(
    tracking.filter(t =>
      inDateRange(t.clickDate, trackingFilter, trackingCustomFrom, trackingCustomTo) &&
      (trackingStatusFilter === 'all' || t.status === trackingStatusFilter)
    ),
    trackingSort,
  );
  // Unique issuers for filter dropdown (sorted A-Z)
  const linkIssuers = Array.from(new Set(links.map(l => l.bank).filter(Boolean))).sort();

  const displayLinks = applySort(
    links.filter(l => {
      if (linksIssuerFilter !== 'all' && l.bank !== linksIssuerFilter) return false;
      if (linksPayoutFilter !== 'all') {
        const amt = l.commission || 0;
        if (linksPayoutFilter === 'lt50'   && !(amt > 0   && amt < 50))   return false;
        if (linksPayoutFilter === '50-200'  && !(amt >= 50  && amt < 200))  return false;
        if (linksPayoutFilter === '200plus' && !(amt >= 200))               return false;
        if (linksPayoutFilter === 'zero'    && amt !== 0)                   return false;
      }
      return true;
    }),
    linksSort,
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
      const [linksRes, activityRes, payoutsRes, trackingRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/links`,    { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/activity`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/payouts`,  { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/tracking`, { headers }),
      ]);

      if (linksRes.status === 401) { onLogout(); return; }

      if (!linksRes.ok) {
        const err = await linksRes.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${linksRes.status}) — try logging out and back in.`);
      }

      const [linksData, activityData, payoutsData, trackingData] = await Promise.all([
        linksRes.json(), activityRes.json(), payoutsRes.json(), trackingRes.json(),
      ]);

      setLinks(linksData.links       || []);
      setActivity(activityData.activity || []);
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
  const totalCommissions = tracking.length > 0
    ? tracking.reduce((s, t) => s + (t.totalEarnings || 0), 0)
    : activity.filter(a => a.status === 'approved').reduce((s, a) => s + a.amount, 0);
  const totalPayouts     = payouts.reduce((s, p) => s + p.amount, 0);

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
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Total Clicks</span>
              <MousePointerClick className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl mb-1">{totalClicks.toLocaleString()}</div>
            <div className="text-green-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span>+12.3% this month</span>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Approvals</span>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl mb-1">{totalConversions}</div>
            <div className="text-green-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span>+8.5% this month</span>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Commissions</span>
              <DollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-3xl mb-1">${totalCommissions.toLocaleString()}</div>
            <div className="text-green-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span>+15.2% this month</span>
            </div>
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
        <Tabs.Root defaultValue="links" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <Tabs.List className="flex border-b border-gray-200 overflow-x-auto">
            {['links', 'activity', 'payouts', 'tracking', 'profile'].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap capitalize"
              >
                {tab === 'links' ? 'Tracking Links' : tab === 'tracking' ? 'API Tracking' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* ── Tracking Links Tab ── */}
          <Tabs.Content value="links" className="p-6">
            {/* Sort + filter toolbar */}
            <div className="flex flex-col gap-3 mb-5">
              {/* Sort row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500 mr-1">Sort by:</span>
                {([
                  { field: 'name',        label: 'Name' },
                  { field: 'clicks',      label: 'Clicks' },
                  { field: 'conversions', label: 'Approvals' },
                  { field: 'commission',  label: 'Commission' },
                ] as { field: string; label: string }[]).map(({ field, label }) => (
                  <button
                    key={field}
                    onClick={() => setLinksSort(toggleSort(linksSort, field))}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      linksSort.field === field
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {label}
                    {linksSort.field === field && (
                      linksSort.dir === 'asc'
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                ))}
              </div>

              {/* Filter row */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Issuer filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Issuer:</span>
                  <select
                    value={linksIssuerFilter}
                    onChange={e => setLinksIssuerFilter(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="all">All issuers</option>
                    {linkIssuers.map(issuer => (
                      <option key={issuer} value={issuer}>{issuer}</option>
                    ))}
                  </select>
                </div>

                {/* Payout range filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Payout:</span>
                  {([
                    { value: 'all',     label: 'All' },
                    { value: 'zero',    label: '$0' },
                    { value: 'lt50',    label: 'Under $50' },
                    { value: '50-200',  label: '$50–$200' },
                    { value: '200plus', label: '$200+' },
                  ]).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setLinksPayoutFilter(value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        linksPayoutFilter === value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Active filter count / clear */}
                {(linksIssuerFilter !== 'all' || linksPayoutFilter !== 'all') && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-gray-500">
                      {displayLinks.length} of {links.length} cards
                    </span>
                    <button
                      onClick={() => { setLinksIssuerFilter('all'); setLinksPayoutFilter('all'); }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {displayLinks.map((link) => {
                // Join with payouts to show per-card CPA (match by normalized card name)
                const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                const cpaRecord = payouts.find(p => norm(p.card) === norm(link.name));
                return (
                <div key={link.id} className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <h3>{decodeHtml(link.name)}</h3>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-600">{link.clicks} clicks</span>
                      <span className="text-green-600">{link.conversions} approvals</span>
                      {cpaRecord && cpaRecord.amount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200">
                          <DollarSign className="w-3 h-3" />
                          Your CPA: ${cpaRecord.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                    <code className="flex-1 text-sm overflow-x-auto">{link.url}</code>
                    <button
                      onClick={() => copyToClipboard(link.url, link.id)}
                      className="p-2 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      title="Copy link"
                    >
                      {copiedId === link.id
                        ? <CheckCircle className="w-4 h-4 text-green-600" />
                        : <Copy className="w-4 h-4 text-gray-600" />}
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      title="Open link"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-600" />
                    </a>
                  </div>
                </div>
              );
              })}
            </div>
          </Tabs.Content>

          {/* ── Activity Tab ── */}
          <Tabs.Content value="activity" className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <FilterBar
                filter={activityFilter}     setFilter={setActivityFilter}
                customFrom={activityCustomFrom} setCustomFrom={setActivityCustomFrom}
                customTo={activityCustomTo}     setCustomTo={setActivityCustomTo}
              />
              {activityFilter !== 'all' && (
                <span className="text-xs text-gray-500">
                  {displayActivity.length} of {activity.length} records
                </span>
              )}
            </div>

            {displayActivity.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {activity.length === 0
                    ? 'No activity yet. Start promoting your tracking links!'
                    : 'No activity matches the selected date range.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <SortTh label="Date"       field="date"   sort={activitySort} onSort={(f) => setActivitySort(toggleSort(activitySort, f))} />
                      <SortTh label="Card"       field="card"   sort={activitySort} onSort={(f) => setActivitySort(toggleSort(activitySort, f))} />
                      <SortTh label="Type"       field="type"   sort={activitySort} onSort={(f) => setActivitySort(toggleSort(activitySort, f))} />
                      <SortTh label="Commission" field="amount" sort={activitySort} onSort={(f) => setActivitySort(toggleSort(activitySort, f))} align="right" />
                      <SortTh label="Status"     field="status" sort={activitySort} onSort={(f) => setActivitySort(toggleSort(activitySort, f))} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayActivity.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">{formatDate(item.date)}</td>
                        <td className="py-3 px-4">{item.card}</td>
                        <td className="py-3 px-4 capitalize">{item.type}</td>
                        <td className="py-3 px-4 text-right">${item.amount}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs ${
                            item.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tabs.Content>

          {/* ── Payouts Tab ── */}
          <Tabs.Content value="payouts" className="p-6">
            <div className="flex flex-col gap-3 mb-5">
              {/* Date filter */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterBar
                  filter={payoutsFilter}     setFilter={setPayoutsFilter}
                  customFrom={payoutsCustomFrom} setCustomFrom={setPayoutsCustomFrom}
                  customTo={payoutsCustomTo}     setCustomTo={setPayoutsCustomTo}
                />
              </div>

              {/* Issuer + payout range filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Issuer:</span>
                  <select
                    value={payoutsIssuerFilter}
                    onChange={e => setPayoutsIssuerFilter(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="all">All issuers</option>
                    {payoutIssuers.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

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
                      onClick={() => setPayoutsAmountFilter(value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        payoutsAmountFilter === value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {(payoutsFilter !== 'all' || payoutsIssuerFilter !== 'all' || payoutsAmountFilter !== 'all') && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-gray-500">
                      {displayPayouts.length} of {payouts.length} cards
                    </span>
                    <button
                      onClick={() => { setPayoutsFilter('all'); setPayoutsIssuerFilter('all'); setPayoutsAmountFilter('all'); }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </div>

            {displayPayouts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {payouts.length === 0
                    ? 'No CPA rates loaded yet — try refreshing.'
                    : 'No rates match the selected date range.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <SortTh label="Card"        field="card"   sort={payoutsSort} onSort={(f) => setPayoutsSort(toggleSort(payoutsSort, f))} />
                      <SortTh label="Issuer"      field="issuer" sort={payoutsSort} onSort={(f) => setPayoutsSort(toggleSort(payoutsSort, f))} />
                      <SortTh label="Your CPA"    field="amount" sort={payoutsSort} onSort={(f) => setPayoutsSort(toggleSort(payoutsSort, f))} align="right" />
                      <SortTh label="Rate Date"   field="date"   sort={payoutsSort} onSort={(f) => setPayoutsSort(toggleSort(payoutsSort, f))} />
                      <SortTh label="Status"      field="status" sort={payoutsSort} onSort={(f) => setPayoutsSort(toggleSort(payoutsSort, f))} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayPayouts.map((payout) => (
                      <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm font-medium">{payout.card}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{payout.issuer || '—'}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {payout.amount > 0 ? `$${payout.amount.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{formatDate(payout.date)}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                            {payout.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tabs.Content>

          {/* ── API Tracking Tab ── */}
          <Tabs.Content value="tracking" className="p-6">
            <div className="mb-4 p-4 bg-green-50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-green-800">
                <strong>API Tracking:</strong> Real-time data from Airtable showing all card clicks, applications, and approvals.
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
