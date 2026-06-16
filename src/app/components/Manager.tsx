import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  ChevronsUpDown,
  FileText,
  CheckCircle,
  Send,
  Search,
  Layers,
  Activity,
  Award,
  MousePointerClick,
  Copy,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import gsap from 'gsap';

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
const PAGE_SIZE = 25;
function yearOf(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

// Smoothly counts a number up to its target on mount / when it changes (GSAP)
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obj = { v: prev.current };
    const tween = gsap.to(obj, {
      v: value, duration: 0.9, ease: 'power2.out',
      onUpdate: () => { el.textContent = format(obj.v); },
    });
    prev.current = value;
    return () => tween.kill();
  }, [value]);
  return <span ref={ref}>{format(value)}</span>;
}

/** Bottom pagination-style button to reveal/hide records from prior years. */
function LoadMoreYears({
  showAll, setShowAll, hiddenCount,
}: { showAll: boolean; setShowAll: (v: boolean) => void; hiddenCount: number }) {
  if (hiddenCount === 0 && !showAll) return null;
  return !showAll ? (
    <button
      onClick={() => setShowAll(true)}
      className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors duration-150 cursor-pointer"
    >
      Load {hiddenCount} older record{hiddenCount === 1 ? '' : 's'}
      <span className="text-faint ml-1">(prior years)</span>
    </button>
  ) : (
    <button
      onClick={() => setShowAll(false)}
      className="px-4 py-2 text-xs font-medium text-faint border border-hair rounded-lg hover:bg-surface transition-colors duration-150 cursor-pointer"
    >
      Show {CURRENT_YEAR} only
    </button>
  );
}

/** Small pill marking a count as scoped to the current year by default (vs. an all-time/period figure). */
function CurrentYearBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 ml-2">
      {CURRENT_YEAR} only
    </span>
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
      case 'createdAt':         return item.joinedDate || item.createdAt;
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
        <span className="text-xs font-medium text-faint flex-shrink-0">Period:</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as DateFilter)}
          className="sm:hidden flex-1 min-w-0 text-xs font-medium bg-hair2 border border-transparent rounded-lg px-2.5 py-1.5 text-subtle focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
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
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-faint bg-hair2 hover:bg-hair'
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
            className="flex-1 min-w-[130px] px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-shadow" />
          <span className="text-faint text-xs">to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 min-w-[130px] px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-shadow" />
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
      : <ChevronsUpDown className="w-3 h-3 flex-shrink-0 text-faint2" />;
  return (
    <th
      onClick={() => onSort(field)}
      className={`py-3.5 px-6 text-faint text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-surface transition-colors text-${align}`}
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
      : <ChevronsUpDown className="w-3 h-3 flex-shrink-0 text-faint2" />;
  return (
    <th
      onClick={() => onSort(field)}
      className={`py-3 px-4 text-faint text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-surface transition-colors text-${align}`}
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
  const [syncingCardRating, setSyncingCardRating] = useState(false);
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
  const [editEzrxRef, setEditEzrxRef] = useState('');

  // Create user form
  const [newUserEmail, setNewUserEmail]           = useState('');
  const [newUserPassword, setNewUserPassword]     = useState('');
  const [newUserName, setNewUserName]             = useState('');
  const [newUserCommission, setNewUserCommission] = useState('100');

  // Reset password
  const [resetPassword, setResetPassword] = useState('');

  // Stats grid comparison period
  type StatPeriod = 'today' | 'week' | 'month' | 'lm' | 'year' | 'custom';
  const [statPeriod, setStatPeriod] = useState<StatPeriod>('month');
  const [statCustomFrom, setStatCustomFrom] = useState('');
  const [statCustomTo,   setStatCustomTo]   = useState('');
  const STAT_PERIOD_LABELS: Record<StatPeriod, string> = {
    today:  'Today vs yesterday',
    week:   'This week vs last week',
    month:  'This month vs last month',
    lm:     'Last month vs month before',
    year:   'This year vs last year',
    custom: 'Custom range',
  };
  const STAT_PERIOD_SHORT: Record<StatPeriod, string> = {
    today: 'Today', week: 'This Week', month: 'This Month', lm: 'Last Month', year: 'This Year', custom: 'Custom Range',
  };

  // Summary panel visibility — persisted in localStorage
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('mgr-visible-panels');
      return saved ? new Set(JSON.parse(saved)) : new Set(['stats', 'charts', 'topCards']);
    } catch { return new Set(['stats', 'charts', 'topCards']); }
  });
  const [insightsTab, setInsightsTab] = useState<'charts' | 'topCards'>('charts');
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  // Sticky tab bar shrinks its labels to icons once scrolled (mock behavior)
  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // GSAP entrance — staggered rise/fade of the main sections once data is in
  useEffect(() => {
    if (loading) return;
    const els = document.querySelectorAll('[data-anim]');
    if (!els.length) return;
    const ctx = gsap.context(() => {
      gsap.from(els, {
        y: 16, opacity: 0, duration: 0.55, stagger: 0.08, ease: 'power2.out', clearProps: 'all',
      });
    });
    return () => ctx.revert();
  }, [loading]);
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

  // ── Pagination (load-more) ──────────────────────────────────────────────────
  const [affiliatesVisible, setAffiliatesVisible] = useState(PAGE_SIZE);
  const [cpaVisible,        setCpaVisible]        = useState(PAGE_SIZE);
  const [cpaPageSize,       setCpaPageSize]       = useState<number>(PAGE_SIZE);
  const [invoicesVisible,   setInvoicesVisible]   = useState(PAGE_SIZE);
  const [trackingVisible,   setTrackingVisible]   = useState(PAGE_SIZE);
  const [trackingPageSize,  setTrackingPageSize]  = useState<number>(PAGE_SIZE);

  // ── Year-limited views: default to current year, "Load more" reveals older ──
  const [trackingShowAllYears, setTrackingShowAllYears] = useState(false);
  const [invoiceShowAllYears,  setInvoiceShowAllYears]  = useState(false);

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
      if (!inDateRange(u.joinedDate || u.createdAt, affiliatesFilter, affiliatesCustomFrom, affiliatesCustomTo)) return false;
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

  // Fallback all-time totals from KV-cached user.stats, used until the first
  // tracking fetch completes (trackingActivity is empty).
  const totalStatsFallback = users.reduce((acc: any, user: any) => ({
    clicks:       acc.clicks       + (user.stats?.totalClicks      || 0),
    applications: acc.applications + 0, // not in KV cache
    conversions:  acc.conversions  + (user.stats?.totalConversions  || 0),
    commissions:  acc.commissions  + (user.stats?.totalCommissions  || 0),
  }), { clicks: 0, applications: 0, conversions: 0, commissions: 0 });

  // ── Period helpers — drives the stat-card numbers + % comparison badges ────
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
  let _thisT: any[], _lastT: any[], _periodLabel: string;

  if (statPeriod === 'today') {
    _thisT = trackingActivity.filter((t: any) => _inRange(t.clickDate, 1, 0));
    _lastT = trackingActivity.filter((t: any) => _inRange(t.clickDate, 2, 1));
    _periodLabel = 'vs yesterday';
  } else if (statPeriod === 'week') {
    const daysFromMon = (_today.getDay() + 6) % 7; // Mon=0 … Sun=6
    const weekStart   = new Date(_today.getTime() - daysFromMon * 86_400_000);
    const prevWkStart = new Date(weekStart.getTime() - 7 * 86_400_000);
    _thisT = trackingActivity.filter((t: any) => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= weekStart && d <= _now; });
    _lastT = trackingActivity.filter((t: any) => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= prevWkStart && d < weekStart; });
    _periodLabel = 'vs last week';
  } else if (statPeriod === 'month') {
    const _thisM = _now.getMonth(), _thisY = _now.getFullYear();
    const _lastM = _thisM === 0 ? 11 : _thisM - 1;
    const _lastY  = _thisM === 0 ? _thisY - 1 : _thisY;
    _thisT = trackingActivity.filter((t: any) => _inMonth(t.clickDate, _thisM, _thisY));
    _lastT = trackingActivity.filter((t: any) => _inMonth(t.clickDate, _lastM, _lastY));
    _periodLabel = 'vs last month';
  } else if (statPeriod === 'lm') {
    const _lastM  = _now.getMonth() === 0 ? 11 : _now.getMonth() - 1;
    const _lastY  = _now.getMonth() === 0 ? _now.getFullYear() - 1 : _now.getFullYear();
    const _prevM  = _lastM === 0 ? 11 : _lastM - 1;
    const _prevY  = _lastM === 0 ? _lastY - 1 : _lastY;
    _thisT = trackingActivity.filter((t: any) => _inMonth(t.clickDate, _lastM, _lastY));
    _lastT = trackingActivity.filter((t: any) => _inMonth(t.clickDate, _prevM, _prevY));
    _periodLabel = 'vs month before';
  } else if (statPeriod === 'year') {
    const thisYrStart = new Date(_now.getFullYear(), 0, 1);
    const prevYrStart = new Date(_now.getFullYear() - 1, 0, 1);
    _thisT = trackingActivity.filter((t: any) => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= thisYrStart; });
    _lastT = trackingActivity.filter((t: any) => { if (!t.clickDate) return false; const d = parseLocalDate(t.clickDate); return d >= prevYrStart && d < thisYrStart; });
    _periodLabel = 'vs last year';
  } else {
    // custom
    const fromD = statCustomFrom ? parseLocalDate(statCustomFrom) : null;
    const toD   = statCustomTo   ? (() => { const d = parseLocalDate(statCustomTo); d.setDate(d.getDate() + 1); return d; })() : null;
    _thisT = trackingActivity.filter((t: any) => {
      if (!t.clickDate) return false;
      const d = parseLocalDate(t.clickDate);
      if (fromD && d < fromD) return false;
      if (toD   && d >= toD)  return false;
      return true;
    });
    _lastT = [];
    _periodLabel = statCustomFrom || statCustomTo ? `${statCustomFrom || '…'} → ${statCustomTo || '…'}` : 'select dates below';
  }

  const hasTracking = trackingActivity.length > 0;

  // ── Stat card numbers — computed from the selected period (_thisT) ─────────
  const totalStats = hasTracking
    ? {
        clicks:       _thisT.reduce((s, t) => s + (t.clicks       || 0), 0),
        applications: _thisT.reduce((s, t) => s + (t.applications || 0), 0),
        conversions:  _thisT.reduce((s, t) => s + (t.approvals    || 0), 0),
        commissions:  _thisT.reduce((s, t) => s + (t.totalEarnings|| 0), 0),
      }
    : totalStatsFallback;

  const avgEPC = totalStats.clicks > 0 ? totalStats.commissions / totalStats.clicks : 0;

  const _calcPct = (cur: number, prev: number): number | null =>
    prev === 0 ? (cur > 0 ? 100 : null) : Math.round(((cur - prev) / prev) * 100);

  const clicksPct       = hasTracking ? _calcPct(_thisT.reduce((s, t) => s + (t.clicks       || 0), 0), _lastT.reduce((s, t) => s + (t.clicks       || 0), 0)) : null;
  const approvalsPct    = hasTracking ? _calcPct(_thisT.reduce((s, t) => s + (t.approvals    || 0), 0), _lastT.reduce((s, t) => s + (t.approvals    || 0), 0)) : null;
  const applicationsPct = hasTracking ? _calcPct(_thisT.reduce((s, t) => s + (t.applications || 0), 0), _lastT.reduce((s, t) => s + (t.applications || 0), 0)) : null;
  const commissionsPct  = hasTracking ? _calcPct(_thisT.reduce((s, t) => s + (t.totalEarnings|| 0), 0), _lastT.reduce((s, t) => s + (t.totalEarnings|| 0), 0)) : null;

  /** Coloured percentage badge shown under each stat card */
  const PctBadge = ({ pct, compact = false }: { pct: number | null; compact?: boolean }) => {
    if (pct === null) {
      return compact
        ? <span className="text-faint2 text-xs">—</span>
        : <span className="text-faint text-xs">No prior-period data</span>;
    }
    if (pct === 0) {
      return compact
        ? <span className="text-faint text-xs font-medium">No change</span>
        : <span className="text-faint text-xs flex items-center gap-1">— No change <span className="font-normal">{_periodLabel}</span></span>;
    }
    const up = pct > 0;
    return (
      <div className={`flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
        <TrendingUp className={`w-3 h-3 ${!up ? 'rotate-180' : ''}`} />
        <span>{up ? '+' : ''}{pct}%{!compact ? ` ${_periodLabel}` : ''}</span>
      </div>
    );
  };

  // Borderless inline delta for the KPI band (colored arrow + %, no pill)
  const DeltaInline = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-faint2 text-[13px] font-medium">—</span>;
    if (pct === 0) return <span className="text-faint text-[13px] font-medium">No change</span>;
    const up = pct > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 ${up ? 'text-brand' : 'text-neg'}`}>
        <ChevronUp className={`w-3.5 h-3.5 -ml-0.5 ${!up ? 'rotate-180' : ''}`} strokeWidth={2.5} />
        <span className="text-[13.5px] font-semibold tabular-nums">{up ? '+' : ''}{pct}%</span>
      </span>
    );
  };

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
            zip: editZip, country: editCountry, ezrxRef: editEzrxRef,
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

  const syncCardRatingData = async () => {
    setMessage(''); setSyncingCardRating(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/sync-card-rating-api`,
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
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* non-JSON body — treat as error */ }
      if (res.ok && data.success) {
        setMessageWithTimeout(
          data.message || 'Card Rating API cache cleared — data will refresh on next load.',
          10000,
        );
      } else {
        setMessageWithTimeout(data.error || `Sync failed (HTTP ${res.status})`, 8000);
      }
    } catch (error: any) {
      setMessageWithTimeout(`Sync failed: ${error.message}`, 8000);
    } finally {
      setSyncingCardRating(false);
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
    <tr key={user.id} className="border-b border-surface hover:bg-brand-soft/40 transition-colors duration-150">
      <td className="py-4 px-6">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-brand-soft text-brand text-xs font-bold flex items-center justify-center flex-shrink-0">
            {(user.name || user.email || '?').trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-ink">{user.name || 'N/A'}</div>
            <div className="text-xs text-faint mt-0.5">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="py-4 px-6">
        <div className="text-xs text-faint space-y-0.5">
          {user.phone && <div>{user.phone}</div>}
          {(user.city || user.state) && <div>{[user.city, user.state].filter(Boolean).join(', ')}</div>}
          {!user.phone && !user.city && !user.state && <span className="text-faint2">—</span>}
        </div>
      </td>
      <td className="py-4 px-6">
        <code className="text-xs bg-hair2 text-subtle px-2 py-1 rounded-lg font-mono">{user.affiliateId || 'N/A'}</code>
      </td>
      <td className="py-4 px-6 text-right">
        {editingCommission === user.id ? (
          <div className="flex items-center justify-end gap-2">
            <input type="number" value={commissionValue} onChange={e => setCommissionValue(e.target.value)}
              className="w-20 px-2 py-1 border border-hair rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" min="0" max="100" />
            <button onClick={() => updateCommission(user.id, parseInt(commissionValue))} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
            <button onClick={() => setEditingCommission(null)} className="p-1.5 text-faint hover:bg-hair2 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-medium text-subtle">{user.commissionRate || 100}%</span>
            <button onClick={() => { setEditingCommission(user.id); setCommissionValue((user.commissionRate || 100).toString()); }}
              className="p-1.5 text-faint hover:bg-hair2 rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
          </div>
        )}
      </td>
      <td className="py-4 px-6 text-right text-sm text-subtle">{(user.stats?.totalClicks || 0).toLocaleString()}</td>
      <td className="py-4 px-6 text-right text-sm text-subtle">{(user.stats?.totalConversions || 0).toLocaleString()}</td>
      <td className="py-4 px-6 text-right text-sm font-semibold text-ink">${Math.round(user.stats?.totalCommissions || 0).toLocaleString()}</td>
      <td className="py-4 px-6 text-right text-xs text-faint">{formatDate(user.joinedDate || user.createdAt)}</td>
      <td className="py-4 px-6">
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => loginAsUser(user.id, user.email)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Login as this affiliate"><LogIn className="w-4 h-4" /></button>
          <button onClick={() => { setSelectedUser(user); setEditName(user.name||''); setEditEmail(user.email||''); setEditPhone(user.phone||''); setEditAddress(user.address||''); setEditCity(user.city||''); setEditState(user.state||''); setEditZip(user.zip||''); setEditCountry(user.country||''); setEditEzrxRef(user.ezrxRef||''); setShowEditModal(true); }}
            className="p-2 text-brand hover:bg-brand-soft rounded-lg transition-colors" title="Edit affiliate"><Edit className="w-4 h-4" /></button>
          <button onClick={() => { setSelectedUser(user); setShowResetModal(true); }} className="p-2 text-brand hover:bg-brand-soft rounded-lg transition-colors" title="Reset password"><Key className="w-4 h-4" /></button>
          <button onClick={() => deleteUser(user.id, user.email)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete affiliate"><Trash2 className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] bg-canvas">
        <div className="h-[60px] border-b border-hair flex items-center gap-2.5 px-6">
          <span className="font-bold text-[16px] text-ink">Affiliate Portal</span>
          <span className="text-[10.5px] font-bold text-brand bg-brand-soft px-2 py-[3px] rounded-full tracking-[0.04em] leading-none">MANAGER</span>
          <div className="flex-1" />
          <div className="ds-skel w-[88px] h-4" />
        </div>
        <div className="max-w-7xl mx-auto px-6 py-[34px]">
          <div className="ds-skel w-[160px] h-5 mb-2.5" />
          <div className="ds-skel w-[230px] h-3 mb-8" />
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-x-3 gap-y-6 mb-9">
            {[0,1,2,3].map(i => (
              <div key={i}>
                <div className="ds-skel w-[62%] h-3 mb-3" />
                <div className="ds-skel w-[82%] h-[30px] mb-3" />
                <div className="ds-skel w-[48%] h-3" />
              </div>
            ))}
          </div>
          <div className="ds-skel w-full h-[220px] rounded-2xl" />
        </div>
        <div className="fixed bottom-10 left-0 right-0 flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-[2.5px] border-hair border-t-brand animate-spin" />
          <span className="text-[13px] text-faint font-medium">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-10 border-b border-hair">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[60px]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center">
                <svg width="24" height="22" viewBox="0 0 39 37" fill="none" xmlns="http://www.w3.org/2000/svg">
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
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <h1 className="text-ink font-bold text-[16px] tracking-tight leading-none whitespace-nowrap">Affiliate Portal</h1>
                <span className="text-[10.5px] font-bold text-brand bg-brand-soft px-2 py-[3px] rounded-full tracking-[0.04em] leading-none whitespace-nowrap">MANAGER</span>
                <p className="text-faint text-xs hidden xl:block ml-1 whitespace-nowrap">Welcome, {managerName}</p>
              </div>
            </div>
            {/* Tabs live in the header (mock layout); labels collapse to icons on scroll */}
            <Tabs.List className="flex items-center gap-1 mx-2 sm:mx-4 min-w-0 overflow-x-auto">
              {([
                { key: 'affiliates', label: 'Affiliates', Icon: Users,      badge: undefined as number | undefined },
                { key: 'tracking',   label: 'Activity',   Icon: Activity,   badge: undefined },
                { key: 'cpa-rates',  label: 'CPA Rates',  Icon: Layers,     badge: undefined },
                { key: 'invoices',   label: 'Invoices',   Icon: FileText,   badge: invoices.length || undefined },
              ] as const).map(({ key, label, Icon, badge }) => (
                <Tabs.Trigger
                  key={key}
                  value={key}
                  className="group relative flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm font-medium text-faint data-[state=active]:text-ink data-[state=active]:font-bold hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-faint2 group-data-[state=active]:text-brand transition-colors" />
                  <span className={`overflow-hidden transition-all duration-300 ${scrolled ? 'max-w-0 opacity-0' : 'max-w-[120px] opacity-100'}`}>
                    <span className="flex items-center gap-1.5">
                      {label}
                      {badge && <span className="bg-brand-soft text-brand-dark text-xs font-semibold px-1.5 py-0.5 rounded-full">{badge}</span>}
                    </span>
                  </span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="flex items-center gap-2">
              {/* Actions dropdown */}
              {(() => {
                const anyBusy = syncing || syncingTracking || importingCPA;
                return (
                  <div className="relative">
                    <button
                      onClick={() => setActionsOpen(o => !o)}
                      className="flex items-center gap-2 px-3 h-9 bg-white border border-line text-subtle rounded-lg hover:bg-surface hover:text-ink transition-colors text-sm font-medium"
                    >
                      {anyBusy
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Actions
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {actionsOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
                        <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg ring-1 ring-ink/10 z-20 overflow-hidden">
                          <div className="py-1">
                            <p className="px-3 py-1.5 text-xs font-semibold text-faint uppercase tracking-wider">Sync</p>
                            <button
                              onClick={() => { setActionsOpen(false); syncFromAirtable(); }}
                              disabled={syncing}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-brand ${syncing ? 'animate-spin' : ''}`} />
                              {syncing ? 'Syncing affiliates…' : 'Sync Affiliates'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); syncTrackingFromAirtable(); }}
                              disabled={syncingTracking}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncingTracking ? 'animate-spin' : ''}`} />
                              {syncingTracking ? 'Syncing tracking…' : 'Sync Tracking'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); importCPAData(); }}
                              disabled={importingCPA}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-orange-500 ${importingCPA ? 'animate-spin' : ''}`} />
                              {importingCPA ? 'Importing…' : 'Import CPA Rates'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); syncCardRatingData(); }}
                              disabled={syncingCardRating}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-4 h-4 text-brand ${syncingCardRating ? 'animate-spin' : ''}`} />
                              {syncingCardRating ? 'Syncing…' : 'Sync Card Rating API'}
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
                className="flex items-center gap-2 px-3 h-9 text-faint hover:text-neg rounded-lg transition-colors text-sm font-medium"
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
              ? 'bg-brand-soft text-brand-dark ring-1 ring-brand/30'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200/60'
          }`}>
            {message}
          </div>
        )}

        {/* ── Performance overview ── */}
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
          const CHART_COLORS = ['#0a84ff','#3d9dff','#6bb4ff','#93c9ff','#b9dbff','#d4e9ff','#e6f2ff','#f0f7ff'];
          const isEmptyPeriod = hasTracking && totalStats.clicks === 0 && totalStats.commissions === 0;
          const showCharts   = visiblePanels.has('charts')   && chartData.length > 0;
          const showTopCards = visiblePanels.has('topCards') && mostApprovedCards.length > 0;

          const fmtInt = (n: number) => Math.round(n).toLocaleString();
          const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
          const statRows = [
            { label: 'Clicks',       raw: totalStats.clicks,      fmt: fmtInt, sub: null,                                                                                                          pct: clicksPct },
            { label: 'Approvals',    raw: totalStats.conversions, fmt: fmtInt, sub: totalStats.clicks > 0 && totalStats.conversions > 0 ? `${((totalStats.conversions/totalStats.clicks)*100).toFixed(1)}% conv.` : null,    pct: approvalsPct },
            { label: 'Commissions',  raw: totalStats.commissions, fmt: fmtUsd, sub: avgEPC > 0 ? `EPC $${avgEPC.toFixed(2)}` : null,                                                                                  pct: commissionsPct },
            { label: 'Applications', raw: totalStats.applications,fmt: fmtInt, sub: totalStats.clicks > 0 && totalStats.applications > 0 ? `${((totalStats.applications/totalStats.clicks)*100).toFixed(1)}% c→a` : null,    pct: applicationsPct },
          ];

          return (
            <div className="mb-6 sm:mb-8">
              {/* ── Period header ── */}
              <div data-anim className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight">
                    Network performance
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-soft text-brand-dark ring-1 ring-brand/30 ml-2 align-middle tracking-normal">
                      {STAT_PERIOD_SHORT[statPeriod]}
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-faint">
                    {STAT_PERIOD_LABELS[statPeriod]}
                    <span className="text-faint2 mx-1.5">•</span>
                    {users.length.toLocaleString()} affiliate{users.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Mobile: dropdown */}
                  <select
                    value={statPeriod}
                    onChange={e => setStatPeriod(e.target.value as StatPeriod)}
                    className="sm:hidden text-xs font-medium bg-white border border-hair rounded-lg px-2.5 py-2 text-subtle shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer"
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
                  {/* Desktop: plain text toggles (mock style) */}
                  <div className="hidden sm:flex items-center gap-5 overflow-x-auto">
                    {([
                      { value: 'today',  label: 'Today' },
                      { value: 'week',   label: 'This Week' },
                      { value: 'month',  label: 'This Month' },
                      { value: 'lm',     label: 'Last Month' },
                      { value: 'year',   label: 'This Year' },
                      { value: 'custom', label: 'Custom' },
                    ] as { value: StatPeriod; label: string }[]).map(({ value, label }) => (
                      <button key={value} onClick={() => setStatPeriod(value)}
                        className={`text-[13.5px] whitespace-nowrap cursor-pointer transition-colors ${
                          statPeriod === value ? 'text-brand font-bold' : 'text-faint font-medium hover:text-subtle'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Custom date inputs */}
                  {statPeriod === 'custom' && (
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={statCustomFrom} onChange={e => setStatCustomFrom(e.target.value)}
                        className="text-xs border border-hair rounded-lg px-2 py-1.5 text-subtle bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
                      <span className="text-xs text-faint">→</span>
                      <input type="date" value={statCustomTo} onChange={e => setStatCustomTo(e.target.value)}
                        className="text-xs border border-hair rounded-lg px-2 py-1.5 text-subtle bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
                    </div>
                  )}
                </div>
              </div>

              {isEmptyPeriod && (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-faint font-medium">
                  <RefreshCw className="w-3 h-3" /> No activity recorded for {STAT_PERIOD_LABELS[statPeriod].split(' vs ')[0].toLowerCase()}
                </div>
              )}

              {/* ── KPI band — borderless big numbers, hairline-separated (mock layout) ── */}
              <div data-anim className="grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-x-3 gap-y-6 pb-7 mb-7 border-b border-hair">
                {statRows.map(({ label, raw, fmt, sub, pct }) => (
                  <div key={label} className="min-w-0">
                    <div className="text-[13px] font-medium text-faint mb-2">{label}</div>
                    <div className="text-[27px] sm:text-[31px] font-bold text-ink leading-none tracking-[-0.025em] tabular-nums">
                      <CountUp value={raw} format={fmt} />
                    </div>
                    <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                      {pct !== undefined && <DeltaInline pct={pct} />}
                      {sub ? <span className="text-[12.5px] text-faint font-medium whitespace-nowrap">{sub}</span> : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Insights: tabbed charts / top cards ── */}
              {(showCharts || showTopCards) && (
                <div data-anim className="pb-7 mb-2 border-b border-hair">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <button onClick={() => setInsightsOpen(o => !o)} title={insightsOpen ? 'Minimize insights' : 'Show insights'}
                      className="flex items-center gap-2 cursor-pointer group">
                      <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${insightsOpen ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                      <span className="text-[15px] font-bold text-ink group-hover:opacity-70 transition-opacity">Insights</span>
                    </button>
                    {!insightsOpen && <span className="text-[12.5px] text-faint font-medium">Trends &amp; top cards hidden</span>}
                  </div>
                  {insightsOpen && (<>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-1 bg-surface rounded-lg p-1 text-xs font-medium">
                      {showCharts && (
                        <button onClick={() => setInsightsTab('charts')}
                          className={`px-3 py-1.5 rounded-md transition-all duration-150 cursor-pointer ${
                            insightsTab === 'charts' || !showTopCards
                              ? 'bg-white text-ink shadow-sm ring-1 ring-ink/5'
                              : 'text-faint hover:text-subtle'
                          }`}>
                          Top Affiliates
                        </button>
                      )}
                      {showTopCards && (
                        <button onClick={() => setInsightsTab('topCards')}
                          className={`px-3 py-1.5 rounded-md transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                            insightsTab === 'topCards' || !showCharts
                              ? 'bg-white text-ink shadow-sm ring-1 ring-ink/5'
                              : 'text-faint hover:text-subtle'
                          }`}>
                          <Award className="w-3.5 h-3.5 text-emerald-500" /> Top Cards
                        </button>
                      )}
                    </div>
                    {(insightsTab === 'charts' || !showTopCards) && showCharts && (
                      <div className="flex items-center gap-3 text-[11px] text-faint font-medium">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b9dbff]" />Clicks</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0a84ff]" />Approvals</span>
                      </div>
                    )}
                  </div>

                  {showCharts && (insightsTab === 'charts' || !showTopCards) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-48 sm:h-56">
                      <div className="h-full flex flex-col overflow-hidden">
                        <div className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-1 flex-none">Earnings (all-time)</div>
                        <div className="flex-1 min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                              <XAxis dataKey="name" tick={{ fontSize:10, fill:'#9499a0' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize:10, fill:'#9499a0' }} axisLine={false} tickLine={false}
                                tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} width={36} />
                              <Tooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Earnings']}
                                contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }} />
                              <Bar dataKey="earnings" radius={[3,3,0,0]}>
                                {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="h-full flex flex-col overflow-hidden">
                        <div className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-1 flex-none">Clicks vs Approvals</div>
                        <div className="flex-1 min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                              <XAxis dataKey="name" tick={{ fontSize:10, fill:'#9499a0' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize:10, fill:'#9499a0' }} axisLine={false} tickLine={false} width={32} />
                              <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }} />
                              <Bar dataKey="clicks" name="Clicks" fill="#b9dbff" radius={[2,2,0,0]} />
                              <Bar dataKey="approvals" name="Approvals" fill="#0a84ff" radius={[2,2,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {showTopCards && (insightsTab === 'topCards' || !showCharts) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1">
                      {mostApprovedCards.map((c, idx) => (
                        <div key={c.name} className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-surface transition-colors duration-150 min-w-0">
                          <span className={`text-xs font-bold flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
                            idx === 0 ? 'bg-amber-50 text-amber-500' : idx === 1 ? 'bg-hair2 text-faint' : idx === 2 ? 'bg-orange-50 text-orange-500' : 'bg-surface text-faint2'
                          }`}>{idx+1}</span>
                          <span className="text-sm text-subtle truncate flex-1 min-w-0 font-medium">{c.name}</span>
                          <span className="text-xs text-faint flex-shrink-0 font-semibold tabular-nums">{c.approvals}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                  </>)}
                </div>
              )}

              {/* ── Visibility toggles for the insights panel ── */}
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[11px] font-semibold text-faint mr-0.5 uppercase tracking-wider">Show:</span>
                {(['charts', 'topCards'] as const).map(key => {
                  const labels = { charts: 'Top Affiliates', topCards: 'Top Cards' };
                  return (
                    <button key={key} onClick={() => togglePanel(key)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 border cursor-pointer ${
                        visiblePanels.has(key)
                          ? 'bg-brand text-white border-brand shadow-sm'
                          : 'bg-white text-faint border-hair hover:border-brand hover:text-brand'
                      }`}>
                      {labels[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Tab panels — the tab nav lives in the header */}
        <div className="border-t border-hair pt-2">

          {/* ── Affiliates Tab ── */}
          <Tabs.Content value="affiliates">

            {/* Toolbar: Search + Date filter + Group + Create */}
            <div className="sticky top-[59px] z-10 bg-canvas/95 backdrop-blur-md py-4 mb-4 space-y-3 border-b border-hair">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={affiliateSearch}
                    onChange={e => { setAffiliateSearch(e.target.value); setAffiliatesVisible(PAGE_SIZE); }}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle transition-shadow"
                  />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {/* Group by Commission Rate toggle */}
                  <button
                    onClick={() => { setAffiliateGroupBy(g => !g); setAffiliateCollapsed(new Set()); setAffiliatesVisible(PAGE_SIZE); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 cursor-pointer ${
                      affiliateGroupBy
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'text-subtle bg-white border-hair hover:border-brand hover:text-brand'
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
                        className="text-xs text-faint hover:text-brand transition-colors cursor-pointer"
                      >
                        {allCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors text-sm font-medium shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Create Affiliate
                  </button>
                </div>
              </div>

              {/* Date filter row */}
              <div className="flex flex-wrap items-center gap-3">
                <FilterBar
                  filter={affiliatesFilter}     setFilter={v => { setAffiliatesFilter(v); setAffiliatesVisible(PAGE_SIZE); }}
                  customFrom={affiliatesCustomFrom} setCustomFrom={v => { setAffiliatesCustomFrom(v); setAffiliatesVisible(PAGE_SIZE); }}
                  customTo={affiliatesCustomTo}     setCustomTo={v => { setAffiliatesCustomTo(v); setAffiliatesVisible(PAGE_SIZE); }}
                />
                {(affiliateSearch || affiliatesFilter !== 'all') && (
                  <span className="text-xs text-faint ml-1">
                    {displayUsers.length} of {users.length} members
                    {affiliateSearch && <button onClick={() => { setAffiliateSearch(''); setAffiliatesVisible(PAGE_SIZE); }} className="text-brand hover:underline ml-2 cursor-pointer">Clear search</button>}
                  </span>
                )}
              </div>
            </div>

            {/* Affiliates Table */}
            <div className="mt-1">
              <p className="text-xs text-faint px-5 pt-4">
                Showing {Math.min(affiliatesVisible, displayUsers.length)} of {displayUsers.length} affiliates
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface/80 border-b border-hair2">
                    <tr>
                      <SortTh label="Affiliate"     field="name"             sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} />
                      <th className="text-left py-3.5 px-6 text-faint text-xs font-semibold uppercase tracking-wider">Contact Info</th>
                      <th className="text-left py-3.5 px-6 text-faint text-xs font-semibold uppercase tracking-wider">Affiliate ID</th>
                      <SortTh label="Commission %"  field="commissionRate"   sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Clicks"        field="totalClicks"      sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Conversions"   field="totalConversions" sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Earned"        field="totalCommissions" sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Joined"        field="createdAt"        sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <th className="text-right py-3.5 px-6 text-faint text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const pagedUsers = displayUsers.slice(0, affiliatesVisible);
                      if (affiliateGroupBy) {
                        // Grouped by commission rate
                        const groups: Record<string, any[]> = {};
                        pagedUsers.forEach((u: any) => {
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
                                <tr onClick={toggle} className="bg-surface border-b border-hair cursor-pointer hover:bg-hair2 transition-colors duration-150 select-none">
                                  <td colSpan={9} className="py-2.5 px-6">
                                    <div className="flex items-center gap-2">
                                      <ChevronDown className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                      <span className="text-xs font-semibold text-subtle uppercase tracking-wider">{rate} Commission</span>
                                      <span className="text-xs font-normal text-faint ml-0.5">({members.length} {members.length === 1 ? 'member' : 'members'})</span>
                                    </div>
                                  </td>
                                </tr>
                                {!isCollapsed && members.map((user: any) => renderUserRow(user))}
                            </React.Fragment>
                          );
                        });
                      }
                      return pagedUsers.map((user: any) => renderUserRow(user));
                    })()}
                  </tbody>
                </table>
              </div>
              {affiliatesVisible < displayUsers.length && (
                <div className="py-4 text-center">
                  <button
                    onClick={() => setAffiliatesVisible(n => n + PAGE_SIZE)}
                    className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors duration-150 cursor-pointer"
                  >
                    Show {Math.min(PAGE_SIZE, displayUsers.length - affiliatesVisible)} more
                    <span className="text-faint ml-1">({displayUsers.length - affiliatesVisible} remaining)</span>
                  </button>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* ── Tracking Activity Tab ── */}
          <Tabs.Content value="tracking">
            <div className="mt-1">
              <div className="sticky top-16 z-10 bg-white p-4 border-b border-hair2 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">All Tracking Activity</h2>
                    <p className="text-xs text-faint mt-0.5">
                      {displayTrackingActivity.length}
                      {(mgTrackingFilter !== 'all' || mgTrackingStatusFilter !== 'all' || mgTrackingAffiliateFilter !== 'all')
                        ? ` of ${trackingActivity.length}` : ''} records
                      <CurrentYearBadge active={!trackingShowAllYears} />
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Group by segmented control */}
                    <div className="flex items-center gap-0.5 bg-white border border-hair rounded-xl p-1 text-xs font-medium">
                      {([
                        { value: 'none',      label: 'No Group' },
                        { value: 'month',     label: 'Month' },
                        { value: 'affiliate', label: 'Affiliate' },
                      ] as { value: 'none'|'month'|'affiliate'; label: string }[]).map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => { setTrackingGroupBy(value); setTrackingCollapsed(new Set()); setTrackingVisible(trackingPageSize); }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                            trackingGroupBy === value
                              ? 'bg-brand text-white shadow-sm'
                              : 'text-faint hover:text-subtle hover:bg-surface'
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
                          className="text-xs text-faint hover:text-brand transition-colors cursor-pointer">
                          {allCollapsed ? 'Expand All' : 'Collapse All'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => { setTrackingVisible(trackingPageSize); fetchTrackingActivity(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-subtle bg-white border border-hair rounded-lg hover:border-brand hover:text-brand transition-all duration-150 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Date filter */}
                <FilterBar
                  filter={mgTrackingFilter}         setFilter={v => { setMgTrackingFilter(v); setTrackingVisible(trackingPageSize); }}
                  customFrom={mgTrackingCustomFrom} setCustomFrom={v => { setMgTrackingCustomFrom(v); setTrackingVisible(trackingPageSize); }}
                  customTo={mgTrackingCustomTo}     setCustomTo={v => { setMgTrackingCustomTo(v); setTrackingVisible(trackingPageSize); }}
                />

                {/* Status filter */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-faint mr-1">Status:</span>
                  {[
                    { value: 'all',         label: 'All' },
                    { value: 'click',       label: 'Click' },
                    { value: 'application', label: 'Application' },
                    { value: 'approval',    label: 'Approval' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => { setMgTrackingStatusFilter(value); setTrackingVisible(trackingPageSize); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                        mgTrackingStatusFilter === value
                          ? 'bg-brand text-white shadow-sm'
                          : 'text-subtle bg-white border border-hair hover:border-brand hover:text-brand'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Affiliate filter */}
                {affiliateOptions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-faint mr-1">Affiliate:</span>
                    <select
                      value={mgTrackingAffiliateFilter}
                      onChange={(e) => { setMgTrackingAffiliateFilter(e.target.value); setTrackingVisible(trackingPageSize); }}
                      className="px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle cursor-pointer transition-shadow"
                    >
                      <option value="all">All affiliates</option>
                      {affiliateOptions.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    {mgTrackingAffiliateFilter !== 'all' && (
                      <button
                        onClick={() => { setMgTrackingAffiliateFilter('all'); setTrackingVisible(trackingPageSize); }}
                        className="text-xs text-brand hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-6 pt-3">
              {(() => {
                const pagedTracking = displayTrackingActivity.slice(0, trackingVisible);
                return (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <p className="text-xs text-faint">
                        Showing {pagedTracking.length} of {displayTrackingActivity.length} records
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-faint">
                        <span>Show</span>
                        {[25, 50, 100].map(n => (
                          <button
                            key={n}
                            onClick={() => { setTrackingPageSize(n); setTrackingVisible(n); }}
                            className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                              trackingPageSize === n
                                ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                                : 'border-hair text-faint hover:bg-surface'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          onClick={() => { setTrackingPageSize(Infinity); setTrackingVisible(Infinity); }}
                          className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                            trackingPageSize === Infinity
                              ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                              : 'border-hair text-faint hover:bg-surface'
                          }`}
                        >
                          All
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl ring-1 ring-hair2">
                      <table className="w-full">
                        <thead className="bg-surface/80 border-b border-hair2">
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
                              <tr key={a.id} className="border-b border-surface hover:bg-brand-soft/40 transition-colors duration-150">
                                <td className="py-3.5 px-4 text-sm">
                                  <div className="font-medium text-ink">{formatDate(a.clickDate)}</div>
                                  <div className="text-xs text-faint mt-0.5">{formatTime(a.clickTime)}</div>
                                </td>
                                <td className="py-3.5 px-4 text-sm">
                                  <div className="font-medium text-ink">{a.memberName}</div>
                                  <div className="text-xs text-faint mt-0.5">{a.affiliateId}</div>
                                </td>
                                <td className="py-3.5 px-4 text-sm text-subtle">{a.cardName}</td>
                                <td className="py-3.5 px-4">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                    a.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                                    a.status === 'application' ? 'bg-brand-soft text-brand-dark ring-1 ring-brand/30' :
                                    'bg-hair2 text-subtle'
                                  }`}>{a.status}</span>
                                </td>
                                <td className="py-3.5 px-4 text-sm text-right font-semibold text-ink tabular-nums">
                                  {a.totalEarnings > 0 ? `$${a.totalEarnings.toFixed(2)}` : <span className="text-faint2 font-normal">—</span>}
                                </td>
                                <td className="py-3.5 px-4 text-sm text-faint">{a.deviceType || '—'}</td>
                                <td className="py-3.5 px-4 text-sm text-faint">{a.state || '—'}</td>
                              </tr>
                            );

                            // Flat mode
                            if (trackingGroupBy === 'none')
                              return pagedTracking.map((a: any) => <TrackRow key={a.id} a={a} />);

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
                            pagedTracking.forEach((a: any) => {
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
                                  <tr onClick={toggle} className="bg-surface border-b border-hair cursor-pointer hover:bg-hair2 transition-colors duration-150 select-none">
                                    <td colSpan={7} className="py-2.5 px-4">
                                      <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex items-center gap-2">
                                          <ChevronDown className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                          <span className="text-xs font-semibold text-subtle uppercase tracking-wider">{label}</span>
                                          {sublabel && <span className="text-xs text-faint font-mono normal-case">{sublabel}</span>}
                                          <span className="text-xs font-normal text-faint">({rows.length} records)</span>
                                        </div>
                                        <div className="flex items-center gap-3 ml-2 text-xs text-faint">
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
                    {(trackingVisible < displayTrackingActivity.length || trackingHiddenOlderCount > 0 || trackingShowAllYears) && (
                      <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
                        {trackingVisible < displayTrackingActivity.length && (
                          <button
                            onClick={() => setTrackingVisible(n => n + trackingPageSize)}
                            className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors duration-150 cursor-pointer"
                          >
                            Show {Math.min(trackingPageSize, displayTrackingActivity.length - trackingVisible)} more
                            <span className="text-faint ml-1">({displayTrackingActivity.length - trackingVisible} remaining)</span>
                          </button>
                        )}
                        <LoadMoreYears showAll={trackingShowAllYears} setShowAll={v => { setTrackingShowAllYears(v); setTrackingVisible(trackingPageSize); }} hiddenCount={trackingHiddenOlderCount} />
                      </div>
                    )}
                  </>
                );
              })()}
              </div>
            </div>
          </Tabs.Content>

          {/* ── CPA Rates Tab ── */}
          <Tabs.Content value="cpa-rates">
            <div className="mt-1">
              {/* Toolbar */}
              <div className="sticky top-16 z-10 bg-white p-5 border-b border-hair2 space-y-3">
                {/* Row 1: Search + Affiliate + Refresh */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search cards…"
                      value={cpaSearch}
                      onChange={e => { setCpaSearch(e.target.value); setCpaVisible(cpaPageSize); }}
                      className="w-full pl-8 pr-3 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle transition-shadow"
                    />
                  </div>

                  {/* Affiliate */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-faint">Affiliate:</span>
                    <select
                      value={cpaAffiliateFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCpaAffiliateFilter(val);
                        setCpaVisible(cpaPageSize);
                        fetchCpaRates(val);
                      }}
                      className="px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle cursor-pointer transition-shadow"
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 cursor-pointer ${
                        cpaGroupBy
                          ? 'bg-brand text-white border-brand shadow-sm'
                          : 'text-subtle bg-white border-hair hover:border-brand hover:text-brand'
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
                          className="text-xs text-faint hover:text-brand transition-colors cursor-pointer"
                        >
                          {allCollapsed ? 'Expand All' : 'Collapse All'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => { setCpaVisible(cpaPageSize); fetchCpaRates(cpaAffiliateFilter); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-subtle bg-white border border-hair rounded-lg hover:border-brand hover:text-brand transition-all duration-150 cursor-pointer"
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
                      <span className="text-xs font-medium text-faint">Issuer:</span>
                      <select
                        value={cpaIssuerFilter}
                        onChange={e => { setCpaIssuerFilter(e.target.value); setCpaVisible(cpaPageSize); }}
                        className="px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle cursor-pointer transition-shadow"
                      >
                        <option value="all">All issuers</option>
                        {Array.from(new Set(cpaRates.map(r => r.issuer).filter(Boolean))).sort().map((iss: any) => (
                          <option key={iss} value={iss}>{iss}</option>
                        ))}
                      </select>
                    </div>

                    {/* CPA range pills */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-faint">Payout:</span>
                      {([
                        { value: 'all',    label: 'All' },
                        { value: 'lt100',  label: '<$100' },
                        { value: '100-299', label: '$100–$299' },
                        { value: '300plus', label: '$300+' },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => { setCpaCpaRange(value); setCpaVisible(cpaPageSize); }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                            cpaCpaRange === value
                              ? 'bg-brand text-white shadow-sm'
                              : 'text-subtle bg-white border border-hair hover:border-brand hover:text-brand'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Active filter summary */}
                    {(cpaSearch || cpaIssuerFilter !== 'all' || cpaCpaRange !== 'all') && (
                      <button
                        onClick={() => { setCpaSearch(''); setCpaIssuerFilter('all'); setCpaCpaRange('all'); setCpaVisible(cpaPageSize); }}
                        className="text-xs text-brand hover:underline ml-1 cursor-pointer"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {cpaRatesLoading ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-brand" />
                  </div>
                  <p className="text-faint text-sm">Loading CPA rates from Airtable…</p>
                </div>
              ) : cpaRates.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="w-7 h-7 text-faint2" />
                  </div>
                  <p className="text-faint text-sm">No CPA rates found. Try refreshing.</p>
                </div>
              ) : (() => {
                // Apply all filters + sort
                const refPayout = (r: any) => cpaAffiliateFilter !== 'all' ? (r.affiliatePayout ?? r.bankCpa) : r.bankCpa;
                const filtered = applySort(cpaRates, cpaSort).filter(r => {
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
                  <tr className="border-b border-surface hover:bg-brand-soft/40 transition-colors duration-150">
                    <td className="py-3 px-4 font-medium text-sm text-ink">
                      <div className="flex items-center gap-2.5">
                        {rate.imageUrl ? (
                          <img
                            src={rate.imageUrl}
                            alt={rate.card}
                            className="w-10 h-6 object-contain rounded shrink-0"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-10 h-6 bg-hair2 rounded shrink-0" />
                        )}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{rate.card}</span>
                          {rate.cardType && (
                            <span className={`inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              /business/i.test(rate.cardType)
                                ? 'bg-brand-soft text-brand-dark'
                                : 'bg-sky-100 text-sky-700'
                            }`}>{rate.cardType}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {!cpaGroupBy && <td className="py-3 px-4 text-sm text-faint">{rate.issuer || '—'}</td>}
                    <td className="py-3 px-4 text-right font-semibold text-sm text-ink">
                      {rate.bankCpa > 0 ? `$${rate.bankCpa.toLocaleString()}` : <span className="text-faint2 font-normal">—</span>}
                    </td>
                    {cpaAffiliateFilter !== 'all' && (
                      <td className="py-3 px-4 text-right font-semibold text-sm text-brand">
                        {rate.affiliatePayout != null && rate.affiliatePayout > 0
                          ? `$${rate.affiliatePayout.toLocaleString()}`
                          : <span className="text-faint2 font-normal">—</span>}
                      </td>
                    )}
                    <td className="py-3 px-4 text-sm text-faint">{formatDate(rate.date)}</td>
                    <td className="py-3 px-4 text-right">
                      {rate.cardId ? (
                        <button
                          onClick={() => navigator.clipboard.writeText(rate.cardId)}
                          title={`Copy Card ID: ${rate.cardId}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-faint hover:text-brand hover:bg-brand-soft rounded transition-colors cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          {rate.cardId}
                        </button>
                      ) : <span className="text-hair text-xs">—</span>}
                    </td>
                  </tr>
                );

                if (filtered.length === 0) return (
                  <div className="text-center py-16">
                    <p className="text-faint text-sm">No cards match the filters.</p>
                    <button onClick={() => { setCpaSearch(''); setCpaIssuerFilter('all'); setCpaCpaRange('all'); setCpaVisible(cpaPageSize); }} className="text-xs text-brand hover:underline mt-2 cursor-pointer">Clear filters</button>
                  </div>
                );

                const pagedFiltered = cpaGroupBy ? filtered : filtered.slice(0, cpaVisible);

                return (
                  <div className="overflow-x-auto">
                    <div className="flex items-center justify-between px-5 py-2 flex-wrap gap-2">
                      <p className="text-xs text-faint">
                        Showing {pagedFiltered.length} of {filtered.length} cards
                        {filtered.length !== cpaRates.length ? ` (${cpaRates.length} total)` : ''}
                        {cpaAffiliateLabel ? ` · ${cpaAffiliateLabel}` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-faint">
                        <span>Show</span>
                        {[25, 50, 100].map(n => (
                          <button
                            key={n}
                            onClick={() => { setCpaPageSize(n); setCpaVisible(n); }}
                            className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                              cpaPageSize === n
                                ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                                : 'border-hair text-faint hover:bg-surface'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          onClick={() => { setCpaPageSize(Infinity); setCpaVisible(Infinity); }}
                          className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                            cpaPageSize === Infinity
                              ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                              : 'border-hair text-faint hover:bg-surface'
                          }`}
                        >
                          All
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-surface/80 border-b border-hair2">
                        <tr>
                          <SortThSm label="Card"     field="card"    sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} />
                          {!cpaGroupBy && <SortThSm label="Issuer" field="issuer" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} />}
                          <SortThSm label="Bank CPA" field="bankCpa" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} align="right" />
                          {cpaAffiliateFilter !== 'all' && (
                            <SortThSm label="Affiliate Payout" field="affiliatePayout" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} align="right" />
                          )}
                          <SortThSm label="Rate Date" field="date" sort={cpaSort} onSort={f => setCpaSort(toggleSort(cpaSort, f))} />
                          <th className="py-3 px-4 text-right text-xs font-semibold text-faint uppercase tracking-wider">Card ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cpaGroupBy ? (
                          // Grouped by issuer with collapse/expand
                          (() => {
                            const groups: Record<string, any[]> = {};
                            pagedFiltered.forEach(r => {
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
                                    className="bg-surface border-b border-hair cursor-pointer hover:bg-hair2 transition-colors duration-150 select-none"
                                  >
                                    <td colSpan={colCount} className="py-2.5 px-4">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span className="text-xs font-semibold text-subtle uppercase tracking-wider">{issuer}</span>
                                        <span className="text-xs font-normal text-faint ml-0.5">({rates.length} {rates.length === 1 ? 'card' : 'cards'})</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {!isCollapsed && rates.map(r => <CpaRow key={r.id} rate={r} />)}
                                </React.Fragment>
                              );
                            });
                          })()
                        ) : (
                          pagedFiltered.map(r => <CpaRow key={r.id} rate={r} />)
                        )}
                      </tbody>
                    </table>
                    {!cpaGroupBy && cpaVisible < filtered.length && (
                      <div className="py-4 flex flex-wrap items-center justify-center gap-2">
                        <button
                          onClick={() => setCpaVisible(n => n + cpaPageSize)}
                          className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors duration-150 cursor-pointer"
                        >
                          Show {Math.min(cpaPageSize, filtered.length - cpaVisible)} more
                          <span className="text-faint ml-1">({filtered.length - cpaVisible} remaining)</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </Tabs.Content>
          {/* ── Invoices Tab ── */}
          <Tabs.Content value="invoices">
            <div className="mt-1">
              {/* Toolbar */}
              <div className="sticky top-16 z-10 bg-white p-5 border-b border-hair2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Affiliate filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-faint">Affiliate:</span>
                    <select
                      value={invoiceAffiliateFilter}
                      onChange={e => { setInvoiceAffiliateFilter(e.target.value); setInvoicesVisible(PAGE_SIZE); }}
                      className="px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle cursor-pointer transition-shadow"
                    >
                      <option value="all">All affiliates</option>
                      {Array.from(new Set(invoices.map((inv: any) => inv.email).filter(Boolean))).sort().map((email: any) => (
                        <option key={email} value={email}>{invoices.find((inv: any) => inv.email === email)?.name || email}</option>
                      ))}
                    </select>
                  </div>
                  {/* Month filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-faint">Month:</span>
                    <select
                      value={invoiceMonthFilter}
                      onChange={e => { setInvoiceMonthFilter(e.target.value); setInvoicesVisible(PAGE_SIZE); }}
                      className="px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle cursor-pointer transition-shadow"
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
                      <span className="text-xs font-medium text-faint">Status:</span>
                      <select
                        value={invoiceStatusFilter}
                        onChange={e => { setInvoiceStatusFilter(e.target.value); setInvoicesVisible(PAGE_SIZE); }}
                        className="px-2.5 py-2 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white text-subtle cursor-pointer transition-shadow"
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
                  <div className="flex items-center gap-0.5 bg-white border border-hair rounded-xl p-1 text-xs font-medium">
                    {([
                      { value: 'none',      label: 'No Group' },
                      { value: 'month',     label: 'Month' },
                      { value: 'affiliate', label: 'Affiliate' },
                    ] as { value: 'none'|'month'|'affiliate'; label: string }[]).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => { setInvoiceGroupBy(value); setInvoiceCollapsed(new Set()); setInvoicesVisible(PAGE_SIZE); }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                          invoiceGroupBy === value
                            ? 'bg-brand text-white shadow-sm'
                            : 'text-faint hover:text-subtle hover:bg-surface'
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
                        className="text-xs text-faint hover:text-brand transition-colors cursor-pointer">
                        {allCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => { setInvoicesVisible(PAGE_SIZE); fetchInvoices(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-subtle bg-white border border-hair rounded-lg hover:border-brand hover:text-brand transition-all duration-150 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${invoicesLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {invoicesLoading ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-brand" />
                  </div>
                  <p className="text-faint text-sm">Loading invoices…</p>
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
                    <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-7 h-7 text-faint2" />
                    </div>
                    <p className="text-faint text-sm">No invoices match the selected filters.</p>
                    {invoiceHiddenOlderCount > 0 && !invoiceShowAllYears && (
                      <div className="mt-3">
                        <LoadMoreYears showAll={invoiceShowAllYears} setShowAll={v => { setInvoiceShowAllYears(v); setInvoicesVisible(PAGE_SIZE); }} hiddenCount={invoiceHiddenOlderCount} />
                      </div>
                    )}
                  </div>
                );
                const pagedFiltered = filtered.slice(0, invoicesVisible);
                return (
                  <div className="overflow-x-auto">
                    <div className="flex items-center justify-between px-5 py-2 flex-wrap gap-2">
                      <p className="text-xs text-faint">
                        Showing {pagedFiltered.length} of {filtered.length} invoices
                        {invoices.length !== filtered.length ? ` (${invoices.length} total)` : ''}
                        <CurrentYearBadge active={!invoiceShowAllYears} />
                      </p>
                    </div>
                    <table className="w-full">
                      <thead className="bg-surface/80 border-b border-hair2">
                        <tr>
                          <SortThSm label="Affiliate"  field="name"      sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} />
                          <SortThSm label="Month"      field="month"     sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} />
                          <SortThSm label="Amount"     field="amount"    sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} align="right" />
                          <SortThSm label="Approvals"  field="approvals" sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} align="right" />
                          <SortThSm label="Status"     field="status"    sort={invoiceSort} onSort={f => setInvoiceSort(toggleSort(invoiceSort, f))} />
                          <th className="py-3 px-4 text-faint text-xs font-semibold uppercase tracking-wider text-center">Sent</th>
                          <th className="py-3 px-4 text-faint text-xs font-semibold uppercase tracking-wider text-center">Zelle</th>
                          <th className="py-3 px-4 text-faint text-xs font-semibold uppercase tracking-wider">Contact</th>
                          <th className="py-3 px-4 text-faint text-xs font-semibold uppercase tracking-wider text-right">Actions</th>
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
                                  className={`border-b border-surface hover:bg-brand-soft/40 transition-colors duration-150 cursor-pointer ${isOpen ? 'bg-brand-soft/40' : ''}`}
                                >
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <ChevronDown className={`w-3.5 h-3.5 text-faint transition-transform duration-200 shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                                      <div>
                                        <div className="font-medium text-sm text-ink">{inv.name}</div>
                                        <div className="text-xs text-faint mt-0.5">{inv.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 text-sm text-subtle">{inv.month}</td>
                                  <td className="py-3.5 px-4 text-right font-semibold text-sm text-ink">
                                    {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}` : <span className="text-faint2 font-normal">—</span>}
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-sm text-subtle">{approvalsCount}</td>
                                  <td className="py-3.5 px-4">
                                    {inv.status ? (
                                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                        inv.status.toLowerCase().includes('paid')
                                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70'
                                          : inv.status.toLowerCase().includes('pending')
                                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70'
                                          : 'bg-hair2 text-subtle'
                                      }`}>{inv.status}</span>
                                    ) : <span className="text-faint2 text-xs">—</span>}
                                  </td>
                                  <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                                    <button disabled={busy} onClick={() => updateInvoice(inv.id, { sent: !inv.sent })}
                                      title="Mark payout as sent"
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${inv.sent ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-hair2 text-faint hover:bg-hair'}`}>
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                  </td>
                                  <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                                    <button disabled={busy} onClick={() => updateInvoice(inv.id, { sentZelle: !inv.sentZelle })}
                                      title="Mark Zelle payout as sent"
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${inv.sentZelle ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-hair2 text-faint hover:bg-hair'}`}>
                                      <Send className="w-4 h-4" />
                                    </button>
                                  </td>
                                  <td className="py-3.5 px-4 text-xs text-faint">{inv.zelle || '—'}</td>
                                  <td className="py-3.5 px-4 text-right">
                                    {busy && <RefreshCw className="w-4 h-4 animate-spin text-brand ml-auto" />}
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr className="bg-surface/40 border-b border-hair2">
                                    <td colSpan={9} className="px-4 pl-12 py-3">
                                      {!trackingActivity.length ? (
                                        <p className="text-xs text-faint py-2 flex items-center gap-2">
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading cards…
                                        </p>
                                      ) : cards.length === 0 ? (
                                        <p className="text-xs text-faint py-2">No approvals found for {inv.name} in {inv.month}.</p>
                                      ) : (
                                        <div className="space-y-1.5 py-1">
                                          <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-1.5">
                                            Approvals for {inv.name} in {inv.month} ({cards.length})
                                          </p>
                                          {cards.map((c: any) => (
                                            <div key={c.id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-white rounded-lg border border-hair2">
                                              <div className="flex items-center gap-3 min-w-0">
                                                <span className="font-medium text-ink truncate">{c.cardName}</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${
                                                  c.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                                                  c.status === 'application' ? 'bg-brand-soft text-brand-dark ring-1 ring-brand/30' :
                                                  'bg-hair2 text-faint'
                                                }`}>{c.status}</span>
                                                <span className="text-xs text-faint shrink-0">{formatDate(c.clickDate)}</span>
                                              </div>
                                              <span className="font-semibold text-emerald-600 shrink-0 ml-3">
                                                {c.totalEarnings > 0 ? `$${c.totalEarnings.toFixed(2)}` : <span className="text-faint2 font-normal">—</span>}
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

                          if (invoiceGroupBy === 'none') return pagedFiltered.map((inv: any) => <InvRow key={inv.id} inv={inv} />);

                          // Build groups
                          const getKey = (inv: any) => invoiceGroupBy === 'month'
                            ? (inv.date?.substring(0, 7) || inv.month || 'unknown')
                            : (inv.email || 'unknown');
                          const getLabel = (key: string, rows: any[]) => invoiceGroupBy === 'month'
                            ? (rows[0]?.month || key)
                            : String(rows[0]?.name || key);
                          const getSub = (key: string) => invoiceGroupBy === 'affiliate' ? key : undefined;

                          const groups: Record<string, any[]> = {};
                          pagedFiltered.forEach((inv: any) => {
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
                                <tr onClick={toggle} className="bg-surface border-b border-hair cursor-pointer hover:bg-hair2 transition-colors duration-150 select-none">
                                  <td colSpan={9} className="py-2.5 px-4">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span className="text-xs font-semibold text-subtle uppercase tracking-wider">{getLabel(key, rows)}</span>
                                        {sublabel && <span className="text-xs text-faint font-mono normal-case">{sublabel}</span>}
                                        <span className="text-xs font-normal text-faint">({rows.length} invoice{rows.length !== 1 ? 's' : ''})</span>
                                      </div>
                                      <div className="flex items-center gap-3 ml-2 text-xs text-faint">
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
                    {(invoicesVisible < filtered.length || invoiceHiddenOlderCount > 0 || invoiceShowAllYears) && (
                      <div className="py-4 flex flex-wrap items-center justify-center gap-2">
                        {invoicesVisible < filtered.length && (
                          <button
                            onClick={() => setInvoicesVisible(n => n + PAGE_SIZE)}
                            className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors duration-150 cursor-pointer"
                          >
                            Show {Math.min(PAGE_SIZE, filtered.length - invoicesVisible)} more
                            <span className="text-faint ml-1">({filtered.length - invoicesVisible} remaining)</span>
                          </button>
                        )}
                        <LoadMoreYears showAll={invoiceShowAllYears} setShowAll={v => { setInvoiceShowAllYears(v); setInvoicesVisible(PAGE_SIZE); }} hiddenCount={invoiceHiddenOlderCount} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </Tabs.Content>

        </div>

        {/* ── Modals ── */}

        {/* Create Affiliate */}
        <Dialog.Root open={showCreateModal} onOpenChange={setShowCreateModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl ring-1 ring-ink/10 z-50">
              <Dialog.Title className="text-lg font-semibold text-ink mb-4">Create New Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">Create a new affiliate account with name, email, password, and commission rate</Dialog.Description>
              <form onSubmit={createUser} className="space-y-4">
                {[
                  { label: 'Name',  value: newUserName,     set: setNewUserName,     type: 'text' },
                  { label: 'Email', value: newUserEmail,    set: setNewUserEmail,    type: 'email' },
                  { label: 'Password', value: newUserPassword, set: setNewUserPassword, type: 'password' },
                ].map(({ label, value, set, type }) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-subtle mb-1.5">{label}</label>
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm"
                      required
                      minLength={type === 'password' ? 6 : undefined}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-subtle mb-1.5">Commission Rate (%)</label>
                  <input
                    type="number"
                    value={newUserCommission}
                    onChange={(e) => setNewUserCommission(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm"
                    min="0" max="100" required
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-brand text-white py-2.5 rounded-lg hover:bg-brand-dark transition-colors text-sm font-medium">Create Affiliate</button>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 bg-hair2 text-subtle py-2.5 rounded-lg hover:bg-hair transition-colors text-sm font-medium">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Reset Password */}
        <Dialog.Root open={showResetModal} onOpenChange={setShowResetModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl ring-1 ring-ink/10 z-50">
              <Dialog.Title className="text-lg font-semibold text-ink mb-4">Reset Password</Dialog.Title>
              <Dialog.Description className="sr-only">Reset the password for the selected affiliate account</Dialog.Description>
              {selectedUser && <p className="mb-4 text-sm text-subtle">Reset password for <strong className="text-ink">{selectedUser.email}</strong></p>}
              <form onSubmit={resetUserPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-subtle mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm"
                    required minLength={6}
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-brand text-white py-2.5 rounded-lg hover:bg-brand-dark transition-colors text-sm font-medium">Reset Password</button>
                  <button type="button" onClick={() => { setShowResetModal(false); setSelectedUser(null); setResetPassword(''); }} className="flex-1 bg-hair2 text-subtle py-2.5 rounded-lg hover:bg-hair transition-colors text-sm font-medium">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Edit Affiliate */}
        <Dialog.Root open={showEditModal} onOpenChange={setShowEditModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl ring-1 ring-ink/10 max-h-[90vh] overflow-y-auto z-50">
              <Dialog.Title className="text-lg font-semibold text-ink mb-4">Edit Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">Edit affiliate profile information</Dialog.Description>
              {selectedUser && <p className="mb-4 text-sm text-subtle">Editing: <strong className="text-ink">{selectedUser.email}</strong></p>}
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
                      <label className="block text-sm font-medium text-subtle mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm"
                        required={req}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-subtle mb-1.5">Affiliate Link Reference (ezrxref)</label>
                  <input
                    type="text"
                    value={editEzrxRef}
                    onChange={(e) => setEditEzrxRef(e.target.value)}
                    placeholder="e.g. 12345"
                    className="w-full px-3.5 py-2.5 border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm"
                  />
                  <p className="text-xs text-faint mt-1.5">Powers the affiliate's cardratings.com link shown on their dashboard. Leave blank if not yet assigned.</p>
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-brand text-white py-2.5 rounded-lg hover:bg-brand-dark transition-colors text-sm font-medium">Save Changes</button>
                  <button type="button" onClick={() => { setShowEditModal(false); setSelectedUser(null); }} className="flex-1 bg-hair2 text-subtle py-2.5 rounded-lg hover:bg-hair transition-colors text-sm font-medium">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Tabs.Root>
  );
}
