import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  Users,
  TrendingUp,
  DollarSign,
  Trash2,
  Key,
  Plus,
  X,
  Save,
  Edit,
  LogOut,
  RefreshCw,
  LogIn,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  CheckCircle,
  Send,
  Search,
  Layers,
  Activity,
  Award,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';

interface ManagerProps {
  sessionToken: string;
  managerName: string;
  onLogout: () => void;
  onLoginAsUser: (email: string, accessToken: string) => void;
}

// ── Filter / sort types & helpers ────────────────────────────────────────────

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'lm' | 'custom';
type SortState  = { field: string; dir: 'asc' | 'desc' };

// Records default to showing only the current year — older years are hidden
// behind a "Load more" toggle to keep long-running tables manageable.
const CURRENT_YEAR = new Date().getFullYear();
function yearOf(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

/** Small "Showing {year} only" notice + Load more toggle for year-limited tables. */
function LoadMoreYears({
  showAll, setShowAll, hiddenCount,
}: { showAll: boolean; setShowAll: (v: boolean) => void; hiddenCount: number }) {
  if (hiddenCount === 0 && !showAll) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      {!showAll ? (
        <>
          <span>Showing {CURRENT_YEAR} only{hiddenCount > 0 ? ` · ${hiddenCount} older record${hiddenCount === 1 ? '' : 's'} hidden` : ''}</span>
          {hiddenCount > 0 && (
            <button onClick={() => setShowAll(true)} className="text-indigo-600 hover:underline font-medium">
              Load more
            </button>
          )}
        </>
      ) : (
        <>
          <span>Showing all years</span>
          <button onClick={() => setShowAll(false)} className="text-indigo-600 hover:underline font-medium">
            Show {CURRENT_YEAR} only
          </button>
        </>
      )}
    </div>
  );
}

const DATE_LABELS: Record<DateFilter, string> = {
  today: 'Today', week: 'This Week', month: 'This Month',
  lm: 'Last Month', all: 'All Time', custom: 'Custom',
};

function parseLocalDate(str: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {};
for (let m = 0; m < 12; m++) {
  const full = new Date(2000, m, 1).toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const abbr = new Date(2000, m, 1).toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  MONTH_NAME_TO_INDEX[full] = m;
  MONTH_NAME_TO_INDEX[abbr] = m;
  MONTH_NAME_TO_INDEX[abbr.replace('.', '')] = m;
}

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

function formatDate(str: string | undefined): string {
  if (!str) return '—';
  const d = parseLocalDate(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

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

/** Sort users, handling nested stats.* fields */
function sortUsers(items: any[], sort: SortState): any[] {
  const getValue = (item: any) => {
    switch (sort.field) {
      case 'totalClicks':       return item.stats?.totalClicks       || 0;
      case 'totalConversions':  return item.stats?.totalConversions  || 0;
      case 'totalCommissions':  return item.stats?.totalCommissions  || 0;
      default:                  return item[sort.field];
    }
  };
  return [...items].sort((a, b) => {
    const aVal = getValue(a);
    const bVal = getValue(b);
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
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
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
      className={`py-3.5 px-6 text-slate-500 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50 transition-colors text-${align}`}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}{icon}
      </span>
    </th>
  );
}

function SortThSm({
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

// ── Manager component ─────────────────────────────────────────────────────────

export function Manager({ sessionToken, managerName, onLogout, onLoginAsUser }: ManagerProps) {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal]   = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [message, setMessage]               = useState('');
  const [syncing, setSyncing]               = useState(false);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [importingCPA, setImportingCPA]     = useState(false);
  const [actionsOpen, setActionsOpen]       = useState(false);
  const [messageTimeout, setMessageTimeout] = useState<NodeJS.Timeout | null>(null);
  const [trackingActivity, setTrackingActivity] = useState([]);
  const [activeTab, setActiveTab]           = useState('affiliates');

  // Edit user form fields
  const [editName, setEditName]       = useState('');
  const [editEmail, setEditEmail]     = useState('');
  const [editPhone, setEditPhone]     = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity]       = useState('');
  const [editState, setEditState]     = useState('');
  const [editZip, setEditZip]         = useState('');
  const [editCountry, setEditCountry] = useState('');

  // Create user form
  const [newUserEmail, setNewUserEmail]           = useState('');
  const [newUserPassword, setNewUserPassword]     = useState('');
  const [newUserName, setNewUserName]             = useState('');
  const [newUserCommission, setNewUserCommission] = useState('100');

  // Reset password
  const [resetPassword, setResetPassword] = useState('');

  // Summary panel visibility — persisted in localStorage
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('mgr-visible-panels');
      return saved ? new Set(JSON.parse(saved)) : new Set(['stats', 'charts', 'topCards']);
    } catch { return new Set(['stats', 'charts', 'topCards']); }
  });
  const togglePanel = (key: string) => setVisiblePanels(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem('mgr-visible-panels', JSON.stringify([...next])); } catch {}
    return next;
  });

  // Edit commission
  const [editingCommission, setEditingCommission] = useState<string | null>(null);
  const [commissionValue, setCommissionValue]     = useState('');

  // ── Affiliates filter / sort ────────────────────────────────────────────────
  const [affiliatesFilter,     setAffiliatesFilter]     = useState<DateFilter>('all');
  const [affiliatesCustomFrom, setAffiliatesCustomFrom] = useState('');
  const [affiliatesCustomTo,   setAffiliatesCustomTo]   = useState('');
  const [affiliatesSort,       setAffiliatesSort]       = useState<SortState>({ field: 'name', dir: 'asc' });
  const [affiliateSearch,      setAffiliateSearch]      = useState('');
  const [affiliateGroupBy,     setAffiliateGroupBy]     = useState(false);
  const [affiliateCollapsed,   setAffiliateCollapsed]   = useState<Set<string>>(new Set());

  // ── Year-limited views: default to current year, "Load more" reveals older ──
  const [trackingShowAllYears, setTrackingShowAllYears] = useState(false);
  const [invoiceShowAllYears,  setInvoiceShowAllYears]  = useState(false);
  const [cpaShowAllYears,      setCpaShowAllYears]      = useState(false);

  // ── Tracking Activity filter / sort ────────────────────────────────────────
  const [mgTrackingFilter,           setMgTrackingFilter]           = useState<DateFilter>('all');
  const [mgTrackingCustomFrom,       setMgTrackingCustomFrom]       = useState('');
  const [mgTrackingCustomTo,         setMgTrackingCustomTo]         = useState('');
  const [mgTrackingSort,             setMgTrackingSort]             = useState<SortState>({ field: 'clickDate', dir: 'desc' });
  const [mgTrackingStatusFilter,     setMgTrackingStatusFilter]     = useState('all');
  const [mgTrackingAffiliateFilter,  setMgTrackingAffiliateFilter]  = useState('all');
  const [trackingGroupBy,            setTrackingGroupBy]            = useState<'none' | 'month' | 'affiliate'>('none');
  const [trackingCollapsed,          setTrackingCollapsed]          = useState<Set<string>>(new Set());

  // CPA Rates tab
  const [cpaRates,          setCpaRates]          = useState<any[]>([]);
  const [cpaRatesLoading,   setCpaRatesLoading]   = useState(false);
  const [cpaAffiliateFilter, setCpaAffiliateFilter] = useState('all');
  const [cpaSort,           setCpaSort]           = useState<SortState>({ field: 'card', dir: 'asc' });
  const [cpaAffiliateLabel, setCpaAffiliateLabel] = useState('');
  const [cpaSearch,         setCpaSearch]         = useState('');
  const [cpaIssuerFilter,   setCpaIssuerFilter]   = useState('all');
  const [cpaCpaRange,       setCpaCpaRange]       = useState('all');
  const [cpaGroupBy,        setCpaGroupBy]        = useState(false);
  const [cpaCollapsed,      setCpaCollapsed]      = useState<Set<string>>(new Set());

  // Invoices tab
  const [invoices,              setInvoices]              = useState<any[]>([]);
  const [invoicesLoading,       setInvoicesLoading]       = useState(false);
  const [invoiceAffiliateFilter, setInvoiceAffiliateFilter] = useState('all');
  const [invoiceStatusFilter,   setInvoiceStatusFilter]   = useState('all');
  const [invoiceMonthFilter,    setInvoiceMonthFilter]    = useState('all');
  const [invoiceSort,           setInvoiceSort]           = useState<SortState>({ field: 'date', dir: 'desc' });
  const [updatingInvoice,       setUpdatingInvoice]       = useState<string | null>(null);
  const [invoiceGroupBy,        setInvoiceGroupBy]        = useState<'none' | 'month' | 'affiliate'>('none');
  const [invoiceCollapsed,      setInvoiceCollapsed]      = useState<Set<string>>(new Set());
  const [expandedInvoices,      setExpandedInvoices]      = useState<Set<string>>(new Set());

  // ── Derived display data ────────────────────────────────────────────────────
  const displayUsers = sortUsers(
    users.filter((u: any) => {
      if (!inDateRange(u.createdAt, affiliatesFilter, affiliatesCustomFrom, affiliatesCustomTo)) return false;
      if (affiliateSearch) {
        const q = affiliateSearch.toLowerCase();
        if (!(u.name || '').toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
      }
      return true;
    }),
    affiliatesSort,
  );

  // Unique affiliates present in tracking data, for the affiliate dropdown
  const affiliateOptions: { id: string; name: string }[] = Array.from(
    new Map(
      (trackingActivity as any[])
        .filter((a) => a.affiliateId)
        .map((a) => [a.affiliateId, { id: a.affiliateId, name: a.memberName || a.affiliateId }])
    ).values()
  ).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  // How many tracking records fall outside the current year (hidden by default)
  const trackingHiddenOlderCount = (trackingActivity as any[])
    .filter((a) => { const y = yearOf(a.clickDate); return y !== null && y !== CURRENT_YEAR; }).length;

  const displayTrackingActivity = applySort(
    (trackingActivity as any[]).filter((a) =>
      (trackingShowAllYears || yearOf(a.clickDate) === null || yearOf(a.clickDate) === CURRENT_YEAR) &&
      inDateRange(a.clickDate, mgTrackingFilter, mgTrackingCustomFrom, mgTrackingCustomTo) &&
      (mgTrackingStatusFilter === 'all' || a.status === mgTrackingStatusFilter) &&
      (mgTrackingAffiliateFilter === 'all' || a.affiliateId === mgTrackingAffiliateFilter)
    ),
    mgTrackingSort,
  );

  // Resolve every card (all tracking-activity records — clicks, applications,
  // and approvals alike) tied to a given invoice's affiliate + month/year, so
  // the manager can see the full picture of what's behind that month's payout.
  // Matched by affiliate (via email → affiliateId) + the invoice's month/year.
  const getInvoiceCards = (inv: any): any[] => {
    if (!inv) return [];
    const user = (users as any[]).find((u: any) => u.email && inv.email && u.email.toLowerCase() === inv.email.toLowerCase());
    const affId = user?.affiliateId || (inv.email ? null : undefined);
    // Fall back to matching by member name if we couldn't resolve an affiliate ID via email
    const fallbackName = !affId ? (inv.name || '').trim().toLowerCase() : null;
    if (!affId && !fallbackName) return [];
    const invDate = inv.date ? parseLocalDate(inv.date) : null;
    const target = parseInvoiceMonth(inv.month) || (invDate && !isNaN(invDate.getTime())
      ? { monthIndex: invDate.getMonth(), year: invDate.getFullYear() }
      : null);
    if (!target) return [];
    return (trackingActivity as any[])
      .filter((a) => {
        const matchesAffiliate = affId
          ? a.affiliateId === affId
          : String(a.memberName || '').trim().toLowerCase() === fallbackName;
        if (!matchesAffiliate) return false;
        const d = parseLocalDate(a.clickDate);
        if (isNaN(d.getTime())) return false;
        return d.getMonth() === target.monthIndex && d.getFullYear() === target.year;
      })
      .sort((a, b) => parseLocalDate(b.clickDate).getTime() - parseLocalDate(a.clickDate).getTime());
  };

  // Summary: cards ranked by number of approvals across all affiliates (all-time),
  // for the "Most Approved Cards" card on the Tracking tab.
  const mostApprovedCards = (() => {
    const byCard: Record<string, { name: string; approvals: number; earnings: number }> = {};
    (trackingActivity as any[]).forEach((a) => {
      if (a.status !== 'approval') return;
      const key = a.cardName || 'Unknown';
      if (!byCard[key]) byCard[key] = { name: key, approvals: 0, earnings: 0 };
      byCard[key].approvals += 1;
      byCard[key].earnings  += a.totalEarnings || 0;
    });
    return Object.values(byCard).sort((a, b) => b.approvals - a.approvals || b.earnings - a.earnings).slice(0, 5);
  })();

  // Always all-time — not affected by the period filter (which only filters the table rows).
  // Prefer summing from the live trackingActivity array (real Airtable data) when loaded;
  // fall back to KV-cached user.stats for the period before the first tracking fetch completes.
  const totalStats = trackingActivity.length > 0
    ? trackingActivity.reduce((acc: any, row: any) => ({
        clicks:       acc.clicks       + (row.clicks       || 0),
        applications: acc.applications + (row.applications || 0),
        conversions:  acc.conversions  + (row.approvals    || 0),
        commissions:  acc.commissions  + (row.totalEarnings || 0),
      }), { clicks: 0, applications: 0, conversions: 0, commissions: 0 })
    : users.reduce((acc: any, user: any) => ({
        clicks:       acc.clicks       + (user.stats?.totalClicks      || 0),
        applications: acc.applications + 0, // not in KV cache
        conversions:  acc.conversions  + (user.stats?.totalConversions  || 0),
        commissions:  acc.commissions  + (user.stats?.totalCommissions  || 0),
      }), { clicks: 0, applications: 0, conversions: 0, commissions: 0 });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const setMessageWithTimeout = (msg: string, duration = 6000) => {
    if (messageTimeout) clearTimeout(messageTimeout);
    setMessage(msg);
    const timeout = setTimeout(() => setMessage(''), duration);
    setMessageTimeout(timeout);
  };

  useEffect(() => {
    if (!sessionToken) return;
    fetchUsers();
    // Sync Airtable tracking stats into KV in the background so the
    // affiliates tab stats cards show real click/conversion/commission data.
    // After syncing we re-fetch users so the grid reflects the updated values.
    fetchTrackingActivity().then(() => fetchUsers()).catch(() => {});
  }, [sessionToken]);

  useEffect(() => () => { if (messageTimeout) clearTimeout(messageTimeout); }, [messageTimeout]);

  // ── API calls ────────────────────────────────────────────────────────────────

  const fetchUsers = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/users`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch { setMessageWithTimeout(`Server returned invalid response: ${responseText.substring(0, 100)}`, 8000); return; }

      if (response.ok) {
        const userList = data.users || [];
        setUsers(userList);
        if (userList.length === 0) {
          setMessageWithTimeout('No affiliates yet. Create your first affiliate to get started.', 8000);
        } else {
          setMessage('');
        }
      } else {
        setMessageWithTimeout(data.error || `Failed to fetch users (status ${response.status})`, 8000);
      }
    } catch (error: any) {
      if (error.message === 'Failed to fetch') {
        setMessageWithTimeout('Cannot connect to server. Make sure edge functions are deployed.', 8000);
      } else {
        setMessageWithTimeout(`Error loading users: ${error.message}`, 8000);
      }
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: newUserEmail,
            password: newUserPassword,
            name: newUserName,
            commissionRate: parseInt(newUserCommission),
          }),
        },
      );
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch { setMessageWithTimeout(`Server error: ${responseText.substring(0, 100)}`, 8000); return; }

      if (data.success) {
        setMessageWithTimeout('Affiliate created successfully!', 6000);
        setShowCreateModal(false);
        setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserCommission('100');
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to create affiliate', 8000);
      }
    } catch (error: any) {
      setMessageWithTimeout(`Network error: ${error.message}.`, 8000);
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete ${email}? This cannot be undone.`)) return;
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await response.json();
      if (data.success) { setMessageWithTimeout('Affiliate deleted successfully', 6000); await fetchUsers(); }
      else setMessageWithTimeout(data.error || 'Failed to delete affiliate', 8000);
    } catch { setMessageWithTimeout('Failed to delete affiliate', 8000); }
  };

  const resetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user/${selectedUser.id}/reset-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newPassword: resetPassword }),
        },
      );
      const data = await response.json();
      if (data.success) {
        setMessageWithTimeout(`Password reset for ${selectedUser.email}`, 6000);
        setShowResetModal(false); setResetPassword(''); setSelectedUser(null);
      } else { setMessageWithTimeout(data.error || 'Failed to reset password', 8000); }
    } catch { setMessageWithTimeout('Failed to reset password', 8000); }
  };

  const updateCommission = async (userId: string, rate: number) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user/${userId}/commission`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ commissionRate: rate }),
        },
      );
      const data = await response.json();
      if (data.success) { setMessageWithTimeout('Commission rate updated', 5000); setEditingCommission(null); await fetchUsers(); }
      else setMessageWithTimeout(data.error || 'Failed to update commission', 8000);
    } catch { setMessageWithTimeout('Failed to update commission', 8000); }
  };

  const editUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user/${selectedUser.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: editName, email: editEmail, phone: editPhone,
            address: editAddress, city: editCity, state: editState,
            zip: editZip, country: editCountry,
          }),
        },
      );
      const data = await response.json();
      if (data.success) { setMessageWithTimeout('User updated successfully', 5000); setShowEditModal(false); await fetchUsers(); }
      else setMessageWithTimeout(data.error || 'Failed to update user', 8000);
    } catch { setMessageWithTimeout('Failed to update user', 8000); }
  };

  const syncFromAirtable = async () => {
    setMessage(''); setSyncing(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/sync-airtable`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await response.json();
      if (data.success) {
        const summary = `Sync complete: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped${data.errors.length > 0 ? `, ${data.errors.length} errors` : ''}`;
        setMessageWithTimeout(summary, 10000);
        await fetchUsers();
      } else { setMessageWithTimeout(data.error || 'Failed to sync from Airtable', 8000); }
    } catch (error: any) { setMessageWithTimeout(`Sync failed: ${error.message}`, 8000); }
    finally { setSyncing(false); }
  };

  const syncTrackingFromAirtable = async () => {
    setMessage(''); setSyncingTracking(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/sync-tracking`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await response.json();
      if (data.success) { setMessageWithTimeout(data.message || 'Tracking data synced successfully', 8000); await fetchUsers(); }
      else setMessageWithTimeout(data.error || 'Failed to sync tracking data', 8000);
    } catch (error: any) { setMessageWithTimeout(`Tracking sync failed: ${error.message}`, 8000); }
    finally { setSyncingTracking(false); }
  };

  const loginAsUser = async (userId: string, email: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/login-as/${userId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await response.json();
      if (data.success && data.accessToken) { onLoginAsUser(email, data.accessToken); }
      else setMessageWithTimeout(data.error || 'Failed to login as user', 8000);
    } catch (error: any) { setMessageWithTimeout(`Login failed: ${error.message}`, 8000); }
  };

  const fetchTrackingActivity = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/tracking-activity`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await response.json();
      if (data.success) { setTrackingActivity(data.activity || []); }
      else setMessageWithTimeout(data.error || 'Failed to fetch tracking activity', 8000);
    } catch (error: any) { setMessageWithTimeout(`Failed to fetch tracking: ${error.message}`, 8000); }
  };

  const importCPAData = async () => {
    setMessage(''); setImportingCPA(true);
    try {
      // Pull CPA rates directly from Airtable (no CSV needed)
      const importResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/import-cpa-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );
      const data = await importResponse.json();
      if (data.success) {
        const summary = `CPA Sync: ${data.stats.uniqueCards} cards found in Airtable → ${data.stats.cardsUpdated} card links updated across ${data.stats.usersUpdated} affiliates`;
        setMessageWithTimeout(summary, 12000);
        await fetchUsers();
        // Also refresh CPA rates tab if it was loaded
        if (cpaRates.length > 0) await fetchCpaRates(cpaAffiliateFilter);
      } else {
        setMessageWithTimeout(data.error || 'Failed to sync CPA data from Airtable', 10000);
      }
    } catch (error: any) {
      setMessageWithTimeout(`Sync failed: ${error.message}`, 8000);
    } finally {
      setImportingCPA(false);
    }
  };

  const fetchCpaRates = async (userId = 'all') => {
    setCpaRatesLoading(true);
    try {
      const url = userId !== 'all'
        ? `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/cpa-rates?userId=${userId}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/cpa-rates`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Manager-Session': sessionToken,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      setCpaRates(data.rates || []);
      setCpaAffiliateLabel(data.affiliateName || '');
    } catch (err: any) {
      setMessageWithTimeout(`Failed to load CPA rates: ${err.message}`, 6000);
    } finally {
      setCpaRatesLoading(false);
    }
  };

  const fetchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/invoices`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await res.json();
      if (data.invoices) setInvoices(data.invoices);
      else setMessageWithTimeout(data.error || 'Failed to fetch invoices', 8000);
    } catch (err: any) {
      setMessageWithTimeout(`Failed to fetch invoices: ${err.message}`, 8000);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const updateInvoice = async (recordId: string, patch: Record<string, any>) => {
    setUpdatingInvoice(recordId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/invoices/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patch),
        },
      );
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.map(inv => inv.id === recordId ? { ...inv, ...data.invoice } : inv));
        setMessageWithTimeout('Invoice updated', 4000);
      } else {
        setMessageWithTimeout(data.error || 'Failed to update invoice', 8000);
      }
    } catch (err: any) {
      setMessageWithTimeout(`Update failed: ${err.message}`, 8000);
    } finally {
      setUpdatingInvoice(null);
    }
  };

  useEffect(() => {
    if ((activeTab === 'tracking' || activeTab === 'invoices') && trackingActivity.length === 0) {
      fetchTrackingActivity();
    }
    if (activeTab === 'cpa-rates' && cpaRates.length === 0) {
      fetchCpaRates(cpaAffiliateFilter);
    }
    if (activeTab === 'invoices' && invoices.length === 0) {
      fetchInvoices();
    }
  }, [activeTab]);

  // Renders a single affiliate table row — defined as a closure so it
  // captures all state/callbacks without prop drilling.
  const renderUserRow = (user: any) => (
    <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
      <td className="py-4 px-6">
        <div className="font-medium text-slate-900">{user.name || 'N/A'}</div>
        <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
      </td>
      <td className="py-4 px-6">
        <div className="text-xs text-slate-500 space-y-0.5">
          {user.phone && <div>{user.phone}</div>}
          {(user.city || user.state) && <div>{[user.city, user.state].filter(Boolean).join(', ')}</div>}
          {!user.phone && !user.city && !user.state && <span className="text-slate-300">—</span>}
        </div>
      </td>
      <td className="py-4 px-6">
        <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-mono">{user.affiliateId || 'N/A'}</code>
      </td>
      <td className="py-4 px-6 text-right">
        {editingCommission === user.id ? (
          <div className="flex items-center justify-end gap-2">
            <input type="number" value={commissionValue} onChange={e => setCommissionValue(e.target.value)}
              className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" min="0" max="100" />
            <button onClick={() => updateCommission(user.id, parseInt(commissionValue))} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
            <button onClick={() => setEditingCommission(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-medium text-slate-700">{user.commissionRate || 100}%</span>
            <button onClick={() => { setEditingCommission(user.id); setCommissionValue((user.commissionRate || 100).toString()); }}
              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
          </div>
        )}
      </td>
      <td className="py-4 px-6 text-right text-sm text-slate-700">{(user.stats?.totalClicks || 0).toLocaleString()}</td>
      <td className="py-4 px-6 text-right text-sm text-slate-700">{(user.stats?.totalConversions || 0).toLocaleString()}</td>
      <td className="py-4 px-6 text-right text-sm font-semibold text-slate-900">${Math.round(user.stats?.totalCommissions || 0).toLocaleString()}</td>
      <td className="py-4 px-6 text-right text-xs text-slate-500">{formatDate(user.createdAt)}</td>
      <td className="py-4 px-6">
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => loginAsUser(user.id, user.email)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Login as this affiliate"><LogIn className="w-4 h-4" /></button>
          <button onClick={() => { setSelectedUser(user); setEditName(user.name||''); setEditEmail(user.email||''); setEditPhone(user.phone||''); setEditAddress(user.address||''); setEditCity(user.city||''); setEditState(user.state||''); setEditZip(user.zip||''); setEditCountry(user.country||''); setShowEditModal(true); }}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit affiliate"><Edit className="w-4 h-4" /></button>
          <button onClick={() => { setSelectedUser(user); setShowResetModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Reset password"><Key className="w-4 h-4" /></button>
          <button onClick={() => deleteUser(user.id, user.email)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete affiliate"><Trash2 className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          </div>
          <p className="text-slate-500 text-sm">Loading manager dashboard…</p>
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
              <div className="p-1">
                <svg width="36" height="34" viewBox="0 0 39 37" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0_mgr_logo)">
                    <mask id="mask0_mgr_logo" style={{maskType:'luminance'}} maskUnits="userSpaceOnUse" x="0" y="0" width="38" height="37">
                      <path d="M37.9056 0H0.00134277V36.2562H37.9056V0Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask0_mgr_logo)">
                      <path d="M17.6325 28.7049C17.6325 27.4888 17.6339 26.2735 17.6306 25.0575C17.6306 24.9135 17.6098 24.7681 17.5877 24.6248C17.5561 24.4184 17.4167 24.2985 17.2145 24.2947C16.9954 24.2908 16.8516 24.4228 16.8153 24.6368C16.7939 24.7605 16.8004 24.8892 16.8023 25.0156C16.8361 27.4471 16.86 29.8777 16.9152 32.3084C16.9249 32.7388 16.7589 33.0015 16.4155 33.2193C15.5412 33.7745 14.5827 34.1421 13.6009 34.4582C12.457 34.8269 11.3106 35.1841 10.1006 35.2964C9.1318 35.386 8.2362 34.9867 7.86482 34.2759C7.60237 33.7733 7.62117 33.289 7.90504 32.7998C8.49669 31.7798 9.38199 31.0157 10.2355 30.2249C10.5491 29.9343 10.8602 29.6422 11.1363 29.3167C11.5011 28.887 11.4959 28.3559 11.5374 27.8455C11.6119 26.9203 11.6573 25.9931 11.7189 25.0663C11.7552 24.5258 11.7377 23.9907 11.5731 23.4683C11.4396 23.0451 11.1505 22.7754 10.728 22.6185C10.0877 22.3799 9.42665 22.3463 8.75463 22.3933C7.93804 22.4503 7.12153 22.5131 6.30496 22.5697C5.16566 22.6484 4.02636 22.7207 2.88706 22.8025C2.42046 22.8361 1.95775 22.8407 1.51577 22.6706C1.09905 22.5107 0.848902 22.2193 0.838535 21.7611C0.817147 20.8199 0.91306 19.8825 0.938341 18.9432C0.953896 18.3841 1.02259 17.8268 1.04203 17.2683C1.09582 15.7172 1.19886 14.1693 1.31617 12.622C1.43865 11.0024 1.55853 9.38268 1.70824 7.76561C1.77303 7.06307 1.80804 6.3573 1.94867 5.66108C2.23382 4.25024 3.05362 3.34013 4.4852 2.96568C5.73077 2.6401 7.00162 2.52332 8.28416 2.47001C9.4604 2.42116 10.6379 2.4478 11.8129 2.3964C13.2108 2.33547 14.6055 2.20029 16.002 2.10699C16.8516 2.04988 17.7031 2.02449 18.5521 1.96039C19.9473 1.85567 21.3472 1.81569 22.7392 1.66083C24.0321 1.51739 25.3276 1.40378 26.6205 1.26098C27.8033 1.13025 28.9912 1.2464 30.1759 1.14929C31.4195 1.0471 32.6688 1.00268 33.9066 0.833222C35.4666 0.619345 36.67 1.37903 37.0141 2.83558C37.1191 3.28048 37.0795 3.74314 37.0343 4.19375C36.9001 5.51575 36.7542 6.83646 36.5949 8.15531C36.4328 9.49376 36.1685 10.8171 35.939 12.1454C35.6883 13.5956 35.4375 15.0458 35.1736 16.4934C35.0176 17.3527 34.8373 18.2077 34.6675 19.0644C34.4724 20.0501 33.8076 20.5889 32.8699 20.8529C31.9859 21.1017 31.0714 21.1645 30.1603 21.2357C28.807 21.3411 27.4532 21.4381 26.1002 21.5389C25.4463 21.5878 24.7917 21.6234 24.1508 21.7865C23.1074 22.0524 22.7691 22.6584 22.7489 23.5463C22.7147 25.0683 22.7379 26.5921 22.7399 28.1146C22.7405 28.727 23.0548 29.1968 23.4663 29.6213C24.0776 30.2523 24.7988 30.7554 25.4785 31.3082C25.7022 31.4898 25.9161 31.6866 26.1111 31.8966C26.7747 32.6118 26.8687 33.4293 26.5369 34.3159C26.4313 34.5977 26.2045 34.7487 25.9369 34.856C25.43 35.059 24.8953 35.1226 24.3562 35.127C22.43 35.1434 20.5979 34.7227 18.8651 33.9122C18.3486 33.6704 17.8743 33.3443 17.7395 32.7268C17.7141 32.6106 17.7084 32.4971 17.7084 32.3821C17.707 31.1559 17.7077 29.9299 17.7077 28.703C17.6831 28.703 17.6584 28.703 17.6339 28.703L17.6325 28.7049ZM18.6416 17.514C18.7906 17.495 18.9396 17.4703 19.0894 17.4575C20.552 17.3369 21.9984 16.1501 22.3907 14.752C22.4521 14.5323 22.3809 14.3712 22.1812 14.2842C21.9836 14.1985 21.7962 14.241 21.6751 14.4333C21.6252 14.5126 21.5974 14.6053 21.5611 14.6923C21.3575 15.1778 21.0627 15.6012 20.6642 15.9533C19.9248 16.6065 19.0452 16.7867 18.0856 16.6674C16.7602 16.503 15.7395 15.933 15.2917 14.616C15.1814 14.293 14.9696 14.1636 14.7155 14.2733C14.4335 14.3953 14.4523 14.632 14.5295 14.8687C14.7266 15.4742 15.059 15.9965 15.5418 16.4244C16.4225 17.2049 17.4951 17.455 18.6416 17.514ZM18.3623 13.7149C18.7789 13.7251 19.1756 13.6438 19.5502 13.4642C20.0854 13.2072 20.3913 12.7147 20.3524 12.1689C20.3077 11.5482 19.974 11.1204 19.357 10.9523C18.6428 10.7574 17.9495 10.8145 17.3072 11.2055C16.4407 11.7329 16.4186 12.8657 17.2606 13.4223C17.5937 13.6425 17.9636 13.7314 18.3623 13.7149ZM12.4538 11.4834C12.8912 11.4879 13.2302 11.1629 13.2341 10.7339C13.238 10.3207 12.8822 9.95521 12.4719 9.95009C12.0559 9.94503 11.6936 10.2966 11.6839 10.7161C11.6742 11.1319 12.0222 11.4784 12.4545 11.4834H12.4538ZM25.4229 10.4458C25.4288 10.0161 25.1119 9.69181 24.6847 9.68865C24.2809 9.68609 23.9149 10.0383 23.9096 10.435C23.9052 10.8119 24.2577 11.1591 24.6555 11.1699C25.0859 11.182 25.4171 10.8697 25.4222 10.4458H25.4229Z" fill="#50C8FD"/>
                      <path d="M18.3577 12.928C18.0285 12.9438 17.7343 12.8759 17.5379 12.5891C17.394 12.3784 17.4057 12.1766 17.5898 11.9868C17.9487 11.6168 18.8696 11.5039 19.3116 11.7786C19.6428 11.9849 19.6272 12.4857 19.2824 12.7084C19.068 12.8468 18.729 12.9273 18.3577 12.928Z" fill="#50C8FD"/>
                    </g>
                  </g>
                  <defs>
                    <clipPath id="clip0_mgr_logo">
                      <rect width="38.4" height="36.3765" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              </div>
              <div>
                <h1 className="text-white font-semibold text-lg tracking-tight leading-none">Manager Portal</h1>
                <p className="text-slate-400 text-xs mt-0.5 hidden sm:block">Welcome, {managerName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Actions dropdown */}
              {(() => {
                const anyBusy = syncing || syncingTracking || importingCPA;
                return (
                  <div className="relative">
                    <button
                      onClick={() => setActionsOpen(o => !o)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium"
                    >
                      {anyBusy
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Actions
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {actionsOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
                        <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg ring-1 ring-slate-900/10 z-20 overflow-hidden">
                          <div className="py-1">
                            <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Sync</p>
                            <button
                              onClick={() => { setActionsOpen(false); syncFromAirtable(); }}
                              disabled={syncing}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-violet-600 ${syncing ? 'animate-spin' : ''}`} />
                              {syncing ? 'Syncing affiliates…' : 'Sync Affiliates'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); syncTrackingFromAirtable(); }}
                              disabled={syncingTracking}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncingTracking ? 'animate-spin' : ''}`} />
                              {syncingTracking ? 'Syncing tracking…' : 'Sync Tracking'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); importCPAData(); }}
                              disabled={importingCPA}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-orange-500 ${importingCPA ? 'animate-spin' : ''}`} />
                              {importingCPA ? 'Importing…' : 'Import CPA Rates'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-xl text-sm ${
            message.includes('success') || message.includes('updated')
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60'
              : message.includes('No affiliates') || message.includes('get started')
              ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200/60'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200/60'
          }`}>
            {message}
          </div>
        )}

        {/* ── Compact summary bar — all panels in one card, max 30vh ── */}
        {(() => {
          const chartData = [...users as any[]]
            .filter(u => (u.stats?.totalCommissions || 0) > 0)
            .sort((a, b) => (b.stats?.totalCommissions || 0) - (a.stats?.totalCommissions || 0))
            .slice(0, 8)
            .map(u => ({
              name: (u.name || u.email || '').split(' ')[0],
              earnings: Math.round(u.stats?.totalCommissions || 0),
              clicks: u.stats?.totalClicks || 0,
              approvals: u.stats?.totalConversions || 0,
            }));
          const CHART_COLORS = ['#6366f1','#8b5cf6','#a78bfa','#818cf8','#c4b5fd','#ddd6fe','#ede9fe','#f5f3ff'];
          const anyVisible = visiblePanels.has('stats') || visiblePanels.has('charts') || visiblePanels.has('topCards');
          const statRows = [
            { label: 'Affiliates',   value: users.length.toLocaleString(),                          iconColor: 'text-indigo-600',  bgColor: 'bg-indigo-50',  Icon: Users,        sub: null },
            { label: 'Clicks',       value: totalStats.clicks.toLocaleString(),                     iconColor: 'text-blue-600',    bgColor: 'bg-blue-50',    Icon: TrendingUp,   sub: null },
            { label: 'Approvals',    value: totalStats.conversions.toLocaleString(),                 iconColor: 'text-emerald-600', bgColor: 'bg-emerald-50', Icon: CheckCircle,  sub: totalStats.clicks > 0 ? `${((totalStats.conversions / totalStats.clicks) * 100).toFixed(1)}% conv.` : null },
            { label: 'Commissions',  value: `$${Math.round(totalStats.commissions).toLocaleString()}`, iconColor: 'text-violet-600', bgColor: 'bg-violet-50',  Icon: DollarSign,   sub: totalStats.clicks > 0 && totalStats.commissions > 0 ? `EPC $${(totalStats.commissions / totalStats.clicks).toFixed(2)}` : null },
          ];
          return (
            <div className="mb-6 bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm overflow-hidden">
              {/* Toggle chips row */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
                <span className="text-[11px] font-medium text-slate-400 mr-0.5">Show:</span>
                {(['stats', 'charts', 'topCards'] as const).map(key => {
                  const labels = { stats: 'Stats', charts: 'Charts', topCards: 'Top Cards' };
                  return (
                    <button key={key} onClick={() => togglePanel(key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border ${
                        visiblePanels.has(key)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}>
                      {labels[key]}
                    </button>
                  );
                })}
              </div>
              {/* Content row — height fills to 30vh minus toggle row */}
              {anyVisible && (
                <div className="overflow-x-auto">
                <div className="flex divide-x divide-slate-100 min-w-max"
                  style={{ height: 'clamp(120px, calc(30vh - 44px), 220px)' }}>

                  {/* Stats column */}
                  {visiblePanels.has('stats') && (
                    <div className="flex-none w-48 flex flex-col justify-center gap-0.5 px-3 py-2 overflow-hidden">
                      {statRows.map(({ label, value, iconColor, bgColor, Icon, sub }) => (
                        <div key={label} className="flex items-center gap-2 py-1">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${bgColor}`}>
                            <Icon className={`w-3 h-3 ${iconColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] text-slate-400 leading-none">{label}</div>
                            <div className="text-sm font-bold text-slate-900 leading-snug">{value}</div>
                          </div>
                          {sub && <div className="text-[10px] text-slate-400 flex-shrink-0">{sub}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Charts */}
                  {visiblePanels.has('charts') && chartData.length > 0 && (
                    <div className="flex-1 min-w-0 flex divide-x divide-slate-100 overflow-hidden">
                      <div className="flex-1 min-w-0 px-3 py-2 flex flex-col overflow-hidden">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Top Earners</div>
                        <div className="flex-1 min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={32} />
                              <Tooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Earnings']}
                                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                              <Bar dataKey="earnings" radius={[3,3,0,0]}>
                                {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 px-3 py-2 flex flex-col overflow-hidden">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Clicks vs Approvals</div>
                        <div className="flex-1 min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} />
                              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                              <Bar dataKey="clicks" name="Clicks" fill="#bfdbfe" radius={[2,2,0,0]} />
                              <Bar dataKey="approvals" name="Approvals" fill="#6366f1" radius={[2,2,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Cards */}
                  {visiblePanels.has('topCards') && mostApprovedCards.length > 0 && (
                    <div className="flex-none w-52 px-3 py-2 overflow-y-auto">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Award className="w-3 h-3 text-emerald-500" /> Top Cards
                      </div>
                      {mostApprovedCards.map((c, idx) => (
                        <div key={c.name} className="flex items-center gap-1.5 py-0.5 min-w-0">
                          <span className={`text-[10px] font-bold flex-shrink-0 w-4 ${
                            idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-500' : 'text-slate-300'
                          }`}>#{idx + 1}</span>
                          <span className="text-xs text-slate-700 truncate flex-1 min-w-0">{c.name}</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1">{c.approvals}×</span>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Tabs.List className="flex border-b border-slate-200 mb-6 overflow-x-auto">
            <Tabs.Trigger
              value="affiliates"
              className="px-4 sm:px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px whitespace-nowrap"
            >
              Affiliates
            </Tabs.Trigger>
            <Tabs.Trigger
              value="tracking"
              className="px-4 sm:px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px whitespace-nowrap"
            >
              Activity
            </Tabs.Trigger>
            <Tabs.Trigger
              value="cpa-rates"
              className="px-4 sm:px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px whitespace-nowrap"
            >
              CPA Rates
            </Tabs.Trigger>
            <Tabs.Trigger
              value="invoices"
              className="px-4 sm:px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px whitespace-nowrap"
            >
              <span className="flex items-center gap-1.5">
                Invoices
                {invoices.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{invoices.length}</span>}
              </span>
            </Tabs.Trigger>
          </Tabs.List>

          {/* ── Affiliates Tab ── */}
          <Tabs.Content value="affiliates">

            {/* Toolbar: Search + Date filter + Group + Create */}
            <div className="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm p-4 mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={affiliateSearch}
                    onChange={e => setAffiliateSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                  />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {/* Group by Commission Rate toggle */}
                  <button
                    onClick={() => { setAffiliateGroupBy(g => !g); setAffiliateCollapsed(new Set()); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      affiliateGroupBy
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'text-slate-600 bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Group by Rate
                  </button>
                  {affiliateGroupBy && users.length > 0 && (() => {
                    const allRates = Array.from(new Set(displayUsers.map((u: any) => String(u.commissionRate || 50) + '%')));
                    const allCollapsed = allRates.every(r => affiliateCollapsed.has(r));
                    return (
                      <button
                        onClick={() => setAffiliateCollapsed(allCollapsed ? new Set() : new Set(allRates))}
                        className="text-xs text-slate-500 hover:text-indigo-600 transition-colors"
                      >
                        {allCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Create Affiliate
                  </button>
                </div>
              </div>

              {/* Date filter row */}
              <div className="flex flex-wrap items-center gap-3">
                <FilterBar
                  filter={affiliatesFilter}     setFilter={setAffiliatesFilter}
                  customFrom={affiliatesCustomFrom} setCustomFrom={setAffiliatesCustomFrom}
                  customTo={affiliatesCustomTo}     setCustomTo={setAffiliatesCustomTo}
                />
                {(affiliateSearch || affiliatesFilter !== 'all') && (
                  <span className="text-xs text-slate-500 ml-1">
                    {displayUsers.length} of {users.length} members
                    {affiliateSearch && <button onClick={() => setAffiliateSearch('')} className="text-indigo-600 hover:underline ml-2">Clear search</button>}
                  </span>
                )}
              </div>
            </div>

            {/* Affiliates Table */}
            <div className="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/80 border-b border-slate-100">
                    <tr>
                      <SortTh label="Affiliate"     field="name"             sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} />
                      <th className="text-left py-3.5 px-6 text-slate-500 text-xs font-semibold uppercase tracking-wider">Contact Info</th>
                      <th className="text-left py-3.5 px-6 text-slate-500 text-xs font-semibold uppercase tracking-wider">Affiliate ID</th>
                      <SortTh label="Commission %"  field="commissionRate"   sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Clicks"        field="totalClicks"      sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Conversions"   field="totalConversions" sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Earned"        field="totalCommissions" sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Joined"        field="createdAt"        sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <th className="text-right py-3.5 px-6 text-slate-500 text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliateGroupBy ? (
                      // Grouped by commission rate
                      (() => {
                        const groups: Record<string, any[]> = {};
                        displayUsers.forEach((u: any) => {
                          const key = `${u.commissionRate || 50}%`;
                          if (!groups[key]) groups[key] = [];
                          groups[key].push(u);
                        });
                        return Object.entries(groups)
                          .sort(([a], [b]) => Number(b.replace('%','')) - Number(a.replace('%','')))
                          .map(([rate, members]) => {
                            const isCollapsed = affiliateCollapsed.has(rate);
                            const toggle = () => setAffiliateCollapsed(prev => {
                              const next = new Set(prev);
                              next.has(rate) ? next.delete(rate) : next.add(rate);
                              return next;
                            });
                            return (
                              <React.Fragment key={`group-${rate}`}>
                                <tr onClick={toggle} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                                  <td colSpan={9} className="py-2.5 px-6">
                                    <div className="flex items-center gap-2">
                                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{rate} Commission</span>
                                      <span className="text-xs font-normal text-slate-400 ml-0.5">({members.length} {members.length === 1 ? 'member' : 'members'})</span>
                                    </div>
                                  </td>
                                </tr>
                                {!isCollapsed && members.map((user: any) => renderUserRow(user))}
                            </React.Fragment>
                          );
                        });
                      })()
                    ) : (
                      displayUsers.map((user: any) => renderUserRow(user))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Tabs.Content>

          {/* ── Tracking Activity Tab ── */}
          <Tabs.Content value="tracking">
            <div className="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">All Tracking Activity</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {displayTrackingActivity.length}
                      {(mgTrackingFilter !== 'all' || mgTrackingStatusFilter !== 'all' || mgTrackingAffiliateFilter !== 'all')
                        ? ` of ${trackingActivity.length}` : ''} records
                    </p>
                    <div className="mt-1">
                      <LoadMoreYears showAll={trackingShowAllYears} setShowAll={setTrackingShowAllYears} hiddenCount={trackingHiddenOlderCount} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Group by segmented control */}
                    <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-1 text-xs font-medium">
                      {([
                        { value: 'none',      label: 'No Group' },
                        { value: 'month',     label: 'Month' },
                        { value: 'affiliate', label: 'Affiliate' },
                      ] as { value: 'none'|'month'|'affiliate'; label: string }[]).map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => { setTrackingGroupBy(value); setTrackingCollapsed(new Set()); }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all ${
                            trackingGroupBy === value
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {value !== 'none' && <Layers className="w-3 h-3" />}
                          {label}
                        </button>
                      ))}
                    </div>
                    {trackingGroupBy !== 'none' && displayTrackingActivity.length > 0 && (() => {
                      const allKeys = Array.from(new Set(displayTrackingActivity.map((a: any) =>
                        trackingGroupBy === 'month'
                          ? (() => { const d = parseLocalDate(a.clickDate); return isNaN(d.getTime()) ? '0000-00' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })()
                          : (a.affiliateId || 'unknown')
                      )));
                      const allCollapsed = allKeys.every(k => trackingCollapsed.has(k));
                      return (
                        <button onClick={() => setTrackingCollapsed(allCollapsed ? new Set() : new Set(allKeys))}
                          className="text-xs text-slate-500 hover:text-indigo-600 transition-colors">
                          {allCollapsed ? 'Expand All' : 'Collapse All'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={fetchTrackingActivity}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Date filter */}
                <FilterBar
                  filter={mgTrackingFilter}         setFilter={setMgTrackingFilter}
                  customFrom={mgTrackingCustomFrom} setCustomFrom={setMgTrackingCustomFrom}
                  customTo={mgTrackingCustomTo}     setCustomTo={setMgTrackingCustomTo}
                />

                {/* Status filter */}
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
                      onClick={() => setMgTrackingStatusFilter(value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        mgTrackingStatusFilter === value
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Affiliate filter */}
                {affiliateOptions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-400 mr-1">Affiliate:</span>
                    <select
                      value={mgTrackingAffiliateFilter}
                      onChange={(e) => setMgTrackingAffiliateFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                    >
                      <option value="all">All affiliates</option>
                      {affiliateOptions.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    {mgTrackingAffiliateFilter !== 'all' && (
                      <button
                        onClick={() => setMgTrackingAffiliateFilter('all')}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/80 border-b border-slate-100 sticky top-0">
                    <tr>
                      <SortThSm label="Date / Time"  field="clickDate"     sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} />
                      <SortThSm label="Affiliate"    field="memberName"    sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} />
                      <SortThSm label="Card"         field="cardName"      sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} />
                      <SortThSm label="Status"       field="status"        sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} />
                      <SortThSm label="Earnings"     field="totalEarnings" sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} align="right" />
                      <SortThSm label="Device"       field="deviceType"    sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} />
                      <SortThSm label="Location"     field="state"         sort={mgTrackingSort} onSort={(f) => setMgTrackingSort(toggleSort(mgTrackingSort, f))} />
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Single row renderer — used in both flat and grouped modes
                      const TrackRow = ({ a }: { a: any }) => (
                        <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 text-sm">
                            <div className="font-medium text-slate-900">{formatDate(a.clickDate)}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{formatTime(a.clickTime)}</div>
                          </td>
                          <td className="py-3.5 px-4 text-sm">
                            <div className="font-medium text-slate-900">{a.memberName}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{a.affiliateId}</div>
                          </td>
                          <td className="py-3.5 px-4 text-sm text-slate-700">{a.cardName}</td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              a.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                              a.status === 'application' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70' :
                              'bg-slate-100 text-slate-600'
                            }`}>{a.status}</span>
                          </td>
                          <td className="py-3.5 px-4 text-sm text-right font-semibold text-slate-900">
                            {a.totalEarnings > 0 ? `$${a.totalEarnings.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-sm text-slate-500">{a.deviceType || '—'}</td>
                          <td className="py-3.5 px-4 text-sm text-slate-500">{a.state || '—'}</td>
                        </tr>
                      );

                      // Flat mode
                      if (trackingGroupBy === 'none')
                        return displayTrackingActivity.map((a: any) => <TrackRow key={a.id} a={a} />);

                      // Grouped mode — shared logic for month + affiliate
                      const getKey = (a: any) => trackingGroupBy === 'month'
                        ? (() => { const d = parseLocalDate(a.clickDate); return isNaN(d.getTime()) ? '0000-00' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })()
                        : (a.affiliateId || 'unknown');

                      const getLabel = (key: string, rows: any[]) => {
                        if (trackingGroupBy === 'month') {
                          if (key === '0000-00') return 'Unknown Date';
                          const [y, m] = key.split('-');
                          return new Date(parseInt(y), parseInt(m)-1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        }
                        // affiliate: show name, fall back to affiliateId
                        return String(rows[0]?.memberName || key);
                      };

                      const groups: Record<string, any[]> = {};
                      displayTrackingActivity.forEach((a: any) => {
                        const k = getKey(a);
                        if (!groups[k]) groups[k] = [];
                        groups[k].push(a);
                      });

                      const sortedEntries = Object.entries(groups).sort(([ka, ra], [kb, rb]) =>
                        trackingGroupBy === 'month'
                          ? kb.localeCompare(ka)                                            // newest first
                          : String(getLabel(ka, ra)).localeCompare(String(getLabel(kb, rb))) // A–Z
                      );

                      return sortedEntries.map(([key, rows]) => {
                        const isCollapsed = trackingCollapsed.has(key);
                        const toggle = () => setTrackingCollapsed(prev => {
                          const next = new Set(prev);
                          next.has(key) ? next.delete(key) : next.add(key);
                          return next;
                        });
                        const grpClicks    = rows.reduce((s: number, r: any) => s + (r.clicks       || 0), 0);
                        const grpApps      = rows.reduce((s: number, r: any) => s + (r.applications || 0), 0);
                        const grpApprovals = rows.reduce((s: number, r: any) => s + (r.approvals    || 0), 0);
                        const grpEarnings  = rows.reduce((s: number, r: any) => s + (r.totalEarnings|| 0), 0);
                        const label        = getLabel(key, rows);
                        // Show affiliateId as sub-label when grouped by affiliate
                        const sublabel     = trackingGroupBy === 'affiliate' ? key : undefined;
                        return (
                          <React.Fragment key={key}>
                            <tr onClick={toggle} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                              <td colSpan={7} className="py-2.5 px-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{label}</span>
                                    {sublabel && <span className="text-xs text-slate-400 font-mono normal-case">{sublabel}</span>}
                                    <span className="text-xs font-normal text-slate-400">({rows.length} records)</span>
                                  </div>
                                  <div className="flex items-center gap-3 ml-2 text-xs text-slate-500">
                                    {grpClicks    > 0 && <span>{grpClicks.toLocaleString()} clicks</span>}
                                    {grpApps      > 0 && <span>{grpApps} apps</span>}
                                    {grpApprovals > 0 && <span>{grpApprovals} approvals</span>}
                                    {grpEarnings  > 0 && <span className="font-medium text-emerald-600">${grpEarnings.toFixed(2)}</span>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                            {!isCollapsed && rows.map((a: any) => <TrackRow key={a.id} a={a} />)}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </Tabs.Content>

          {/* ── CPA Rates Tab ── */}
          <Tabs.Content value="cpa-rates">
            <div className="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm overflow-hidden">
              {/* Toolbar */}
              <div className="p-5 border-b border-slate-100 space-y-3">
                {/* Row 1: Search + Affiliate + Refresh */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search cards…"
                      value={cpaSearch}
                      onChange={e => setCpaSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                    />
                  </div>

                  {/* Affiliate */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Affiliate:</span>
                    <select
                      value={cpaAffiliateFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCpaAffiliateFilter(val);
                        fetchCpaRates(val);
                      }}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                    >
                      <option value="all">All (bank CPA only)</option>
                      {(users as any[]).map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} ({u.commissionRate || 50}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {/* Group by issuer toggle */}
                    <button
                      onClick={() => { setCpaGroupBy(g => !g); setCpaCollapsed(new Set()); }}
                      title="Group by issuer"
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        cpaGroupBy
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'text-slate-600 bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Group by Issuer
                    </button>
                    {/* Collapse All / Expand All — only when grouped */}
                    {cpaGroupBy && cpaRates.length > 0 && (() => {
                      const allIssuers = Array.from(new Set(cpaRates.map(r => r.issuer || 'Other')));
                      const allCollapsed = allIssuers.every(i => cpaCollapsed.has(i));
                      return (
                        <button
                          onClick={() => setCpaCollapsed(allCollapsed ? new Set() : new Set(allIssuers))}
                          className="text-xs text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                          {allCollapsed ? 'Expand All' : 'Collapse All'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => fetchCpaRates(cpaAffiliateFilter)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Row 2: Issuer filter + CPA range */}
                {cpaRates.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Issuer dropdown */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">Issuer:</span>
                      <select
                        value={cpaIssuerFilter}
                        onChange={e => setCpaIssuerFilter(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                      >
                        <option value="all">All issuers</option>
                        {Array.from(new Set(cpaRates.map(r => r.issuer).filter(Boolean))).sort().map((iss: any) => (
                          <option key={iss} value={iss}>{iss}</option>
                        ))}
                      </select>
                    </div>

                    {/* CPA range pills */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-400">Payout:</span>
                      {([
                        { value: 'all',    label: 'All' },
                        { value: 'lt100',  label: '<$100' },
                        { value: '100-299', label: '$100–$299' },
                        { value: '300plus', label: '$300+' },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setCpaCpaRange(value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            cpaCpaRange === value
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Active filter summary */}
                    {(cpaSearch || cpaIssuerFilter !== 'all' || cpaCpaRange !== 'all') && (
                      <button
                        onClick={() => { setCpaSearch(''); setCpaIssuerFilter('all'); setCpaCpaRange('all'); }}
                        className="text-xs text-indigo-600 hover:underline ml-1"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {cpaRatesLoading ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Loading CPA rates from Airtable…</p>
                </div>
              ) : cpaRates.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-slate-500 text-sm">No CPA rates found. Try refreshing.</p>
                </div>
              ) : (() => {
                // Apply all filters + sort
                const refPayout = (r: any) => cpaAffiliateFilter !== 'all' ? (r.affiliatePayout ?? r.bankCpa) : r.bankCpa;
                const cpaHiddenOlderCount = (cpaRates as any[])
                  .filter((r: any) => { const y = yearOf(r.date); return y !== null && y !== CURRENT_YEAR; }).length;
                const filtered = applySort(cpaRates, cpaSort).filter(r => {
                  if (!(cpaShowAllYears || yearOf(r.date) === null || yearOf(r.date) === CURRENT_YEAR)) return false;
                  if (cpaSearch && !r.card.toLowerCase().includes(cpaSearch.toLowerCase()) &&
                      !(r.issuer || '').toLowerCase().includes(cpaSearch.toLowerCase())) return false;
                  if (cpaIssuerFilter !== 'all' && r.issuer !== cpaIssuerFilter) return false;
                  const amt = refPayout(r) || 0;
                  if (cpaCpaRange === 'lt100'   && !(amt < 100))               return false;
                  if (cpaCpaRange === '100-299'  && !(amt >= 100 && amt < 300)) return false;
                  if (cpaCpaRange === '300plus'  && !(amt >= 300))              return false;
                  return true;
                });

                const CpaRow = ({ rate }: { rate: any }) => (
                  <tr className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-medium text-sm text-slate-900">{rate.card}</td>
                    {!cpaGroupBy && <td className="py-3 px-4 text-sm text-slate-500">{rate.issuer || '—'}</td>}
                    <td className="py-3 px-4 text-right font-semibold text-sm text-slate-900">
                      {rate.bankCpa > 0 ? `$${rate.bankCpa.toLocaleString()}` : <span className="text-slate-300 font-normal">—</span>}
                    </td>
                    {cpaAffiliateFilter !== 'all' && (
                      <td className="py-3 px-4 text-right font-semibold text-sm text-indigo-600">
                        {rate.affiliatePayout != null && rate.affiliatePayout > 0
                          ? `$${rate.affiliatePayout.toLocaleString()}`
                          : <span className="text-slate-300 font-normal">—</span>}
                      </td>
                    )}
                    <td className="py-3 px-4 text-sm text-slate-500">{formatDate(rate.date)}</td>
                  </tr>
                );

                if (filtered.length === 0) return (
                  <div className="text-center py-16">
                    <p className="text-slate-500 text-sm">No cards match the filters.</p>
                    <button onClick={() => { setCpaSearch(''); setCpaIssuerFilter('all'); setCpaCpaRange('all'); }} className="text-xs text-indigo-600 hover:underline mt-2">Clear filters</button>
                  </div>
                );

                return (
                  <div className="overflow-x-auto">
                    <div className="flex items-center justify-between px-5 py-2 flex-wrap gap-2">
                      <p className="text-xs text-slate-400">
                        {filtered.length}{filtered.length !== cpaRates.length ? ` of ${cpaRates.length}` : ''} cards
                        {cpaAffiliateLabel ? ` · ${cpaAffiliateLabel}` : ''}
                      </p>
                      <LoadMoreYears showAll={cpaShowAllYears} setShowAll={setCpaShowAllYears} hiddenCount={cpaHiddenOlderCount} />
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                          <SortThSm label="Card"     field="card"    sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} />
                          {!cpaGroupBy && <SortThSm label="Issuer" field="issuer" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} />}
                          <SortThSm label="Bank CPA" field="bankCpa" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} align="right" />
                          {cpaAffiliateFilter !== 'all' && (
                            <SortThSm label="Affiliate Payout" field="affiliatePayout" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} align="right" />
                          )}
                          <SortThSm label="Rate Date" field="date" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} />
                        </tr>
                      </thead>
                      <tbody>
                        {cpaGroupBy ? (
                          // Grouped by issuer with collapse/expand
                          (() => {
                            const groups: Record<string, any[]> = {};
                            filtered.forEach(r => {
                              const key = r.issuer || 'Other';
                              if (!groups[key]) groups[key] = [];
                              groups[key].push(r);
                            });
                            const colCount = cpaAffiliateFilter !== 'all' ? 4 : 3;
                            return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([issuer, rates]) => {
                              const isCollapsed = cpaCollapsed.has(issuer);
                              const toggle = () => setCpaCollapsed(prev => {
                                const next = new Set(prev);
                                next.has(issuer) ? next.delete(issuer) : next.add(issuer);
                                return next;
                              });
                              return (
                                <React.Fragment key={`group-${issuer}`}>
                                  <tr
                                    onClick={toggle}
                                    className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                  >
                                    <td colSpan={colCount} className="py-2.5 px-4">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{issuer}</span>
                                        <span className="text-xs font-normal text-slate-400 ml-0.5">({rates.length} {rates.length === 1 ? 'card' : 'cards'})</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {!isCollapsed && rates.map(r => <CpaRow key={r.id} rate={r} />)}
                                </React.Fragment>
                              );
                            });
                          })()
                        ) : (
                          filtered.map(r => <CpaRow key={r.id} rate={r} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </Tabs.Content>
          {/* ── Invoices Tab ── */}
          <Tabs.Content value="invoices">
            <div className="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-sm overflow-hidden">
              {/* Toolbar */}
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Affiliate filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Affiliate:</span>
                    <select
                      value={invoiceAffiliateFilter}
                      onChange={e => setInvoiceAffiliateFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                    >
                      <option value="all">All affiliates</option>
                      {Array.from(new Set(invoices.map((inv: any) => inv.email).filter(Boolean))).sort().map((email: any) => (
                        <option key={email} value={email}>{invoices.find((inv: any) => inv.email === email)?.name || email}</option>
                      ))}
                    </select>
                  </div>
                  {/* Month filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Month:</span>
                    <select
                      value={invoiceMonthFilter}
                      onChange={e => setInvoiceMonthFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                    >
                      <option value="all">All months</option>
                      {Array.from(new Set(invoices.map((inv: any) => inv.month).filter(Boolean))).map((m: any) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  {/* Status filter */}
                  {Array.from(new Set(invoices.map((inv: any) => inv.status).filter(Boolean))).length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Status:</span>
                      <select
                        value={invoiceStatusFilter}
                        onChange={e => setInvoiceStatusFilter(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700"
                      >
                        <option value="all">All statuses</option>
                        {Array.from(new Set(invoices.map((inv: any) => inv.status).filter(Boolean))).map((s: any) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Group by segmented control */}
                  <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-1 text-xs font-medium">
                    {([
                      { value: 'none',      label: 'No Group' },
                      { value: 'month',     label: 'Month' },
                      { value: 'affiliate', label: 'Affiliate' },
                    ] as { value: 'none'|'month'|'affiliate'; label: string }[]).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => { setInvoiceGroupBy(value); setInvoiceCollapsed(new Set()); }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all ${
                          invoiceGroupBy === value
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {value !== 'none' && <Layers className="w-3 h-3" />}
                        {label}
                      </button>
                    ))}
                  </div>
                  {invoiceGroupBy !== 'none' && (() => {
                    const allKeys = Array.from(new Set((applySort(
                      invoices.filter((inv: any) =>
                        (invoiceAffiliateFilter === 'all' || inv.email === invoiceAffiliateFilter) &&
                        (invoiceMonthFilter === 'all' || inv.month === invoiceMonthFilter) &&
                        (invoiceStatusFilter === 'all' || inv.status === invoiceStatusFilter)
                      ), invoiceSort)
                    ).map((inv: any) =>
                      invoiceGroupBy === 'month'
                        ? (inv.date?.substring(0, 7) || inv.month || 'unknown')
                        : (inv.email || 'unknown')
                    )));
                    const allCollapsed = allKeys.every(k => invoiceCollapsed.has(k));
                    return (
                      <button onClick={() => setInvoiceCollapsed(allCollapsed ? new Set() : new Set(allKeys))}
                        className="text-xs text-slate-500 hover:text-indigo-600 transition-colors">
                        {allCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={fetchInvoices}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${invoicesLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {invoicesLoading ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Loading invoices…</p>
                </div>
              ) : (() => {
                const invoiceHiddenOlderCount = (invoices as any[])
                  .filter((inv: any) => { const y = yearOf(inv.date); return y !== null && y !== CURRENT_YEAR; }).length;
                const filtered = applySort(
                  invoices.filter((inv: any) =>
                    (invoiceShowAllYears || yearOf(inv.date) === null || yearOf(inv.date) === CURRENT_YEAR) &&
                    (invoiceAffiliateFilter === 'all' || inv.email === invoiceAffiliateFilter) &&
                    (invoiceMonthFilter     === 'all' || inv.month === invoiceMonthFilter) &&
                    (invoiceStatusFilter    === 'all' || inv.status === invoiceStatusFilter)
                  ),
                  invoiceSort,
                );
                if (filtered.length === 0) return (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-7 h-7 text-slate-300" />
                    </div>
                    <p className="text-slate-500 text-sm">No invoices match the selected filters.</p>
                    {invoiceHiddenOlderCount > 0 && !invoiceShowAllYears && (
                      <button onClick={() => setInvoiceShowAllYears(true)} className="text-xs text-indigo-600 hover:underline mt-2">
                        Load {invoiceHiddenOlderCount} older invoice{invoiceHiddenOlderCount === 1 ? '' : 's'} from prior years
                      </button>
                    )}
                  </div>
                );
                return (
                  <div className="overflow-x-auto">
                    <div className="flex items-center justify-between px-5 py-2 flex-wrap gap-2">
                      <p className="text-xs text-slate-400">{filtered.length}{invoices.length !== filtered.length ? ` of ${invoices.length}` : ''} invoices</p>
                      <LoadMoreYears showAll={invoiceShowAllYears} setShowAll={setInvoiceShowAllYears} hiddenCount={invoiceHiddenOlderCount} />
                    </div>
                    <table className="w-full">
                      <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                          <SortThSm label="Affiliate"  field="name"      sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} />
                          <SortThSm label="Month"      field="month"     sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} />
                          <SortThSm label="Amount"     field="amount"    sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} align="right" />
                          <SortThSm label="Approvals"  field="approvals" sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} align="right" />
                          <SortThSm label="Status"     field="status"    sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} />
                          <th className="py-3 px-4 text-slate-500 text-xs font-semibold uppercase tracking-wider text-center">Sent</th>
                          <th className="py-3 px-4 text-slate-500 text-xs font-semibold uppercase tracking-wider text-center">Zelle</th>
                          <th className="py-3 px-4 text-slate-500 text-xs font-semibold uppercase tracking-wider">Contact</th>
                          <th className="py-3 px-4 text-slate-500 text-xs font-semibold uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const InvRow = ({ inv }: { inv: any }) => {
                            const busy = updatingInvoice === inv.id;
                            const isOpen = expandedInvoices.has(inv.id);
                            const toggleOpen = () => setExpandedInvoices(prev => {
                              const next = new Set(prev);
                              next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id);
                              return next;
                            });
                            const allCards = getInvoiceCards(inv);
                            const approvedCards = allCards.filter((c: any) => c.status === 'approval');
                            const cards = isOpen ? approvedCards : [];
                            const approvalsCount = approvedCards.length;
                            return (
                              <React.Fragment key={inv.id}>
                                <tr
                                  onClick={toggleOpen}
                                  className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer ${isOpen ? 'bg-slate-50/60' : ''}`}
                                >
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                                      <div>
                                        <div className="font-medium text-sm text-slate-900">{inv.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{inv.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 text-sm text-slate-700">{inv.month}</td>
                                  <td className="py-3.5 px-4 text-right font-semibold text-sm text-slate-900">
                                    {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}` : <span className="text-slate-300 font-normal">—</span>}
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-sm text-slate-600">{approvalsCount}</td>
                                  <td className="py-3.5 px-4">
                                    {inv.status ? (
                                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                        inv.status.toLowerCase().includes('paid')
                                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70'
                                          : inv.status.toLowerCase().includes('pending')
                                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}>{inv.status}</span>
                                    ) : <span className="text-slate-300 text-xs">—</span>}
                                  </td>
                                  <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                                    <button disabled={busy} onClick={() => updateInvoice(inv.id, { sent: !inv.sent })}
                                      title="Mark payout as sent"
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${inv.sent ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                  </td>
                                  <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                                    <button disabled={busy} onClick={() => updateInvoice(inv.id, { sentZelle: !inv.sentZelle })}
                                      title="Mark Zelle payout as sent"
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${inv.sentZelle ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                      <Send className="w-4 h-4" />
                                    </button>
                                  </td>
                                  <td className="py-3.5 px-4 text-xs text-slate-500">{inv.zelle || '—'}</td>
                                  <td className="py-3.5 px-4 text-right">
                                    {busy && <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 ml-auto" />}
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr className="bg-slate-50/40 border-b border-slate-100">
                                    <td colSpan={9} className="px-4 pl-12 py-3">
                                      {!trackingActivity.length ? (
                                        <p className="text-xs text-slate-400 py-2 flex items-center gap-2">
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading cards…
                                        </p>
                                      ) : cards.length === 0 ? (
                                        <p className="text-xs text-slate-400 py-2">No approvals found for {inv.name} in {inv.month}.</p>
                                      ) : (
                                        <div className="space-y-1.5 py-1">
                                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                            Approvals for {inv.name} in {inv.month} ({cards.length})
                                          </p>
                                          {cards.map((c: any) => (
                                            <div key={c.id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-white rounded-lg border border-slate-100">
                                              <div className="flex items-center gap-3 min-w-0">
                                                <span className="font-medium text-slate-900 truncate">{c.cardName}</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${
                                                  c.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                                                  c.status === 'application' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70' :
                                                  'bg-slate-100 text-slate-500'
                                                }`}>{c.status}</span>
                                                <span className="text-xs text-slate-400 shrink-0">{formatDate(c.clickDate)}</span>
                                              </div>
                                              <span className="font-semibold text-emerald-600 shrink-0 ml-3">
                                                {c.totalEarnings > 0 ? `$${c.totalEarnings.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          };

                          if (invoiceGroupBy === 'none') return filtered.map((inv: any) => <InvRow key={inv.id} inv={inv} />);

                          // Build groups
                          const getKey = (inv: any) => invoiceGroupBy === 'month'
                            ? (inv.date?.substring(0, 7) || inv.month || 'unknown')
                            : (inv.email || 'unknown');
                          const getLabel = (key: string, rows: any[]) => invoiceGroupBy === 'month'
                            ? (rows[0]?.month || key)
                            : String(rows[0]?.name || key);
                          const getSub = (key: string) => invoiceGroupBy === 'affiliate' ? key : undefined;

                          const groups: Record<string, any[]> = {};
                          filtered.forEach((inv: any) => {
                            const k = getKey(inv);
                            if (!groups[k]) groups[k] = [];
                            groups[k].push(inv);
                          });

                          const sortedEntries = Object.entries(groups).sort(([ka, ra], [kb, rb]) =>
                            invoiceGroupBy === 'month'
                              ? kb.localeCompare(ka)  // newest month first
                              : String(getLabel(ka, ra)).localeCompare(String(getLabel(kb, rb)))
                          );

                          return sortedEntries.map(([key, rows]) => {
                            const isCollapsed = invoiceCollapsed.has(key);
                            const toggle = () => setInvoiceCollapsed(prev => {
                              const next = new Set(prev);
                              next.has(key) ? next.delete(key) : next.add(key);
                              return next;
                            });
                            const grpAmount    = rows.reduce((s: number, r: any) => s + (r.amount || 0), 0);
                            const grpApprovals = rows.reduce((s: number, r: any) => s + (r.approvals || 0), 0);
                            const grpSent      = rows.filter((r: any) => r.sent || r.sentZelle).length;
                            const sublabel     = getSub(key);
                            return (
                              <React.Fragment key={key}>
                                <tr onClick={toggle} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                                  <td colSpan={9} className="py-2.5 px-4">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{getLabel(key, rows)}</span>
                                        {sublabel && <span className="text-xs text-slate-400 font-mono normal-case">{sublabel}</span>}
                                        <span className="text-xs font-normal text-slate-400">({rows.length} invoice{rows.length !== 1 ? 's' : ''})</span>
                                      </div>
                                      <div className="flex items-center gap-3 ml-2 text-xs text-slate-500">
                                        {grpAmount    > 0 && <span className="font-medium text-emerald-600">${grpAmount.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
                                        {grpApprovals > 0 && <span>{grpApprovals} approvals</span>}
                                        {grpSent      > 0 && <span>{grpSent} paid</span>}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                {!isCollapsed && rows.map((inv: any) => <InvRow key={inv.id} inv={inv} />)}
                              </React.Fragment>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </Tabs.Content>

        </Tabs.Root>

        {/* ── Modals ── */}

        {/* Create Affiliate */}
        <Dialog.Root open={showCreateModal} onOpenChange={setShowCreateModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl ring-1 ring-slate-900/10">
              <Dialog.Title className="text-lg font-semibold text-slate-900 mb-4">Create New Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">Create a new affiliate account with name, email, password, and commission rate</Dialog.Description>
              <form onSubmit={createUser} className="space-y-4">
                {[
                  { label: 'Name',  value: newUserName,     set: setNewUserName,     type: 'text' },
                  { label: 'Email', value: newUserEmail,    set: setNewUserEmail,    type: 'email' },
                  { label: 'Password', value: newUserPassword, set: setNewUserPassword, type: 'password' },
                ].map(({ label, value, set, type }) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                      required
                      minLength={type === 'password' ? 6 : undefined}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Commission Rate (%)</label>
                  <input
                    type="number"
                    value={newUserCommission}
                    onChange={(e) => setNewUserCommission(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                    min="0" max="100" required
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">Create Affiliate</button>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Reset Password */}
        <Dialog.Root open={showResetModal} onOpenChange={setShowResetModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl ring-1 ring-slate-900/10">
              <Dialog.Title className="text-lg font-semibold text-slate-900 mb-4">Reset Password</Dialog.Title>
              <Dialog.Description className="sr-only">Reset the password for the selected affiliate account</Dialog.Description>
              {selectedUser && <p className="mb-4 text-sm text-slate-600">Reset password for <strong className="text-slate-900">{selectedUser.email}</strong></p>}
              <form onSubmit={resetUserPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                    required minLength={6}
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">Reset Password</button>
                  <button type="button" onClick={() => { setShowResetModal(false); setSelectedUser(null); setResetPassword(''); }} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Edit Affiliate */}
        <Dialog.Root open={showEditModal} onOpenChange={setShowEditModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl ring-1 ring-slate-900/10 max-h-[90vh] overflow-y-auto">
              <Dialog.Title className="text-lg font-semibold text-slate-900 mb-4">Edit Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">Edit affiliate profile information</Dialog.Description>
              {selectedUser && <p className="mb-4 text-sm text-slate-600">Editing: <strong className="text-slate-900">{selectedUser.email}</strong></p>}
              <form onSubmit={editUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Name',     value: editName,    set: setEditName,    type: 'text',  req: true  },
                    { label: 'Email',    value: editEmail,   set: setEditEmail,   type: 'email', req: true  },
                    { label: 'Phone',    value: editPhone,   set: setEditPhone,   type: 'tel',   req: false },
                    { label: 'Address',  value: editAddress, set: setEditAddress, type: 'text',  req: false },
                    { label: 'City',     value: editCity,    set: setEditCity,    type: 'text',  req: false },
                    { label: 'State',    value: editState,   set: setEditState,   type: 'text',  req: false },
                    { label: 'ZIP Code', value: editZip,     set: setEditZip,     type: 'text',  req: false },
                    { label: 'Country',  value: editCountry, set: setEditCountry, type: 'text',  req: false },
                  ].map(({ label, value, set, type, req }) => (
                    <div key={label}>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                        required={req}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">Save Changes</button>
                  <button type="button" onClick={() => { setShowEditModal(false); setSelectedUser(null); }} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
