import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Spinner } from './ui/spinner';
import { prefersReducedMotion } from './ui/utils';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
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
  ChevronRight,
  ChevronsUpDown,
  ArrowLeft,
  FileText,
  Search,
  Layers,
  Activity,
  Award,
  User,
  Link2,
  X,
  Plus,
  Check,
  MoreHorizontal,
  Gift,
  Sparkles,
} from 'lucide-react';
import React from 'react';
import { ComposedChart, LineChart, Line, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import * as Tabs from '@radix-ui/react-tabs';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Profile } from './Profile';
import { SwipeCarousel, Slide } from './ui/swipe-tabs';

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
  cardId?: string;
  cardType?: string;
  cardUse?: string;
  imageUrl?: string;
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
  processDate: string;
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

/**
 * Build the `&var2=…` query param for a tracking link.
 * The Airtable `ezrxref-` field now stores the full value (prefix + number,
 * e.g. "ezrxref-14"); some legacy values may be just the number. Either way we
 * emit exactly one `ezrxref-` prefix so the link never double-prefixes.
 */
function var2Param(ref: string): string {
  const v = (ref || '').trim();
  if (!v) return '';
  const full = v.toLowerCase().startsWith('ezrxref-') ? v : `ezrxref-${v}`;
  return `&var2=${full}`;
}

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

/** Polished empty-state block — friendly icon badge, headline, subtext, optional CTA.
   Used across the tabs so an empty Cards / Activity / Invoices view still feels designed. */
function EmptyState({ icon: Icon, title, subtitle, action }: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-16 sm:py-24 ds-rise">
      <div className="relative mb-5">
        <div className="absolute inset-0 -m-2.5 rounded-[22px] bg-brand-soft/70 blur-[3px]" aria-hidden />
        <div className="relative w-[64px] h-[64px] rounded-[18px] bg-gradient-to-b from-white to-brand-soft ring-1 ring-hair flex items-center justify-center shadow-[0_6px_16px_-8px_rgba(10,132,255,0.4)]">
          <Icon className="w-[26px] h-[26px] text-brand" strokeWidth={1.7} />
        </div>
      </div>
      <h3 className="text-[17px] font-semibold text-ink tracking-[-0.015em] mb-1.5">{title}</h3>
      <p className="text-[13.5px] text-faint leading-relaxed max-w-[320px]">{subtitle}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Max cards a partner can feature on their share link (drives the slot meter).
const LINK_MAX = 6;

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
            className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
          <span className="text-faint text-xs">to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs border border-hair rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
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
      aria-sort={sort.field === field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`py-3 px-4 text-faint text-xs font-semibold cursor-pointer select-none hover:text-subtle transition-colors duration-150 text-${align}`}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${sort.field === field ? 'text-brand' : ''}`}>
        {label}{icon}
      </span>
    </th>
  );
}

// Smoothly counts a number up to its target on mount / when it changes (GSAP)
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) { el.textContent = format(value); prev.current = value; return; }
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
  const [lastUpdated, setLastUpdated] = useState<number | undefined>(undefined);
  const [firstName, setFirstName]   = useState('');
  const [masterLink, setMasterLink] = useState('');
  const [ezrxRef,   setEzrxRef]     = useState('');
  const [linkBuilderIds, setLinkBuilderIds] = useState<string[]>([]);
  // Featured-cards panel (the boost chip in the link bar) open/closed.
  const [boostOpen, setBoostOpen] = useState(false);
  // Which card's bonus/details popover is tapped open (mobile — desktop uses hover).
  const [bonusOpenId, setBonusOpenId] = useState<string | number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState('cards');   // controlled tabs (drives nav menu)
  const [navOpen,   setNavOpen]     = useState(false);     // mobile ellipsis nav menu

  // Activity tab (Airtable API Output)
  const [trackingFilter,       setTrackingFilter]       = useState<DateFilter>('week');
  const [trackingCustomFrom,   setTrackingCustomFrom]   = useState('');
  const [trackingCustomTo,     setTrackingCustomTo]     = useState('');
  const [trackingSort,         setTrackingSort]         = useState<SortState>({ field: 'processDate', dir: 'desc' });
  const [trackingStatusFilter, setTrackingStatusFilter] = useState('all');

  // Cards tab — sort + filters + search + group
  const [cardsSort,         setCardsSort]         = useState<SortState>({ field: 'earned', dir: 'desc' });
  const [cardsIssuerFilter, setCardsIssuerFilter] = useState('all');
  const [cardsPayoutFilter, setCardsPayoutFilter] = useState('all');
  const [cardsTypeFilter,   setCardsTypeFilter]   = useState('all');
  const [cardsSearch,       setCardsSearch]       = useState('');
  const [cardsGroupBy,      setCardsGroupBy]      = useState(false);
  const [cardsCollapsed,    setCardsCollapsed]    = useState<Set<string>>(new Set());

  // Pagination
  const [cardsVisible,    setCardsVisible]    = useState(PAGE_SIZE);
  const [cardsPageSize,   setCardsPageSize]   = useState<number>(PAGE_SIZE);
  const [activityVisible, setActivityVisible] = useState<number>(Infinity);
  const [activityPageSize, setActivityPageSize] = useState<number>(Infinity); // default "All"; numeric limits enable only when enough records exist
  const [invoicesVisible, setInvoicesVisible] = useState(PAGE_SIZE);
  const [invoicesPageSize, setInvoicesPageSize] = useState<number>(PAGE_SIZE);

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
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [insCard, setInsCard] = useState(0);   // active Insights panel on mobile (swipe)
  const insBodyRef = useRef<HTMLDivElement>(null);
  const [perfOpen, setPerfOpen] = useState(false);   // Performance compact by default, pull to expand (design)
  const perfBodyRef = useRef<HTMLDivElement>(null);
  const [linkBarH, setLinkBarH] = useState(0);      // measured referral-bar height → sticky offset for tab toolbars
  const linkBarRef = useRef<HTMLDivElement>(null);
  const [chartMetric, setChartMetric] = useState<'approvals' | 'clicks' | 'earnings'>('approvals');
  const [scrolled, setScrolled] = useState(false);

  // Smoothly tween the Insights body open/closed (GSAP, from the design file)
  const toggleInsights = () => {
    const willOpen = !insightsOpen;
    const el = insBodyRef.current;
    if (el) {
      gsap.killTweensOf(el);
      if (prefersReducedMotion()) {
        gsap.set(el, willOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 });
      } else if (willOpen) {
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
      if (prefersReducedMotion()) {
        gsap.set(el, willOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 });
      } else if (willOpen) {
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

  // Sticky chrome shrinks once the page is scrolled (mock behavior).
  // Hysteresis (collapse >72, expand <24) + rAF throttle avoids flicker when
  // the bar's own height change nudges scrollY back across a single threshold.
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

  // Measure the sticky referral bar so the tab toolbars can pin right below it
  // (its height changes with collapse state, link length, and viewport wrapping).
  useEffect(() => {
    const el = linkBarRef.current;
    if (!el) { setLinkBarH(0); return; }
    const update = () => setLinkBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, masterLink, linkBuilderIds.length]);

  // GSAP entrance — sections rise/fade as they scroll into view (ScrollTrigger).
  // Gated through gsap.matchMedia so reduced-motion users get no hide/reveal at
  // all (the matched callback simply never runs, leaving sections fully visible).
  useEffect(() => {
    if (loading) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set('[data-anim]', { opacity: 0, y: 16 });
      const triggers = ScrollTrigger.batch('[data-anim]', {
        start: 'top 88%',
        onEnter: (batch) => gsap.to(batch, {
          opacity: 1, y: 0, duration: 0.55, stagger: 0.08, ease: 'power2.out', overwrite: true,
        }),
      });
      ScrollTrigger.refresh();
      return () => triggers.forEach(t => t.kill());
    });
    return () => mm.revert();
  }, [loading]);
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
  // Activity is organised by process date (when the lead was processed).
  const displayTracking = applySort(
    tracking.filter(t =>
      inDateRange(t.processDate || t.clickDate, trackingFilter, trackingCustomFrom, trackingCustomTo) &&
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

  // Cards tab: join links (URL + stats) with payouts (issuer + CPA amount + CardRatingAPI enrichment) by normalised name
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
      conv:     link.clicks > 0 ? (link.conversions / link.clicks) * 100 : 0,
      earned:   (cpa?.amount ?? 0) * link.conversions,
      url:      link.url,
      cardId:   cpa?.cardId   ?? '',
      cardType: cpa?.cardType ?? '',
      cardUse:  cpa?.cardUse  ?? '',
      imageUrl: cpa?.imageUrl ?? '',
      annualFee:        cpa?.annualFee        ?? '',
      introBonus:       cpa?.introBonus       ?? '',
      introAprRate:     cpa?.introAprRate     ?? '',
      introAprDuration: cpa?.introAprDuration ?? '',
      bonusMilesFull:   cpa?.bonusMilesFull   ?? '',
    };
  });
  const cardIssuers = Array.from(new Set(allCards.map(c => c.issuer).filter(Boolean))).sort() as string[];
  // Derive available card types for the filter (only types that actually appear in data)
  const cardTypes = Array.from(new Set(allCards.map(c => c.cardType).filter(Boolean))).sort() as string[];
  const displayCards = applySort(
    allCards.filter(c => {
      if (cardsSearch && !c.name.toLowerCase().includes(cardsSearch.toLowerCase()) &&
          !(c.issuer || '').toLowerCase().includes(cardsSearch.toLowerCase())) return false;
      if (cardsIssuerFilter !== 'all' && c.issuer !== cardsIssuerFilter) return false;
      if (cardsTypeFilter !== 'all' && c.cardType !== cardsTypeFilter) return false;
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
      // Snapshot sync time (when a manager last refreshed the data) — falls back
      // to now only if the backend didn't report one.
      setLastUpdated(trackingData.syncedAt || Date.now());

      const name = userData.user?.name || '';
      setFirstName(name.split(' ')[0] || '');
      setEzrxRef((userData.user?.ezrxRef || '').trim());

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
    const color = up ? 'text-brand' : 'text-neg';
    return (
      <span className={`inline-flex items-center gap-0.5 ${color}`}>
        <ChevronUp className={`w-3.5 h-3.5 -ml-0.5 ${!up ? 'rotate-180' : ''}`} strokeWidth={2.5} />
        <span className="text-[13.5px] font-semibold tabular-nums">{up ? '+' : ''}{pct}%</span>
      </span>
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
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <Spinner className="w-[52px] h-[52px]" />
          <p className="text-faint text-[17px] font-medium">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { key: 'cards',    label: 'Cards',       Icon: CreditCard, badge: 0 },
    { key: 'activity', label: 'Activity',    Icon: Activity,   badge: 0 },
    { key: 'invoices', label: 'Invoices',    Icon: FileText,   badge: invoices.length },
    { key: 'profile',  label: 'Profile',     Icon: User,       badge: 0 },
  ] as const;

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-30 border-b border-hair">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-[60px] gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <h1 className="hidden sm:block text-ink font-bold text-[16px] tracking-tight">Affiliate Portal</h1>
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
              {/* Desktop: inline utility actions */}
              <button
                onClick={fetchData}
                className="hidden sm:block p-2 text-faint hover:text-brand hover:bg-surface active:scale-95 rounded-lg transition-all duration-150 cursor-pointer"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {(firstName || userEmail) && (
                <span className="hidden sm:flex items-center gap-2 text-subtle text-sm pl-1 pr-3 py-1 rounded-full">
                  <span className="w-7 h-7 rounded-full bg-brand text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
                    {(firstName || userEmail).charAt(0).toUpperCase()}
                  </span>
                  {firstName ? `Hi, ${firstName}` : userEmail}
                </span>
              )}
              <button
                onClick={onLogout}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-faint hover:text-neg active:scale-95 rounded-lg transition-all duration-150 text-sm font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>

              {/* Mobile: ellipsis menu — refresh & logout collapse in here */}
              <div className="relative sm:hidden">
                <button
                  onClick={() => setNavOpen(o => !o)}
                  aria-label="Menu"
                  className="flex items-center justify-center w-10 h-10 -mr-2 rounded-lg text-subtle hover:text-ink hover:bg-surface active:scale-95 transition-all cursor-pointer"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {navOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setNavOpen(false)} />
                    <div className="absolute right-0 mt-1 w-52 bg-white rounded-2xl shadow-lg ring-1 ring-ink/10 z-30 overflow-hidden py-1.5 ds-rise">
                      {(firstName || userEmail) && (
                        <div className="flex items-center gap-2.5 px-4 py-2.5 mb-1 border-b border-hair">
                          <span className="w-7 h-7 rounded-full bg-brand text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
                            {(firstName || userEmail).charAt(0).toUpperCase()}
                          </span>
                          <span className="text-sm font-semibold text-ink truncate">{firstName ? `Hi, ${firstName}` : userEmail}</span>
                        </div>
                      )}
                      <button
                        onClick={() => { setNavOpen(false); fetchData(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-subtle font-medium hover:bg-surface transition-colors"
                      >
                        <RefreshCw className="w-4 h-4 text-faint2" /> Refresh data
                      </button>
                      <button
                        onClick={() => { setNavOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neg font-medium hover:bg-surface transition-colors"
                      >
                        <LogOut className="w-4 h-4" /> Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
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
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-ink text-white rounded-full shadow-lg hover:bg-subtle active:scale-95 transition-all duration-150 text-xs font-semibold cursor-pointer ring-1 ring-white/10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Exit to Admin
        </button>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-14">
        {/* ── Referral link — clean sticky bar at top, always visible (mock design) ── */}
        {masterLink ? (() => {
          const builtLink = linkBuilderIds.length > 0
            ? `https://www.cardratings.com/bestcards/featured-credit-cards?src=693350&shnq=${linkBuilderIds.join(',')}${var2Param(ezrxRef)}`
            : null;
          const displayLink = builtLink ?? masterLink;
          const featured = linkBuilderIds.map(id => allCards.find(c => c.cardId === id)).filter(Boolean) as any[];
          const featuredCount = linkBuilderIds.length;
          const maxPayout = featured.reduce((s, c) => s + (c.cpa || 0), 0);
          return (
          <div
            ref={linkBarRef}
            data-anim
            className="sticky top-[60px] z-20 mb-5 -mx-4 sm:-mx-6 lg:-mx-8 bg-white/95 backdrop-blur-md border-b border-hair"
          >
          {/* Compact referral link bar — single line, with a "featured" boost chip */}
          <div className="relative flex items-center gap-3 py-2.5 px-4 sm:px-6 lg:px-8">
            <Link2 className="w-4 h-4 text-faint2 flex-shrink-0" />
            <span className="font-mono-ds text-[13px] font-medium text-ink truncate flex-1 min-w-0">
              {displayLink}
            </span>

            {/* Boost chip — featured count + slot meter; opens the featured panel */}
            <button onClick={() => setBoostOpen(o => !o)} title="Cards featured on your link"
              className={`flex items-center gap-2 h-7 pl-2.5 pr-2 rounded-full border text-[12px] font-semibold flex-shrink-0 cursor-pointer transition-colors ${boostOpen || featuredCount > 0 ? 'border-brand/30 text-brand bg-brand-soft' : 'border-hair text-subtle hover:border-brand/40 hover:text-brand'}`}>
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span className="tabular-nums">{featuredCount}</span>
              <span className="hidden sm:flex items-center gap-[3px]">
                {Array.from({ length: LINK_MAX }).map((_, i) => (
                  <span key={i} className="w-[6px] h-[6px] rounded-full" style={{ background: i < featuredCount ? 'var(--ds-brand)' : 'var(--ds-hair)' }} />
                ))}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${boostOpen ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={() => copyToClipboard(displayLink, -1)}
              title="Copy link"
              className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-brand text-white text-[12.5px] font-semibold hover:bg-brand-dark transition-colors flex-shrink-0 cursor-pointer"
            >
              {copiedId === -1 ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
            <a href={displayLink} target="_blank" rel="noopener noreferrer" title="Preview link"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-faint hover:text-ink hover:bg-surface transition-colors flex-shrink-0 cursor-pointer">
              <ExternalLink className="w-[15px] h-[15px]" />
            </a>

            {/* Featured-cards panel */}
            {boostOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setBoostOpen(false)} />
                <div className="absolute right-4 sm:right-6 lg:right-8 top-full mt-2 z-20 w-[340px] max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-hair shadow-[0_16px_44px_rgba(15,23,42,0.16)] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">Featured on your link</span>
                    <span className="text-[12px] font-medium text-faint tabular-nums">{featuredCount} / {LINK_MAX}</span>
                  </div>
                  {featured.length > 0 ? (
                    <>
                      <div className="max-h-[280px] overflow-y-auto border-t border-hair2">
                        {featured.map(c => (
                          <div key={c.cardId} className="flex items-center gap-3 px-4 py-2.5 border-b border-hair2 last:border-b-0">
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-ink truncate">{c.name}</div>
                              <div className="text-[12px] text-faint truncate">{c.issuer || '—'}</div>
                            </div>
                            <span className="text-[13px] font-medium text-pos tabular-nums flex-shrink-0">{c.cpa > 0 ? `$${c.cpa.toLocaleString()}` : '—'}</span>
                            <button onClick={() => setLinkBuilderIds(prev => prev.filter(id => id !== c.cardId))} title="Remove"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-faint2 hover:text-neg hover:bg-hair2 transition-colors flex-shrink-0 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-surface border-t border-hair2">
                        <span className="text-[12px] text-faint font-medium">Max payout / approval</span>
                        <span className="text-[14px] font-semibold text-ink tabular-nums">${maxPayout.toLocaleString()}</span>
                      </div>
                    </>
                  ) : (
                    <div className="px-4 py-6 text-center border-t border-hair2">
                      <p className="text-[13px] text-faint leading-relaxed">
                        No cards featured yet. Add some from the{' '}
                        <button onClick={() => { setBoostOpen(false); setActiveTab('cards'); }} className="font-semibold text-brand hover:underline cursor-pointer">Cards</button>{' '}tab to boost your link.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          </div>
          );
        })() : (
          <div className="mb-6 py-4 border-b border-hair text-sm text-faint">
            No affiliate link configured yet — contact your manager to set up your link.
          </div>
        )}

        {/* ── Compact summary bar — all panels in one card, max 30vh ── */}
        {(() => {
          // Build monthly data for charts (all-time, not period-filtered)
          const monthMap: Record<string, { month: string; clicks: number; approvals: number; applications: number; earnings: number }> = {};
          tracking.forEach(t => {
            if (!t.clickDate) return;
            const d = parseLocalDate(t.clickDate);
            if (isNaN(d.getTime())) return;
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (!monthMap[key]) monthMap[key] = { month: d.toLocaleDateString('en-US', { month:'short', year:'2-digit' }), clicks: 0, approvals: 0, applications: 0, earnings: 0 };
            monthMap[key].clicks      += t.clicks       || 0;
            monthMap[key].approvals   += t.approvals    || 0;
            monthMap[key].applications+= t.applications || 0;
            monthMap[key].earnings    += t.totalEarnings|| 0;
          });
          const monthlyData = Object.entries(monthMap).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v);

          // Persistent end-dot + glow on the approvals line (mock design)
          const renderEndDot = (props: any) => {
            const { cx, cy, index } = props;
            if (cx == null || cy == null || index !== monthlyData.length - 1) return <g key={`ed-${index}`} />;
            return (
              <g key="ds-enddot">
                <circle cx={cx} cy={cy} r={9} fill="#0a84ff" opacity={0.16} />
                <circle cx={cx} cy={cy} r={4.5} fill="#0a84ff" />
              </g>
            );
          };

          const isEmptyPeriod = tracking.length > 0 && totalClicks === 0 && totalCommissions === 0;
          const showCharts   = monthlyData.length >= 2;
          const showTopCards = mostApprovedCards.length > 0;

          const fmtInt = (n: number) => Math.round(n).toLocaleString();
          const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
          const statRows = [
            { label: 'Clicks',       raw: totalClicks,      fmt: fmtInt, sub: null,                                                                                              pct: clicksPct },
            { label: 'Approvals',    raw: totalConversions, fmt: fmtInt, sub: totalClicks > 0 && totalConversions > 0 ? `${((totalConversions/totalClicks)*100).toFixed(1)}% conv.` : null,    pct: approvalsPct },
            { label: 'Commissions',  raw: totalCommissions, fmt: fmtUsd, sub: avgEPC > 0 ? `EPC $${avgEPC.toFixed(2)}` : null,                                                  pct: commissionsPct },
            { label: 'Applications', raw: totalApplications,fmt: fmtInt, sub: totalClicks > 0 && totalApplications > 0 ? `${((totalApplications/totalClicks)*100).toFixed(1)}% c→a` : null,    pct: applicationsPct },
          ];

          return (
            <div data-anim className="border-b border-hair py-5">
              {/* ── Pull-to-expand header (compact by default, design) ── */}
              <div className="flex items-center justify-between gap-3.5 flex-wrap">
                <button onClick={togglePerf} title={perfOpen ? 'Minimize performance' : 'Show performance'}
                  className="flex items-center gap-2.5 cursor-pointer group flex-shrink-0">
                  <ChevronRight className={`w-[15px] h-[15px] text-faint transition-transform duration-200 ${perfOpen ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                  <span className="text-[19px] font-bold text-ink tracking-[-0.02em] group-hover:opacity-70 transition-opacity">Performance</span>
                </button>

                {/* Collapsed: compact inline KPI summary */}
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
                        { value: 'week',   label: 'Week' },
                        { value: 'month',  label: 'Month' },
                        { value: 'lm',     label: 'Last month' },
                        { value: 'year',   label: 'Year' },
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
              <p className="text-[13px] text-faint mt-3.5">Showing {STAT_PERIOD_LABELS[statPeriod].toLowerCase()}</p>

              {isEmptyPeriod && (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-faint font-medium">
                  <RefreshCw className="w-3 h-3" /> No activity recorded for {STAT_PERIOD_LABELS[statPeriod].split(' vs ')[0].toLowerCase()}
                </div>
              )}

              {/* ── KPI band — borderless big numbers, hairline-separated (mock layout) ── */}
              <div data-anim className="grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-x-3 gap-y-5 pb-6 border-b border-hair">
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

              {/* ── Insights: tabbed chart / top cards ── */}
              {(showCharts || showTopCards) && (
                <div data-anim className="border-b border-hair py-3">
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={toggleInsights} title={insightsOpen ? 'Minimize insights' : 'Show insights'}
                      className="flex items-center gap-2 cursor-pointer group">
                      <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${insightsOpen ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                      <span className="text-[15px] font-bold text-ink group-hover:opacity-70 transition-opacity">Insights</span>
                    </button>
                    {!insightsOpen && <span className="text-[12.5px] text-faint font-medium">Trends &amp; top cards hidden</span>}
                  </div>
                  <div ref={insBodyRef} className="overflow-hidden">
                  <div
                    onScroll={e => { if (window.innerWidth < 1024) setInsCard(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth))); }}
                    className={`pt-5 ${showCharts && showTopCards ? 'flex gap-0 overflow-x-auto snap-x snap-mandatory ds-chips lg:grid lg:grid-cols-[1.7fr_1fr] lg:overflow-visible' : 'grid grid-cols-1'}`}
                  >
                    {/* Chart */}
                    {showCharts && (
                    <div className={showTopCards ? 'snap-start shrink-0 w-full lg:w-auto lg:pr-9' : ''}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                        <h3 className="text-[15px] font-bold text-ink capitalize">Monthly {chartMetric}</h3>
                        <div className="flex items-center gap-4">
                          {([['approvals','Approvals'],['clicks','Clicks'],['earnings','Earnings']] as const).map(([key,label]) => (
                            <button key={key} onClick={() => setChartMetric(key)}
                              className={`text-[13px] cursor-pointer transition-colors ${chartMetric===key ? 'text-brand font-bold' : 'text-faint font-medium hover:text-subtle'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="h-48 sm:h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={monthlyData} margin={{ top:4, right:10, left:0, bottom:0 }}>
                            <defs>
                              <linearGradient id="dsApprovalsArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0a84ff" stopOpacity={0.16} />
                                <stop offset="100%" stopColor="#0a84ff" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ededed" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9499a0' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize:11, fill:'#9499a0' }} axisLine={false} tickLine={false} width={32} />
                            <Tooltip contentStyle={{ fontSize:12, borderRadius:10, border:'1px solid #ededed', boxShadow:'0 6px 20px -8px rgba(0,0,0,.18)' }} />
                            <Area dataKey={chartMetric} stroke="#0a84ff" strokeWidth={2.6} strokeLinecap="round" fill="url(#dsApprovalsArea)" dot={renderEndDot} activeDot={{ r:4, strokeWidth:0 }} animationDuration={900} animationEasing="ease-out" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    )}
                    {/* Top approved cards */}
                    {showTopCards && (
                    <div className={showCharts ? 'snap-start shrink-0 w-full lg:w-auto lg:pl-9 lg:border-l lg:border-hair' : ''}>
                      <h3 className="text-[15px] font-bold text-ink mb-0.5">Top approved cards</h3>
                      <p className="text-[12.5px] text-faint mb-3.5">Ranked by approvals</p>
                      {mostApprovedCards.map((c, idx) => (
                        <div key={c.name} className="flex items-center gap-3.5 py-2.5 border-b border-hair2">
                          <span className="text-[13px] font-medium text-faint2 w-3.5 flex-shrink-0 tabular-nums">{idx+1}</span>
                          <span className="text-[13px] font-medium text-ink truncate flex-1 min-w-0">{decodeHtml(c.name)}</span>
                          <span className="text-sm font-bold text-ink flex-shrink-0 tabular-nums">{c.approvals}</span>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                  {showCharts && showTopCards && (
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

        {/* Last updated — one line, same spot above every tab */}
        <div className="mt-5 px-0.5"><LastUpdated ts={lastUpdated} /></div>

        {/* Tab panels — the tab nav lives in the header. Real swipe carousel on mobile. */}
        <SwipeCarousel
          order={['cards', 'activity', 'invoices', 'profile']}
          active={activeTab}
          onChange={setActiveTab}
          className="mt-2"
        >

          {/* ── Cards Tab (Robinhood-style filters + list) ── */}
          <Slide tabKey="cards">
          <div>
            <div style={{ top: 60 + linkBarH }} className="sticky z-10 bg-canvas pt-6 pb-1">
            {/* Search */}
            <div className="relative mb-[13px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-faint pointer-events-none" />
              <input type="text" placeholder="Search cards or issuers" value={cardsSearch}
                onChange={e => { setCardsSearch(e.target.value); setCardsVisible(PAGE_SIZE); }}
                className="w-full h-[42px] pl-10 pr-3.5 border border-line rounded-[10px] bg-white text-[14.5px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15" />
            </div>

            {/* Type chips — smaller, under the search */}
            {cardTypes.length > 0 && (
              <div className="ds-chips flex items-center gap-1.5 overflow-x-auto mb-[14px]">
                {(['all', ...cardTypes]).map(type => {
                  const on = cardsTypeFilter === type;
                  return (
                    <button key={type} onClick={() => { setCardsTypeFilter(type); setCardsVisible(PAGE_SIZE); }}
                      className={`flex-shrink-0 h-7 px-3 rounded-full text-[12.5px] font-medium tracking-[-0.01em] whitespace-nowrap transition-colors cursor-pointer ${
                        on ? 'bg-brand text-white' : 'bg-hair2 text-subtle hover:bg-hair'
                      }`}>
                      {type === 'all' ? 'All types' : type}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bold divider */}
            <div className="h-[1.5px] bg-ink" />

            {/* Group-by + count + sort tabs */}
            <div className="flex items-center justify-between gap-3.5 flex-wrap pt-[15px] pb-1.5">
              <div className="flex items-center gap-4 flex-wrap">
                <button onClick={() => {
                  const next = !cardsGroupBy;
                  setCardsGroupBy(next);
                  setCardsCollapsed(next ? new Set(displayCards.map(c => c.issuer || 'Other')) : new Set());
                }}
                  className={`inline-flex items-center gap-1.5 text-[13px] cursor-pointer transition-colors ${cardsGroupBy ? 'text-brand font-bold' : 'text-faint font-medium hover:text-subtle'}`}>
                  <Layers className="w-3.5 h-3.5" />
                  Group by issuer
                </button>
                {cardsGroupBy && (() => {
                  const allIssuers = Array.from(new Set(displayCards.map(c => c.issuer || 'Other')));
                  const allCollapsed = allIssuers.every(i => cardsCollapsed.has(i));
                  return (
                    <button onClick={() => setCardsCollapsed(allCollapsed ? new Set() : new Set(allIssuers))}
                      className="text-[12.5px] font-medium text-faint hover:text-brand cursor-pointer transition-colors">
                      {allCollapsed ? 'Expand all' : 'Collapse all'}
                    </button>
                  );
                })()}
              </div>
              <div className="flex items-center gap-[18px]">
                <span className="text-xs font-semibold tracking-[0.04em] uppercase text-faint2">{displayCards.length} cards</span>
                {([['earned', 'Earned'], ['conv', 'Conv'], ['cpa', 'Payout']] as const).map(([key, label]) => {
                  const on = cardsSort.field === key;
                  return (
                    <button key={key}
                      onClick={() => setCardsSort(s => s.field === key ? { field: key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field: key, dir: 'desc' })}
                      className={`inline-flex items-center gap-1 text-[13px] cursor-pointer transition-colors ${on ? 'text-ink font-bold' : 'text-faint2 font-medium hover:text-subtle'}`}>
                      {label}{on && <span className="text-[11px]">{cardsSort.dir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>

            {/* Card list */}
            {(() => {
              const fmtAnnualFee = (v: string) => {
                const t = (v || '').trim();
                if (!t) return '';
                if (/^\$?0(\.0+)?$/.test(t)) return 'No annual fee';
                const amt = t.startsWith('$') ? t : `$${t}`;
                return `${amt.replace(/\.00$/, '')} annual fee`;
              };
              const CardRow = ({ card, indent }: { card: any; indent?: boolean }) => {
                const isAdded = card.cardId && linkBuilderIds.includes(card.cardId);
                const linkFull = !isAdded && linkBuilderIds.length >= LINK_MAX;
                const af = fmtAnnualFee(card.annualFee);
                const hasDetails = card.introBonus || card.bonusMilesFull || af || card.introAprRate;
                const detailContent = (
                  <>
                    {(card.introBonus || card.bonusMilesFull) && <span className="block text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint2 mb-1">Intro bonus</span>}
                    {card.introBonus && <span className="block text-[12.5px] text-ink leading-snug">{card.introBonus}</span>}
                    {card.bonusMilesFull && <span className="block text-[12px] text-faint leading-snug mt-1.5">{card.bonusMilesFull}</span>}
                    {(af || card.introAprRate || card.cardType) && (
                      <span className={`block text-[11.5px] text-subtle leading-relaxed ${(card.introBonus || card.bonusMilesFull) ? 'mt-2.5 pt-2.5 border-t border-hair2' : ''}`}>
                        {af && <span className="flex justify-between gap-3"><span className="text-faint">Annual fee</span><span className="text-ink font-medium text-right">{af.replace(' annual fee', '')}</span></span>}
                        {card.introAprRate && <span className="flex justify-between gap-3"><span className="text-faint">Intro APR</span><span className="text-ink font-medium text-right">{card.introAprRate}{card.introAprDuration ? ` · ${card.introAprDuration}` : ''}</span></span>}
                        {card.cardType && <span className="flex justify-between gap-3"><span className="text-faint">Type</span><span className="text-ink font-medium text-right">{card.cardType}</span></span>}
                      </span>
                    )}
                  </>
                );
                return (
                  <div className="flex items-center gap-[18px] py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150"
                    style={{ paddingLeft: indent ? 24 : 0 }}>
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate">{card.name}</span>
                      {hasDetails && (
                        <span className="relative group/bn flex-shrink-0 leading-none">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setBonusOpenId(prev => prev === card.id ? null : card.id)}
                            title="Card details"
                            className="flex items-center text-brand cursor-pointer">
                            <Gift className="w-[15px] h-[15px]" strokeWidth={2} />
                          </button>
                          {/* Desktop: reveal on hover */}
                          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 hidden sm:group-hover/bn:block w-[264px] p-3.5 rounded-xl bg-white shadow-lg ring-1 ring-ink/10 text-left whitespace-normal normal-case">
                            {detailContent}
                          </span>
                          {/* Mobile: tap → bottom sheet (portaled to body so it escapes the
                              swipe-carousel transform that would otherwise clip position:fixed) */}
                          {bonusOpenId === card.id && createPortal(
                            <div className="sm:hidden" onClick={() => setBonusOpenId(null)}>
                              <div className="fixed inset-0 z-[60] bg-black/30" />
                              <div className="fixed left-4 right-4 bottom-6 z-[61] p-4 rounded-2xl bg-white shadow-xl ring-1 ring-ink/10 text-left normal-case" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-start justify-between gap-3 mb-1">
                                  <span className="text-[14px] font-bold text-ink leading-snug">{card.name}</span>
                                  <button onClick={() => setBonusOpenId(null)} className="flex-shrink-0 -mt-0.5 -mr-1 p-1 text-faint2"><X className="w-4 h-4" /></button>
                                </div>
                                {detailContent}
                              </div>
                            </div>,
                            document.body
                          )}
                        </span>
                      )}
                    </div>
                    <span className="hidden sm:block w-[120px] lg:w-[150px] flex-shrink-0 text-right text-[13px] font-medium text-subtle truncate">{card.issuer || '—'}</span>
                    <div className="flex items-baseline gap-3 sm:gap-4 flex-shrink-0">
                      <span className={`hidden sm:inline-block sm:min-w-[74px] text-right text-[13px] font-medium tabular-nums whitespace-nowrap ${card.conv >= 3 ? 'text-brand' : 'text-faint'}`}>{card.conv.toFixed(1)}% conv</span>
                      <span className="inline-block sm:min-w-[72px] text-right text-[13px] font-medium text-ink tracking-[-0.02em] tabular-nums whitespace-nowrap">
                        {card.cpa > 0 ? `$${card.cpa.toLocaleString()}` : '—'}
                      </span>
                    </div>
                    {card.cardId && (
                      <button
                        type="button"
                        // Don't let the click focus the button — native focus-scroll
                        // would jump the page to the top. Keyboard focus still works.
                        onMouseDown={(e) => e.preventDefault()}
                        disabled={linkFull}
                        onClick={() => { if (linkFull) return; setLinkBuilderIds(prev => isAdded ? prev.filter(id => id !== card.cardId) : [...prev, card.cardId]); }}
                        title={isAdded ? 'Remove from your link' : linkFull ? `Your link is full (${LINK_MAX} cards max)` : 'Feature on your link'}
                        className={`flex-shrink-0 w-[26px] h-[26px] rounded-full border flex items-center justify-center transition-all duration-150 ${
                          isAdded ? 'bg-brand border-brand text-white cursor-pointer' : linkFull ? 'border-hair text-faint2/40 cursor-not-allowed' : 'border-line text-faint2 hover:border-brand hover:text-brand cursor-pointer'
                        }`}>
                        {isAdded ? <Check className="w-[13px] h-[13px]" strokeWidth={3} /> : <Plus className="w-[13px] h-[13px]" strokeWidth={2.4} />}
                      </button>
                    )}
                    {!card.cardId && <span className="w-[26px] flex-shrink-0" aria-hidden />}
                  </div>
                );
              };

              if (displayCards.length === 0) {
                return links.length === 0 ? (
                  <EmptyState
                    icon={CreditCard}
                    title="No cards yet"
                    subtitle="Your card catalogue lives here. Refresh to pull in the latest cards you can feature on your link."
                    action={
                      <button onClick={fetchData} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark active:scale-95 transition-all shadow-sm cursor-pointer">
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={Search}
                    title="No cards match"
                    subtitle="Nothing matches that category or search — try clearing your filters."
                  />
                );
              }

              if (cardsGroupBy) {
                const groups: Record<string, any[]> = {};
                displayCards.forEach(c => { const k = c.issuer || 'Other'; (groups[k] = groups[k] || []).push(c); });
                const sub = (items: any[]) => items.reduce((s, c) => s + (c.earned || 0), 0);
                const order = Object.keys(groups).sort((a, b) => sub(groups[b]) - sub(groups[a]));
                return (
                  <div>
                    {order.map(issuer => {
                      const items = groups[issuer];
                      const open = !cardsCollapsed.has(issuer);
                      const toggle = () => setCardsCollapsed(prev => { const next = new Set(prev); next.has(issuer) ? next.delete(issuer) : next.add(issuer); return next; });
                      return (
                        <React.Fragment key={`g-${issuer}`}>
                          <div onClick={toggle} className="flex items-center gap-[11px] pt-5 pb-3 border-t border-hair2 cursor-pointer hover:opacity-70 transition-opacity select-none">
                            <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 ${open ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                            <span className="text-[12.5px] font-bold text-ink tracking-[0.03em] uppercase">{issuer}</span>
                            <span className="text-[12px] font-semibold text-faint2 tabular-nums">{items.length}</span>
                            <span className="ml-auto text-[15px] font-bold text-brand tracking-[-0.02em] tabular-nums">${Math.round(sub(items)).toLocaleString()}</span>
                          </div>
                          {open && items.map(card => <CardRow key={card.id} card={card} indent />)}
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              }

              const pagedCards = displayCards.slice(0, cardsVisible);
              return (
                <div>
                  {pagedCards.map(card => <CardRow key={card.id} card={card} />)}
                  {/* Page-size selector — bottom of the list. Numeric options enable only when enough cards exist; otherwise All. */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-4 mt-2 border-t border-hair">
                    <p className="text-xs text-faint">
                      Showing {Math.min(cardsVisible, displayCards.length)} of {displayCards.length} cards
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-faint">
                      <span>Show</span>
                      {[25, 50, 100].map(n => {
                        const disabled = displayCards.length <= n;
                        const active = !disabled && cardsPageSize === n;
                        return (
                          <button
                            key={n}
                            disabled={disabled}
                            onClick={() => { setCardsPageSize(n); setCardsVisible(n); }}
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
                        onClick={() => { setCardsPageSize(Infinity); setCardsVisible(Infinity); }}
                        className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                          (cardsPageSize === Infinity || cardsPageSize >= displayCards.length)
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


          {/* ── Activity Tab ── */}
          <Slide tabKey="activity">
            {/* Sticky controls */}
            <div style={{ top: 60 + linkBarH }} className="sticky z-10 bg-canvas border-b border-hair py-3">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <FilterBar
                filter={trackingFilter}
                setFilter={v => { setTrackingFilter(v); setActivityVisible(activityPageSize); }}
                customFrom={trackingCustomFrom}
                setCustomFrom={v => { setTrackingCustomFrom(v); setActivityVisible(activityPageSize); }}
                customTo={trackingCustomTo}
                setCustomTo={v => { setTrackingCustomTo(v); setActivityVisible(activityPageSize); }}
              />
            </div>
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
                  onClick={() => { setTrackingStatusFilter(value); setActivityVisible(activityPageSize); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                    trackingStatusFilter === value
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-subtle bg-white border border-hair hover:border-brand hover:text-brand'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            </div>

          <div className="pt-5">
            {displayTracking.length === 0 ? (
              tracking.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No activity yet"
                  subtitle="Every click, application, and approval from your link will land here the moment it happens. Share your link to get the first one."
                  action={
                    <button onClick={fetchData} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark active:scale-95 transition-all shadow-sm cursor-pointer">
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No activity in this range"
                  subtitle="Nothing matches the selected dates or status — try widening the range or switching to All Time."
                />
              )
            ) : (
              <>
                <div>
                  {displayTracking.slice(0, activityVisible).map((item) => {
                    const dot = item.status === 'approval' ? 'var(--ds-pos)' : item.status === 'application' ? 'var(--ds-subtle)' : 'var(--ds-faint2)';
                    return (
                      <div key={item.id} className="flex items-center gap-3 sm:gap-4 py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150">
                        {/* Card name — flexible left column */}
                        <span className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate flex-1 min-w-0">{item.cardName || '—'}</span>
                        {/* Status */}
                        <span className="hidden sm:inline-flex items-center gap-1.5 w-[100px] flex-shrink-0 text-[13px] font-medium text-faint capitalize">
                          <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: dot }} />{item.status}
                        </span>
                        {/* Process date */}
                        <span className="w-[112px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums whitespace-nowrap">{formatDate(item.processDate || item.clickDate)}</span>
                        {/* Source (device · state) */}
                        <span className="hidden lg:block w-[160px] flex-shrink-0 text-right text-[13px] font-medium text-faint truncate">{item.state ? `${item.deviceType || '—'} · ${item.state}` : ''}</span>
                        {/* Earnings */}
                        <span className={`w-[76px] flex-shrink-0 text-right text-[13px] font-medium tabular-nums ${item.totalEarnings > 0 ? 'text-ink' : 'text-faint2'}`}>
                          {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Page-size selector — bottom of the list. Numeric options enable only when enough records exist; otherwise All. */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-4 mt-2 border-t border-hair2">
                  <p className="text-xs text-faint">
                    Showing {Math.min(activityVisible, displayTracking.length)} of {displayTracking.length} records
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-faint">
                    <span>Show</span>
                    {[25, 50, 100].map(n => {
                      const disabled = displayTracking.length <= n;
                      const active = !disabled && activityPageSize === n;
                      return (
                        <button
                          key={n}
                          disabled={disabled}
                          onClick={() => { setActivityPageSize(n); setActivityVisible(n); }}
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
                      onClick={() => { setActivityPageSize(Infinity); setActivityVisible(Infinity); }}
                      className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                        (activityPageSize === Infinity || activityPageSize >= displayTracking.length)
                          ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                          : 'border-hair text-faint hover:bg-surface'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          </Slide>

          {/* ── Invoices Tab ── */}
          <Slide tabKey="invoices" className="pt-6">
            {invoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No invoices yet"
                subtitle="Your monthly payout statements will appear here once your referrals start getting approved. Feature some cards on your link to get things moving."
                action={
                  <button onClick={() => setActiveTab('cards')} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark active:scale-95 transition-all shadow-sm cursor-pointer">
                    <CreditCard className="w-3.5 h-3.5" /> Browse cards
                  </button>
                }
              />
            ) : (
              <>
              <div>
                {invoices.slice(0, invoicesVisible).map(inv => {
                  const isExpanded = expandedInvoices.has(inv.id);
                  const approvedItems = getInvoiceItems(inv).filter(i => i.status === 'approval');
                  const items = isExpanded ? approvedItems : [];
                  const approvalsCount = approvedItems.length;
                  const paid = inv.status && inv.status.toLowerCase().includes('paid');
                  const pending = inv.status && inv.status.toLowerCase().includes('pending');
                  const statusDot = paid ? 'var(--ds-pos)' : pending ? 'var(--ds-warn)' : 'var(--ds-faint2)';
                  return (
                    <div key={inv.id}>
                      <div
                        className="flex items-center gap-3 py-2.5 border-b border-hair2 hover:bg-surface transition-colors duration-150 cursor-pointer"
                        onClick={() => setExpandedInvoices(prev => { const next = new Set(prev); next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id); return next; })}
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                        <span className="text-[13px] font-medium text-ink truncate flex-1 min-w-0">{inv.month}</span>
                        <span className="hidden sm:block w-[116px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums whitespace-nowrap">{inv.date ? formatDate(inv.date) : ''}</span>
                        <span className="w-[68px] sm:w-[84px] flex-shrink-0 text-right text-[13px] font-medium text-faint tabular-nums">{approvalsCount} appr.</span>
                        <span className="hidden md:inline-flex items-center justify-end gap-1.5 w-[112px] flex-shrink-0 text-[13px] font-medium text-faint capitalize">
                          {(inv.sent || inv.sentZelle)
                            ? <span className="text-pos">{inv.sentZelle ? 'Zelle sent' : 'Sent'}</span>
                            : inv.status ? <><span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: statusDot }} />{inv.status}</> : ''}
                        </span>
                        <span className={`w-[88px] flex-shrink-0 text-right text-[13px] font-medium tabular-nums ${inv.amount > 0 ? 'text-ink' : 'text-faint2'}`}>
                          {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="pl-7 pb-2 border-b border-hair2">
                          {items.length === 0 ? (
                            <p className="text-xs text-faint py-3">No approvals found for this month.</p>
                          ) : (
                            <>
                              <div className="text-[11px] font-semibold text-faint2 uppercase tracking-[0.04em] pt-3 pb-1">Approvals ({items.length})</div>
                              {items.map(item => (
                                <div key={item.id} className="flex items-center gap-4 py-2.5 border-b border-hair2 last:border-b-0">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-ink truncate">{decodeHtml(item.cardName)}</div>
                                    <div className="text-xs text-faint mt-0.5">{formatDate(item.clickDate)} · {formatTime(item.clickTime)}</div>
                                  </div>
                                  <div className={`text-sm font-bold tabular-nums flex-shrink-0 ${item.totalEarnings > 0 ? 'text-ink' : 'text-faint2'}`}>
                                    {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : '—'}
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Page-size selector — bottom of the list. Numeric options enable only when enough invoices exist; otherwise All. */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-4 mt-2 border-t border-hair">
                <p className="text-xs text-faint">
                  Showing {Math.min(invoicesVisible, invoices.length)} of {invoices.length} invoices
                </p>
                <div className="flex items-center gap-1.5 text-xs text-faint">
                  <span>Show</span>
                  {[25, 50, 100].map(n => {
                    const disabled = invoices.length <= n;
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
                      (invoicesPageSize === Infinity || invoicesPageSize >= invoices.length)
                        ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                        : 'border-hair text-faint hover:bg-surface'
                    }`}
                  >
                    All
                  </button>
                </div>
              </div>
              </>
            )}
          </Slide>

          {/* ── Profile Tab ── */}
          <Slide tabKey="profile">
            <Profile accessToken={accessToken} />
          </Slide>
        </SwipeCarousel>
      </main>
    </Tabs.Root>
  );
}
