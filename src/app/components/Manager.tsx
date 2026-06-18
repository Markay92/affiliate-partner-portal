import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  MoreHorizontal,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import gsap from 'gsap';
import { SwipeCarousel, Slide } from './ui/swipe-tabs';
import { Spinner } from './ui/spinner';

interface ManagerProps {
  sessionToken: string;
  managerName: string;
  onLogout: () => void;
  onLoginAsUser: (email: string, accessToken: string) => void;
}

// ── Filter / sort types & helpers ────────────────────────────────────────────

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'lm' | 'custom';
type SortState  = { field: string; dir: 'asc' | 'desc' };

const PAGE_SIZE = 25;

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

function formatLastUpdated(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function LastUpdated({ ts }: { ts?: number }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-medium text-faint">
      <RefreshCw className="w-3 h-3" />
      Last updated {formatLastUpdated(ts)}
    </p>
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
    <div className="space-y-2.5">
      <div className="ds-chips flex items-center gap-5 overflow-x-auto -mx-1 px-1">
        {(['today', 'week', 'month', 'lm', 'all', 'custom'] as DateFilter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`whitespace-nowrap text-[13.5px] cursor-pointer transition-colors py-0.5 ${
              filter === f
                ? 'text-brand font-bold'
                : 'text-faint font-medium hover:text-subtle'
            }`}>
            {DATE_LABELS[f]}
          </button>
        ))}
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
      className={`py-3.5 px-6 text-faint text-xs font-semibold cursor-pointer select-none hover:bg-surface transition-colors text-${align}`}
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
      className={`py-3 px-4 text-faint text-xs font-semibold cursor-pointer select-none hover:bg-surface transition-colors text-${align}`}
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
  const [refreshingData, setRefreshingData] = useState(false);
  const [actionsOpen, setActionsOpen]       = useState(false);
  const [messageTimeout, setMessageTimeout] = useState<NodeJS.Timeout | null>(null);
  const [trackingActivity, setTrackingActivity] = useState([]);
  const [activeTab, setActiveTab]           = useState('affiliates');
  // Timestamps for when each table's data was last fetched
  const [lastUpdated, setLastUpdated] = useState<{ affiliates?: number; tracking?: number; cpa?: number; invoices?: number }>({});

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
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [insCard, setInsCard] = useState(0);   // active Insights panel on mobile (swipe)
  const insBodyRef = useRef<HTMLDivElement>(null);
  const [perfOpen, setPerfOpen] = useState(false);   // Performance compact by default, pull to expand (design)
  const perfBodyRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Smoothly tween the Insights body open/closed (GSAP, from the design file)
  const toggleInsights = () => {
    const willOpen = !insightsOpen;
    const el = insBodyRef.current;
    if (el) {
      gsap.killTweensOf(el);
      if (willOpen) {
        gsap.set(el, { height: 'auto' });
        const h = el.offsetHeight;
        gsap.fromTo(el, { height: 0, opacity: 0 }, { height: h, opacity: 1, duration: 0.42, ease: 'power3.out', onComplete: () => gsap.set(el, { height: 'auto' }) });
      } else {
        gsap.to(el, { height: 0, opacity: 0, duration: 0.34, ease: 'power3.inOut' });
      }
    }
    setInsightsOpen(willOpen);
  };

  // Pull-to-expand the whole Performance section (compact by default), GSAP height tween.
  const togglePerf = () => {
    const willOpen = !perfOpen;
    const el = perfBodyRef.current;
    if (el) {
      gsap.killTweensOf(el);
      if (willOpen) {
        gsap.set(el, { height: 'auto' });
        const h = el.offsetHeight;
        gsap.fromTo(el, { height: 0, opacity: 0 }, { height: h, opacity: 1, duration: 0.42, ease: 'power3.out', onComplete: () => gsap.set(el, { height: 'auto' }) });
      } else {
        gsap.to(el, { height: 0, opacity: 0, duration: 0.34, ease: 'power3.inOut' });
      }
    }
    setPerfOpen(willOpen);
  };

  // Performance is compact by default — collapse its body before first paint (no flash).
  useLayoutEffect(() => {
    if (loading) return;
    if (!perfOpen && perfBodyRef.current) gsap.set(perfBodyRef.current, { height: 0, opacity: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Sticky tab bar shrinks its labels to icons once scrolled (mock behavior).
  // Hysteresis (collapse >72, expand <24) + rAF throttle avoids flicker near
  // a single threshold when layout height shifts nudge scrollY.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY || 0;
      setScrolled(prev => (prev ? y > 24 : y > 72));
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
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
  const [affiliatesPageSize, setAffiliatesPageSize] = useState<number>(PAGE_SIZE);
  const [cpaVisible,        setCpaVisible]        = useState(PAGE_SIZE);
  const [cpaPageSize,       setCpaPageSize]       = useState<number>(PAGE_SIZE);
  const [invoicesVisible,   setInvoicesVisible]   = useState(PAGE_SIZE);
  const [invoicesPageSize,  setInvoicesPageSize]  = useState<number>(PAGE_SIZE);
  const [trackingVisible,   setTrackingVisible]   = useState(PAGE_SIZE);
  const [trackingPageSize,  setTrackingPageSize]  = useState<number>(PAGE_SIZE);


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

  const displayTrackingActivity = applySort(
    (trackingActivity as any[]).filter((a) =>
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
        setLastUpdated(prev => ({ ...prev, affiliates: Date.now() }));
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

  // Force-refresh the cached dashboard snapshots (tracking / invoices / cards)
  // straight from Airtable. This is what affiliates see, so it updates their
  // numbers and "Last updated" in one click.
  const refreshAllData = async () => {
    setMessage(''); setRefreshingData(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/refresh-data`,
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
        setMessageWithTimeout(`Data refreshed — ${data.tracking} tracking, ${data.invoices} invoices, ${data.cards} cards`, 8000);
        await fetchTrackingActivity();
      } else setMessageWithTimeout(data.error || 'Failed to refresh data', 8000);
    } catch (error: any) { setMessageWithTimeout(`Refresh failed: ${error.message}`, 8000); }
    finally { setRefreshingData(false); }
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
      if (data.success) { setTrackingActivity(data.activity || []); setLastUpdated(prev => ({ ...prev, tracking: data.syncedAt || Date.now() })); }
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
      setLastUpdated(prev => ({ ...prev, cpa: Date.now() }));
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
      if (data.invoices) { setInvoices(data.invoices); setLastUpdated(prev => ({ ...prev, invoices: Date.now() })); }
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
  const renderUserRow = (user: any, indent?: boolean) => {
    const initials = (user.name || user.email || '?').trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
    const editing = editingCommission === user.id;
    const menuOpen = rowMenu === user.id;
    return (
      <div key={user.id} className="flex items-center gap-3 sm:gap-4 py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150" style={{ paddingLeft: indent ? 24 : 0 }}>
        <span className="w-8 h-8 rounded-full bg-brand-soft text-brand text-xs font-bold flex items-center justify-center flex-shrink-0">{initials}</span>
        <span className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate flex-1 min-w-0">{user.name || 'N/A'}</span>
        <span className="hidden lg:block w-[180px] flex-shrink-0 text-right text-[13px] font-medium text-faint truncate">{user.email}</span>
        <span className="hidden md:block w-[88px] flex-shrink-0 text-right text-[13px] font-medium text-faint font-mono-ds truncate">{user.affiliateId || '—'}</span>
        <span className="hidden sm:block w-[72px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums">{(user.stats?.totalConversions || 0).toLocaleString()} appr.</span>
        {editing ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <input type="number" value={commissionValue} onChange={e => setCommissionValue(e.target.value)}
              className="w-16 px-2 py-1 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand tabular-nums" min="0" max="100" />
            <span className="text-sm text-faint">%</span>
            <button onClick={() => { updateCommission(user.id, parseInt(commissionValue)); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
            <button onClick={() => setEditingCommission(null)} className="p-1.5 text-faint hover:bg-hair2 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <>
            <span className="hidden sm:block w-[78px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums">{user.commissionRate || 100}% split</span>
            <span className="w-[84px] flex-shrink-0 text-right text-[13px] font-medium text-ink tabular-nums">${Math.round(user.stats?.totalCommissions || 0).toLocaleString()}</span>
            <div className="relative flex-shrink-0">
              <button onClick={() => setRowMenu(menuOpen ? null : user.id)} title="Actions"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-faint hover:text-ink hover:bg-hair2 transition-colors cursor-pointer"><MoreHorizontal className="w-[18px] h-[18px]" /></button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setRowMenu(null)} />
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg ring-1 ring-ink/10 z-20 overflow-hidden py-1">
                    <button onClick={() => { setRowMenu(null); loginAsUser(user.id, user.email); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle hover:bg-surface transition-colors"><LogIn className="w-4 h-4 text-brand" />Log in as</button>
                    <button onClick={() => { setRowMenu(null); setEditingCommission(user.id); setCommissionValue((user.commissionRate || 100).toString()); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle hover:bg-surface transition-colors"><DollarSign className="w-4 h-4 text-faint" />Edit commission</button>
                    <button onClick={() => { setRowMenu(null); setSelectedUser(user); setEditName(user.name||''); setEditEmail(user.email||''); setEditPhone(user.phone||''); setEditAddress(user.address||''); setEditCity(user.city||''); setEditState(user.state||''); setEditZip(user.zip||''); setEditCountry(user.country||''); setEditEzrxRef(user.ezrxRef||''); setShowEditModal(true); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle hover:bg-surface transition-colors"><Edit className="w-4 h-4 text-faint" />Edit details</button>
                    <button onClick={() => { setRowMenu(null); setSelectedUser(user); setShowResetModal(true); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle hover:bg-surface transition-colors"><Key className="w-4 h-4 text-faint" />Reset password</button>
                    <button onClick={() => { setRowMenu(null); deleteUser(user.id, user.email); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" />Delete</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

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
          <Spinner className="w-9 h-9" />
          <span className="text-[13px] text-faint font-medium">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { key: 'affiliates', label: 'Affiliates', Icon: Users,    badge: 0 },
    { key: 'tracking',   label: 'Activity',   Icon: Activity, badge: 0 },
    { key: 'cpa-rates',  label: 'CPA Rates',  Icon: Layers,   badge: 0 },
    { key: 'invoices',   label: 'Invoices',   Icon: FileText, badge: invoices.length },
  ] as const;

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-10 border-b border-hair">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-[60px] gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <h1 className="hidden sm:block text-ink font-bold text-[16px] tracking-tight leading-none whitespace-nowrap">Affiliate Portal</h1>
                <span className="hidden sm:inline-flex text-[10.5px] font-bold text-brand bg-brand-soft px-2 py-[3px] rounded-full tracking-[0.04em] leading-none whitespace-nowrap">MANAGER</span>
                <p className="text-faint text-xs hidden xl:block ml-1 whitespace-nowrap">Welcome, {managerName}</p>
              </div>
            </div>
            {/* Centered pill nav; labels are icon-only on mobile, collapse to icons on scroll */}
            <Tabs.List className="flex items-center gap-0.5 bg-surface rounded-full p-1 flex-shrink-0 max-w-full overflow-x-auto ds-chips">
              {navItems.map(({ key, label, Icon, badge }) => (
                <Tabs.Trigger
                  key={key}
                  value={key}
                  className="group relative flex items-center gap-2 px-3 h-8 rounded-full text-sm font-medium text-faint data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-ink data-[state=active]:font-semibold hover:text-ink transition-all whitespace-nowrap cursor-pointer"
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-faint2 group-data-[state=active]:text-brand transition-colors" />
                  <span className={`overflow-hidden transition-all duration-300 max-w-[120px] opacity-100 ${activeTab === key ? 'inline-block' : 'hidden'} sm:inline-block ${scrolled ? 'sm:max-w-0 sm:opacity-0' : ''}`}>
                    <span className="flex items-center gap-1.5">
                      {label}
                      {badge > 0 && <span className="bg-brand-soft text-brand-dark text-xs font-semibold px-1.5 py-0.5 rounded-full">{badge}</span>}
                    </span>
                  </span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="flex items-center gap-2 flex-1 justify-end">
              {/* Actions dropdown */}
              {(() => {
                const anyBusy = syncing || syncingTracking || importingCPA || syncingCardRating || refreshingData;
                return (
                  <div className="relative">
                    <button
                      onClick={() => setActionsOpen(o => !o)}
                      aria-label="Menu"
                      className="flex items-center justify-center sm:justify-start gap-2 w-10 sm:w-auto px-0 sm:px-3 h-9 sm:bg-white sm:border sm:border-line text-subtle rounded-lg hover:bg-surface hover:text-ink transition-colors text-sm font-medium"
                    >
                      {anyBusy
                        ? <Spinner className="w-4 h-4 sm:w-3.5 sm:h-3.5" strokeWidth={4} />
                        : <>
                            <MoreHorizontal className="w-5 h-5 sm:hidden" />
                            <RefreshCw className="hidden sm:block w-3.5 h-3.5" />
                          </>}
                      <span className="hidden sm:inline">Actions</span>
                      <ChevronDown className={`hidden sm:block w-3.5 h-3.5 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {actionsOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
                        <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg ring-1 ring-ink/10 z-20 overflow-hidden">
                          <div className="py-1">
                            <button
                              onClick={() => { setActionsOpen(false); refreshAllData(); }}
                              disabled={refreshingData}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              {refreshingData ? <Spinner className="w-4 h-4 text-brand" strokeWidth={4} /> : <RefreshCw className="w-4 h-4 text-brand" />}
                              {refreshingData ? 'Refreshing…' : 'Refresh data'}
                            </button>
                            <div className="border-t border-hair my-1" />
                            <p className="px-3 py-1.5 text-xs font-semibold text-faint">Sync</p>
                            <button
                              onClick={() => { setActionsOpen(false); syncFromAirtable(); }}
                              disabled={syncing}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              {syncing ? <Spinner className="w-4 h-4 text-brand" strokeWidth={4} /> : <RefreshCw className="w-4 h-4 text-brand" />}
                              {syncing ? 'Syncing affiliates…' : 'Sync Affiliates'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); syncTrackingFromAirtable(); }}
                              disabled={syncingTracking}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              {syncingTracking ? <Spinner className="w-4 h-4 text-emerald-600" strokeWidth={4} /> : <RefreshCw className="w-4 h-4 text-emerald-600" />}
                              {syncingTracking ? 'Syncing tracking…' : 'Sync Tracking'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); importCPAData(); }}
                              disabled={importingCPA}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              {importingCPA ? <Spinner className="w-4 h-4 text-orange-500" strokeWidth={4} /> : <RefreshCw className="w-4 h-4 text-orange-500" />}
                              {importingCPA ? 'Importing…' : 'Import CPA Rates'}
                            </button>
                            <button
                              onClick={() => { setActionsOpen(false); syncCardRatingData(); }}
                              disabled={syncingCardRating}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle hover:bg-surface disabled:opacity-50 transition-colors"
                            >
                              {syncingCardRating ? <Spinner className="w-4 h-4 text-brand" strokeWidth={4} /> : <RefreshCw className="w-4 h-4 text-brand" />}
                              {syncingCardRating ? 'Syncing…' : 'Sync Card Rating API'}
                            </button>
                            {/* Mobile only: logout lives in this ellipsis menu */}
                            <div className="sm:hidden border-t border-hair mt-1 pt-1">
                              <button
                                onClick={() => { setActionsOpen(false); onLogout(); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neg font-medium hover:bg-surface transition-colors"
                              >
                                <LogOut className="w-4 h-4" /> Logout
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
              <button
                onClick={onLogout}
                className="hidden sm:flex items-center gap-2 px-3 h-9 text-faint hover:text-neg rounded-lg transition-colors text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
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
          const isEmptyPeriod = hasTracking && totalStats.clicks === 0 && totalStats.commissions === 0;
          // Top affiliates by earnings (for the Insights bar-list, design file)
          const topAffiliates = [...(users as any[])]
            .filter(u => (u.stats?.totalCommissions || 0) > 0)
            .sort((a, b) => (b.stats?.totalCommissions || 0) - (a.stats?.totalCommissions || 0))
            .slice(0, 6)
            .map(u => ({ name: u.name || u.email || 'Unknown', earned: Math.round(u.stats?.totalCommissions || 0) }));
          const maxAffEarn = Math.max(1, ...topAffiliates.map(a => a.earned));
          const showAffiliates = topAffiliates.length > 0;
          const showTopCards = mostApprovedCards.length > 0;

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
              {/* ── Pull-to-expand header (compact by default, design) ── */}
              <div data-anim className="flex items-center justify-between gap-3.5 flex-wrap">
                <button onClick={togglePerf} title={perfOpen ? 'Minimize performance' : 'Show performance'}
                  className="flex items-center gap-2.5 cursor-pointer group flex-shrink-0">
                  <ChevronRight className={`w-[15px] h-[15px] text-faint transition-transform duration-200 ${perfOpen ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                  <span className="text-[19px] font-bold text-ink tracking-[-0.02em] group-hover:opacity-70 transition-opacity">Network performance</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-soft text-brand-dark ring-1 ring-brand/30 align-middle tracking-normal">
                    {STAT_PERIOD_SHORT[statPeriod]}
                  </span>
                </button>

                {/* Collapsed: compact swipeable KPI summary */}
                {!perfOpen && (
                  <div className="flex items-center gap-4 overflow-x-auto ds-chips min-w-0">
                    {statRows.map(({ label, raw, fmt }) => (
                      <span key={label} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-[15px] font-bold text-ink tracking-[-0.01em] tabular-nums">{fmt(raw)}</span>
                        <span className="text-[12px] font-medium text-faint">{label}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded: period selector */}
                {perfOpen && (
                  <div className="flex items-center gap-2 min-w-0 max-w-full">
                    <div className="flex items-center gap-4 sm:gap-5 overflow-x-auto ds-chips -mx-1 px-1">
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
                )}
              </div>

              <div ref={perfBodyRef} className="overflow-hidden">
              <p className="text-xs sm:text-sm text-faint mt-3.5">
                {STAT_PERIOD_LABELS[statPeriod]}
                <span className="text-faint2 mx-1.5">•</span>
                {users.length.toLocaleString()} affiliate{users.length === 1 ? '' : 's'}
              </p>

              {isEmptyPeriod && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-faint font-medium">
                  <RefreshCw className="w-3 h-3" /> No activity recorded for {STAT_PERIOD_LABELS[statPeriod].split(' vs ')[0].toLowerCase()}
                </div>
              )}

              {/* ── KPI band — borderless big numbers, hairline-separated (mock layout) ── */}
              <div data-anim className="grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-x-3 gap-y-6 pb-7 border-b border-hair">
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

              {/* ── Insights: top affiliates by earnings + top approved cards (design file) ── */}
              {(showAffiliates || showTopCards) && (
                <div data-anim className="border-b border-hair py-3">
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={toggleInsights} title={insightsOpen ? 'Minimize insights' : 'Show insights'}
                      className="flex items-center gap-2 cursor-pointer group">
                      <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${insightsOpen ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                      <span className="text-[15px] font-bold text-ink group-hover:opacity-70 transition-opacity">Insights</span>
                    </button>
                    {!insightsOpen && <span className="text-[12.5px] text-faint font-medium">Top affiliates &amp; cards hidden</span>}
                  </div>
                  <div ref={insBodyRef} className="overflow-hidden">
                  <div
                    onScroll={e => { if (window.innerWidth < 1024) setInsCard(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth))); }}
                    className={`pt-5 ${showAffiliates && showTopCards ? 'flex gap-0 overflow-x-auto snap-x snap-mandatory ds-chips lg:grid lg:grid-cols-[1.7fr_1fr] lg:overflow-visible' : 'grid grid-cols-1'}`}
                  >
                    {/* Top affiliates by earnings */}
                    {showAffiliates && (
                    <div className={showTopCards ? 'snap-start shrink-0 w-full lg:w-auto lg:pr-9' : ''}>
                      <h3 className="text-[15px] font-bold text-ink mb-4">Top affiliates by earnings</h3>
                      {topAffiliates.map(a => (
                        <div key={a.name} className="mb-3.5">
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-[13px] font-medium text-ink truncate pr-3">{a.name}</span>
                            <span className="text-[13px] font-medium text-ink tabular-nums flex-shrink-0">${a.earned.toLocaleString()}</span>
                          </div>
                          <div className="h-[7px] rounded-md bg-hair2 overflow-hidden">
                            <div className="h-full rounded-md bg-brand" style={{ width: `${Math.max(3, (a.earned / maxAffEarn) * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                    {/* Top approved cards */}
                    {showTopCards && (
                    <div className={showAffiliates ? 'snap-start shrink-0 w-full lg:w-auto lg:pl-9 lg:border-l lg:border-hair' : ''}>
                      <h3 className="text-[15px] font-bold text-ink mb-0.5">Top approved cards</h3>
                      <p className="text-[12.5px] text-faint mb-3.5">Across all affiliates</p>
                      {mostApprovedCards.map((c, idx) => (
                        <div key={c.name} className="flex items-center gap-3.5 py-2.5 border-b border-hair2">
                          <span className="text-[13px] font-medium text-faint2 w-3.5 flex-shrink-0 tabular-nums">{idx + 1}</span>
                          <span className="text-[13px] font-medium text-ink truncate flex-1 min-w-0">{c.name}</span>
                          <span className="text-sm font-bold text-ink flex-shrink-0 tabular-nums">{c.approvals}</span>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                  {showAffiliates && showTopCards && (
                    <div className="flex lg:hidden items-center justify-center gap-1.5 pt-3">
                      {[0, 1].map(i => (
                        <span key={i} className={`h-1.5 rounded-full transition-all ${insCard === i ? 'w-5 bg-brand' : 'w-1.5 bg-hair'}`} />
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              )}
              </div>
            </div>
          );
        })()}

        {/* Tab panels — the tab nav lives in the header. Real swipe carousel on mobile. */}
        <SwipeCarousel
          order={['affiliates', 'tracking', 'cpa-rates', 'invoices']}
          active={activeTab}
          onChange={setActiveTab}
          className="border-t border-hair pt-2"
        >

          {/* ── Affiliates Tab ── */}
          <Slide tabKey="affiliates">

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
                    onClick={() => { const next = !affiliateGroupBy; setAffiliateGroupBy(next); setAffiliateCollapsed(next ? new Set(displayUsers.map((u: any) => String(u.commissionRate || 50) + '%')) : new Set()); setAffiliatesVisible(PAGE_SIZE); }}
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
              <div className="px-5 pt-4"><LastUpdated ts={lastUpdated.affiliates} /></div>
              <div>
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
                            <div onClick={toggle} className="flex items-center gap-[11px] pt-5 pb-3 border-t border-hair2 cursor-pointer hover:opacity-70 transition-opacity select-none">
                              <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} strokeWidth={2.6} />
                              <span className="text-[12.5px] font-bold text-ink tracking-[0.03em] uppercase">{rate} commission</span>
                              <span className="text-[13px] font-medium text-faint2 tabular-nums">{members.length}</span>
                            </div>
                            {!isCollapsed && members.map((user: any) => renderUserRow(user, true))}
                          </React.Fragment>
                        );
                      });
                  }
                  return pagedUsers.map((user: any) => renderUserRow(user));
                })()}
              </div>
              {/* Page-size selector — bottom of the list. Numeric options enable only when enough affiliates exist; otherwise All. */}
              <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 mt-2 border-t border-hair2">
                <p className="text-xs text-faint">
                  Showing {Math.min(affiliatesVisible, displayUsers.length)} of {displayUsers.length} affiliates
                </p>
                <div className="flex items-center gap-1.5 text-xs text-faint">
                  <span>Show</span>
                  {[25, 50, 100].map(n => {
                    const disabled = displayUsers.length <= n;
                    const active = !disabled && affiliatesPageSize === n;
                    return (
                      <button
                        key={n}
                        disabled={disabled}
                        onClick={() => { setAffiliatesPageSize(n); setAffiliatesVisible(n); }}
                        className={`px-2 py-0.5 rounded-md border transition-colors duration-150 ${
                          disabled
                            ? 'border-hair text-faint2/50 cursor-not-allowed'
                            : active
                              ? 'border-brand/30 bg-brand-soft text-brand font-medium cursor-pointer'
                              : 'border-hair text-faint hover:bg-surface cursor-pointer'
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setAffiliatesPageSize(Infinity); setAffiliatesVisible(Infinity); }}
                    className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                      (affiliatesPageSize === Infinity || affiliatesPageSize >= displayUsers.length)
                        ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                        : 'border-hair text-faint hover:bg-surface'
                    }`}
                  >
                    All
                  </button>
                </div>
              </div>
            </div>
          </Slide>

          {/* ── Tracking Activity Tab ── */}
          <Slide tabKey="tracking">
            <div className="mt-1">
              <div className="sticky top-16 z-10 bg-white p-4 border-b border-hair2 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">All Tracking Activity</h2>
                    <p className="text-xs text-faint mt-0.5">
                      {displayTrackingActivity.length}
                      {(mgTrackingFilter !== 'all' || mgTrackingStatusFilter !== 'all' || mgTrackingAffiliateFilter !== 'all')
                        ? ` of ${trackingActivity.length}` : ''} records
                    </p>
                    <div className="mt-1"><LastUpdated ts={lastUpdated.tracking} /></div>
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
                          onClick={() => { setTrackingGroupBy(value); setTrackingCollapsed(value === 'none' ? new Set() : new Set(displayTrackingActivity.map((a: any) => value === 'month' ? (() => { const d = parseLocalDate(a.clickDate); return isNaN(d.getTime()) ? '0000-00' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })() : (a.affiliateId || 'unknown')))); setTrackingVisible(trackingPageSize); }}
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
                    <div>
                      {(() => {
                            const dotColor = (s: string) => s === 'approval' ? 'var(--ds-pos)' : s === 'application' ? 'var(--ds-subtle)' : 'var(--ds-faint2)';
                            // Single row renderer — used in both flat and grouped modes
                            const TrackRow = ({ a, indent }: { a: any; indent?: boolean }) => (
                              <div key={a.id} className="flex items-center gap-3 sm:gap-4 py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150" style={{ paddingLeft: indent ? 24 : 0 }}>
                                <span className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate flex-1 min-w-0">{a.cardName || '—'}</span>
                                <span className="hidden sm:inline-flex items-center gap-1.5 w-[100px] flex-shrink-0 text-[13px] font-medium text-faint capitalize"><span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: dotColor(a.status) }} />{a.status}</span>
                                <span className="hidden lg:block w-[136px] flex-shrink-0 text-right text-[13px] font-medium text-faint truncate">{a.memberName}</span>
                                <span className="hidden md:block w-[116px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums whitespace-nowrap">{formatDate(a.clickDate)}</span>
                                <span className="hidden xl:block w-[150px] flex-shrink-0 text-right text-[13px] font-medium text-faint truncate">{a.state ? `${a.deviceType || '—'} · ${a.state}` : ''}</span>
                                <span className={`w-[76px] flex-shrink-0 text-right text-[13px] font-medium tabular-nums ${a.totalEarnings > 0 ? 'text-ink' : 'text-faint2'}`}>{a.totalEarnings > 0 ? `$${a.totalEarnings.toFixed(2)}` : '—'}</span>
                              </div>
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
                                  <div onClick={toggle} className="flex items-center gap-3 flex-wrap pt-5 pb-3 border-t border-hair2 cursor-pointer hover:opacity-70 transition-opacity select-none">
                                    <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} strokeWidth={2.6} />
                                    <span className="text-[12.5px] font-bold text-ink tracking-[0.03em] uppercase">{label}</span>
                                    {sublabel && <span className="text-[12px] text-faint font-mono-ds">{sublabel}</span>}
                                    <span className="text-[13px] font-medium text-faint2 tabular-nums">{rows.length}</span>
                                    <div className="ml-auto flex items-center gap-3 text-[12.5px] text-faint">
                                      {grpClicks    > 0 && <span className="tabular-nums">{grpClicks.toLocaleString()} clicks</span>}
                                      {grpApprovals > 0 && <span className="tabular-nums">{grpApprovals} appr.</span>}
                                      {grpEarnings  > 0 && <span className="font-bold text-ink tabular-nums">${grpEarnings.toFixed(2)}</span>}
                                    </div>
                                  </div>
                                  {!isCollapsed && rows.map((a: any) => <TrackRow key={a.id} a={a} indent />)}
                                </React.Fragment>
                              );
                            });
                          })()}
                    </div>
                    {/* Page-size selector — bottom of the list. Numeric options enable only when enough records exist; otherwise All. */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-4 mt-2 border-t border-hair2">
                      <p className="text-xs text-faint">
                        Showing {pagedTracking.length} of {displayTrackingActivity.length} records
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-faint">
                        <span>Show</span>
                        {[25, 50, 100].map(n => {
                          const disabled = displayTrackingActivity.length <= n;
                          const active = !disabled && trackingPageSize === n;
                          return (
                            <button
                              key={n}
                              disabled={disabled}
                              onClick={() => { setTrackingPageSize(n); setTrackingVisible(n); }}
                              className={`px-2 py-0.5 rounded-md border transition-colors duration-150 ${
                                disabled
                                  ? 'border-hair text-faint2/50 cursor-not-allowed'
                                  : active
                                    ? 'border-brand/30 bg-brand-soft text-brand font-medium cursor-pointer'
                                    : 'border-hair text-faint hover:bg-surface cursor-pointer'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setTrackingPageSize(Infinity); setTrackingVisible(Infinity); }}
                          className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                            (trackingPageSize === Infinity || trackingPageSize >= displayTrackingActivity.length)
                              ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                              : 'border-hair text-faint hover:bg-surface'
                          }`}
                        >
                          All
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
              </div>
            </div>
          </Slide>

          {/* ── CPA Rates Tab ── */}
          <Slide tabKey="cpa-rates">
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
                      onClick={() => { const next = !cpaGroupBy; setCpaGroupBy(next); setCpaCollapsed(next ? new Set(cpaRates.map(r => r.issuer || 'Other')) : new Set()); }}
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
                <div className="flex flex-col items-center gap-4 py-16">
                  <Spinner className="w-10 h-10" />
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

                const CpaRow = ({ rate, indent }: { rate: any; indent?: boolean }) => (
                  <div className="flex items-center gap-3 sm:gap-4 py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150" style={{ paddingLeft: indent ? 24 : 0 }}>
                    <span className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate flex-1 min-w-0">{rate.card}</span>
                    <span className="hidden sm:block w-[120px] lg:w-[140px] flex-shrink-0 text-right text-[13px] font-medium text-subtle truncate">{rate.issuer || '—'}</span>
                    <span className="hidden md:block w-[116px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums whitespace-nowrap">{rate.date ? formatDate(rate.date) : ''}</span>
                    <span className="hidden lg:flex items-center justify-end w-[96px] flex-shrink-0">
                      {rate.cardId && <button onClick={() => navigator.clipboard.writeText(rate.cardId)} title={`Copy Card ID: ${rate.cardId}`} className="inline-flex items-center gap-1 font-mono-ds text-[13px] text-faint hover:text-brand transition-colors cursor-pointer"><Copy className="w-3 h-3" />{rate.cardId}</button>}
                    </span>
                    {cpaAffiliateFilter !== 'all' && (
                      <span className="hidden sm:block w-[104px] flex-shrink-0 text-right text-[13px] font-medium text-brand tabular-nums">{rate.affiliatePayout != null && rate.affiliatePayout > 0 ? `$${rate.affiliatePayout.toLocaleString()} payout` : '—'}</span>
                    )}
                    <span className="w-[64px] flex-shrink-0 text-right text-[13px] font-medium text-pos tabular-nums">{rate.bankCpa > 0 ? `$${rate.bankCpa.toLocaleString()}` : <span className="text-faint2 font-normal">—</span>}</span>
                  </div>
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
                    <div className="px-5 py-2"><LastUpdated ts={lastUpdated.cpa} /></div>
                    <div>
                        {cpaGroupBy ? (
                          // Grouped by issuer with collapse/expand
                          (() => {
                            const groups: Record<string, any[]> = {};
                            pagedFiltered.forEach(r => {
                              const key = r.issuer || 'Other';
                              if (!groups[key]) groups[key] = [];
                              groups[key].push(r);
                            });
                            return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([issuer, rates]) => {
                              const isCollapsed = cpaCollapsed.has(issuer);
                              const toggle = () => setCpaCollapsed(prev => {
                                const next = new Set(prev);
                                next.has(issuer) ? next.delete(issuer) : next.add(issuer);
                                return next;
                              });
                              return (
                                <React.Fragment key={`group-${issuer}`}>
                                  <div onClick={toggle} className="flex items-center gap-[11px] pt-5 pb-3 border-t border-hair2 cursor-pointer hover:opacity-70 transition-opacity select-none">
                                    <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} strokeWidth={2.6} />
                                    <span className="text-[12.5px] font-bold text-ink tracking-[0.03em] uppercase">{issuer}</span>
                                    <span className="text-[13px] font-medium text-faint2 tabular-nums">{rates.length}</span>
                                  </div>
                                  {!isCollapsed && rates.map(r => <CpaRow key={r.id} rate={r} indent />)}
                                </React.Fragment>
                              );
                            });
                          })()
                        ) : (
                          pagedFiltered.map(r => <CpaRow key={r.id} rate={r} />)
                        )}
                    </div>
                    {/* Page-size selector — bottom of the list. Numeric options enable only when enough records exist; otherwise All. */}
                    <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 mt-2 border-t border-hair2">
                      <p className="text-xs text-faint">
                        Showing {pagedFiltered.length} of {filtered.length} cards
                        {filtered.length !== cpaRates.length ? ` (${cpaRates.length} total)` : ''}
                        {cpaAffiliateLabel ? ` · ${cpaAffiliateLabel}` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-faint">
                        <span>Show</span>
                        {[25, 50, 100].map(n => {
                          const disabled = filtered.length <= n;
                          const active = !disabled && cpaPageSize === n;
                          return (
                            <button
                              key={n}
                              disabled={disabled}
                              onClick={() => { setCpaPageSize(n); setCpaVisible(n); }}
                              className={`px-2 py-0.5 rounded-md border transition-colors duration-150 ${
                                disabled
                                  ? 'border-hair text-faint2/50 cursor-not-allowed'
                                  : active
                                    ? 'border-brand/30 bg-brand-soft text-brand font-medium cursor-pointer'
                                    : 'border-hair text-faint hover:bg-surface cursor-pointer'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setCpaPageSize(Infinity); setCpaVisible(Infinity); }}
                          className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                            (cpaPageSize === Infinity || cpaPageSize >= filtered.length)
                              ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                              : 'border-hair text-faint hover:bg-surface'
                          }`}
                        >
                          All
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Slide>
          {/* ── Invoices Tab ── */}
          <Slide tabKey="invoices">
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
                        onClick={() => { setInvoiceGroupBy(value); setInvoiceCollapsed(value === 'none' ? new Set() : new Set(invoices.map((inv: any) => value === 'month' ? (inv.date?.substring(0, 7) || inv.month || 'unknown') : (inv.email || 'unknown')))); setInvoicesVisible(PAGE_SIZE); }}
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
                    {invoicesLoading ? <Spinner className="w-3.5 h-3.5" strokeWidth={4} /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh
                  </button>
                </div>
              </div>

              {invoicesLoading ? (
                <div className="flex flex-col items-center gap-4 py-16">
                  <Spinner className="w-10 h-10" />
                  <p className="text-faint text-sm">Loading invoices…</p>
                </div>
              ) : (() => {
                const filtered = applySort(
                  invoices.filter((inv: any) =>
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
                  </div>
                );
                const pagedFiltered = filtered.slice(0, invoicesVisible);
                return (
                  <div className="overflow-x-auto">
                    <div className="px-5 py-2"><LastUpdated ts={lastUpdated.invoices} /></div>
                    <div>
                        {(() => {
                          const InvRow = ({ inv, indent }: { inv: any; indent?: boolean }) => {
                            const busy = updatingInvoice === inv.id;
                            const isOpen = expandedInvoices.has(inv.id);
                            const menuOpen = rowMenu === inv.id;
                            const toggleOpen = () => setExpandedInvoices(prev => {
                              const next = new Set(prev);
                              next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id);
                              return next;
                            });
                            const allCards = getInvoiceCards(inv);
                            const approvedCards = allCards.filter((c: any) => c.status === 'approval');
                            const cards = isOpen ? approvedCards : [];
                            const approvalsCount = approvedCards.length;
                            const paid = inv.status && inv.status.toLowerCase().includes('paid');
                            const pending = inv.status && inv.status.toLowerCase().includes('pending');
                            const statusDot = paid ? 'var(--ds-pos)' : pending ? 'var(--ds-warn)' : 'var(--ds-faint2)';
                            return (
                              <React.Fragment key={inv.id}>
                                <div className="flex items-center gap-3 sm:gap-4 py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150" style={{ paddingLeft: indent ? 24 : 0 }}>
                                  <button onClick={toggleOpen} className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer">
                                    <ChevronRight className={`w-3.5 h-3.5 text-faint flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                                    <span className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate">{inv.name}</span>
                                  </button>
                                  <span className="hidden sm:block w-[96px] flex-shrink-0 text-right text-[13px] font-medium text-faint">{inv.month}</span>
                                  <span className="w-[64px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums">{approvalsCount} appr.</span>
                                  <span className="hidden md:inline-flex items-center justify-end gap-1.5 w-[112px] flex-shrink-0 text-[13px] font-medium text-faint capitalize">
                                    {(inv.sent || inv.sentZelle)
                                      ? <span className="text-pos">{inv.sentZelle ? 'Zelle sent' : 'Sent'}</span>
                                      : inv.status ? <><span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: statusDot }} />{inv.status}</> : ''}
                                  </span>
                                  <div className={`w-[92px] flex-shrink-0 text-right text-[13px] font-medium tabular-nums ${inv.amount > 0 ? 'text-ink' : 'text-faint2'}`}>
                                    {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
                                  </div>
                                  {busy ? <Spinner className="w-4 h-4 flex-shrink-0" strokeWidth={4} /> : (
                                    <div className="relative flex-shrink-0">
                                      <button onClick={() => setRowMenu(menuOpen ? null : inv.id)} title="Actions" className="w-8 h-8 rounded-lg flex items-center justify-center text-faint hover:text-ink hover:bg-hair2 transition-colors cursor-pointer"><MoreHorizontal className="w-[18px] h-[18px]" /></button>
                                      {menuOpen && (
                                        <>
                                          <div className="fixed inset-0 z-10" onClick={() => setRowMenu(null)} />
                                          <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg ring-1 ring-ink/10 z-20 overflow-hidden py-1">
                                            <button onClick={() => { setRowMenu(null); updateInvoice(inv.id, { sent: !inv.sent }); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle hover:bg-surface transition-colors"><CheckCircle className={`w-4 h-4 ${inv.sent ? 'text-emerald-600' : 'text-faint'}`} />{inv.sent ? 'Unmark sent' : 'Mark payout sent'}</button>
                                            <button onClick={() => { setRowMenu(null); updateInvoice(inv.id, { sentZelle: !inv.sentZelle }); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle hover:bg-surface transition-colors"><Send className={`w-4 h-4 ${inv.sentZelle ? 'text-emerald-600' : 'text-faint'}`} />{inv.sentZelle ? 'Unmark Zelle' : 'Mark Zelle sent'}</button>
                                            {inv.zelle && <div className="px-4 py-2 text-xs text-faint border-t border-hair2 mt-1">Zelle: <span className="font-mono-ds text-subtle">{inv.zelle}</span></div>}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {isOpen && (
                                  <div className="pl-7 pb-2 border-b border-hair2">
                                    {!trackingActivity.length ? (
                                      <p className="text-xs text-faint py-3 flex items-center gap-2"><Spinner className="w-3.5 h-3.5" strokeWidth={4} /> Loading cards…</p>
                                    ) : cards.length === 0 ? (
                                      <p className="text-xs text-faint py-3">No approvals found for {inv.name} in {inv.month}.</p>
                                    ) : (
                                      <>
                                        <div className="text-[11px] font-semibold text-faint2 uppercase tracking-[0.04em] pt-3 pb-1">Approvals ({cards.length})</div>
                                        {cards.map((c: any) => (
                                          <div key={c.id} className="flex items-center gap-4 py-2.5 border-b border-hair2 last:border-b-0">
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-semibold text-ink truncate">{c.cardName}</div>
                                              <div className="text-xs text-faint mt-0.5">{formatDate(c.clickDate)}</div>
                                            </div>
                                            <div className={`text-sm font-bold tabular-nums flex-shrink-0 ${c.totalEarnings > 0 ? 'text-ink' : 'text-faint2'}`}>{c.totalEarnings > 0 ? `$${c.totalEarnings.toFixed(2)}` : '—'}</div>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                  </div>
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
                                <div onClick={toggle} className="flex items-center gap-3 flex-wrap pt-5 pb-3 border-t border-hair2 cursor-pointer hover:opacity-70 transition-opacity select-none">
                                  <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} strokeWidth={2.6} />
                                  <span className="text-[12.5px] font-bold text-ink tracking-[0.03em] uppercase">{getLabel(key, rows)}</span>
                                  {sublabel && <span className="text-[12px] text-faint font-mono-ds">{sublabel}</span>}
                                  <span className="text-[13px] font-medium text-faint2 tabular-nums">{rows.length}</span>
                                  <div className="ml-auto flex items-center gap-3 text-[12.5px] text-faint">
                                    {grpApprovals > 0 && <span className="tabular-nums">{grpApprovals} appr.</span>}
                                    {grpSent      > 0 && <span className="tabular-nums">{grpSent} paid</span>}
                                    {grpAmount    > 0 && <span className="font-bold text-ink tabular-nums">${grpAmount.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
                                  </div>
                                </div>
                                {!isCollapsed && rows.map((inv: any) => <InvRow key={inv.id} inv={inv} indent />)}
                              </React.Fragment>
                            );
                          });
                        })()}
                    </div>
                    {/* Page-size selector — bottom of the list. Numeric options enable only when enough invoices exist; otherwise All. */}
                    <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 mt-2 border-t border-hair2">
                      <p className="text-xs text-faint">
                        Showing {pagedFiltered.length} of {filtered.length} invoices
                        {invoices.length !== filtered.length ? ` (${invoices.length} total)` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-faint">
                        <span>Show</span>
                        {[25, 50, 100].map(n => {
                          const disabled = filtered.length <= n;
                          const active = !disabled && invoicesPageSize === n;
                          return (
                            <button
                              key={n}
                              disabled={disabled}
                              onClick={() => { setInvoicesPageSize(n); setInvoicesVisible(n); }}
                              className={`px-2 py-0.5 rounded-md border transition-colors duration-150 ${
                                disabled
                                  ? 'border-hair text-faint2/50 cursor-not-allowed'
                                  : active
                                    ? 'border-brand/30 bg-brand-soft text-brand font-medium cursor-pointer'
                                    : 'border-hair text-faint hover:bg-surface cursor-pointer'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setInvoicesPageSize(Infinity); setInvoicesVisible(Infinity); }}
                          className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                            (invoicesPageSize === Infinity || invoicesPageSize >= filtered.length)
                              ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                              : 'border-hair text-faint hover:bg-surface'
                          }`}
                        >
                          All
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Slide>

        </SwipeCarousel>

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
