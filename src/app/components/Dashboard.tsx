import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
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
} from 'lucide-react';
import React from 'react';
import { ComposedChart, LineChart, Line, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
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
  const [firstName, setFirstName]   = useState('');
  const [masterLink, setMasterLink] = useState('');
  const [ezrxRef,   setEzrxRef]     = useState('');
  const [linkBuilderIds, setLinkBuilderIds] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState('cards');   // controlled tabs (drives nav menu)
  const [navOpen,   setNavOpen]     = useState(false);     // mobile ellipsis nav menu

  // Activity tab (Airtable API Output)
  const [trackingFilter,       setTrackingFilter]       = useState<DateFilter>('week');
  const [trackingCustomFrom,   setTrackingCustomFrom]   = useState('');
  const [trackingCustomTo,     setTrackingCustomTo]     = useState('');
  const [trackingSort,         setTrackingSort]         = useState<SortState>({ field: 'clickDate', dir: 'desc' });
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
  const [activityVisible, setActivityVisible] = useState(PAGE_SIZE);
  const [activityPageSize, setActivityPageSize] = useState<number>(PAGE_SIZE);
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
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [insCard, setInsCard] = useState(0);   // active Insights card on mobile (swipe)
  const insBodyRef = useRef<HTMLDivElement>(null);
  const [perfOpen, setPerfOpen] = useState(false);   // Performance compact by default, pull to expand (design)
  const perfBodyRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(true);   // referral bar expanded vs thin blue strip
  const [linkBarH, setLinkBarH] = useState(0);      // measured referral-bar height → sticky offset for tab toolbars
  const linkBarRef = useRef<HTMLDivElement>(null);
  const linkBodyRef = useRef<HTMLDivElement>(null);
  const linkPrevH = useRef<number | null>(null);
  const [chartMetric, setChartMetric] = useState<'approvals' | 'clicks' | 'earnings'>('approvals');
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
  }, [loading, linkOpen, masterLink, linkBuilderIds.length]);

  // Smoothly tween the referral bar between its expanded and thin (collapsed) states.
  useLayoutEffect(() => {
    const el = linkBodyRef.current;
    if (!el) return;
    const target = el.offsetHeight;
    const from = linkPrevH.current;
    linkPrevH.current = target;
    if (from == null || from === target) return;
    gsap.killTweensOf(el);
    const child = el.firstElementChild as HTMLElement | null;
    gsap.fromTo(el, { height: from }, {
      height: target, duration: 0.44, ease: 'power2.inOut',
      onComplete: () => { gsap.set(el, { height: 'auto' }); setLinkBarH(linkBarRef.current?.offsetHeight || 0); },
    });
    if (child) gsap.fromTo(child, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.34, ease: 'power2.out' });
  }, [linkOpen, masterLink]);

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
        <div className="text-center">
          <div className="w-12 h-12 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-brand-soft">
            <RefreshCw className="w-5 h-5 animate-spin text-brand" />
          </div>
          <p className="text-faint text-sm font-medium">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { key: 'cards',    label: 'Cards',       Icon: CreditCard, badge: 0 },
    { key: 'create',   label: 'Create Link', Icon: Link2,      badge: linkBuilderIds.length },
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
              <div className="flex items-center">
                <svg width="24" height="22" viewBox="0 0 39 37" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                  <span className={`hidden sm:inline-block overflow-hidden transition-all duration-300 ${scrolled ? 'max-w-0 opacity-0' : 'max-w-[120px] opacity-100'}`}>
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
            ? `https://www.cardratings.com/bestcards/featured-credit-cards?src=693350&shnq=${linkBuilderIds.join(',')}${ezrxRef ? `&var2=ezrxref-${ezrxRef}` : ''}`
            : null;
          const displayLink = builtLink ?? masterLink;
          return (
          <div
            ref={linkBarRef}
            data-anim
            className="sticky top-[60px] z-20 mb-5 -mx-4 sm:-mx-6 lg:-mx-8 bg-white/95 backdrop-blur-md border-b border-hair"
          >
          <div ref={linkBodyRef} className="overflow-hidden">
            {linkOpen ? (
              /* Expanded — white */
              <div className="flex items-center gap-[18px] flex-wrap py-4 px-4 sm:px-6 lg:px-8">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center mb-1.5">
                    <span className="text-[12.5px] font-medium text-faint">
                      {builtLink ? `Your link · ${linkBuilderIds.length} card${linkBuilderIds.length !== 1 ? 's' : ''} selected` : 'Your affiliate link'}
                    </span>
                    {builtLink && (
                      <button onClick={() => setLinkBuilderIds([])} className="ml-3 text-[11px] font-medium text-faint hover:text-brand transition-colors cursor-pointer">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="font-mono-ds font-medium text-ink break-all line-clamp-2 sm:line-clamp-none text-[15.5px]">
                    {displayLink}
                  </div>
                  <div className="mt-1">
                    <span className="text-xs font-medium text-faint">
                      {builtLink
                        ? `${linkBuilderIds.length} card${linkBuilderIds.length !== 1 ? 's' : ''} on your link · ready to share`
                        : 'Add cards from the table to build a custom link'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    onClick={() => copyToClipboard(displayLink, -1)}
                    className="flex items-center gap-[7px] h-10 px-[18px] rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark active:scale-95 transition-all duration-150 cursor-pointer"
                    title="Copy link"
                  >
                    {copiedId === -1
                      ? <><CheckCircle className="w-4 h-4" /> Copied</>
                      : <><Copy className="w-4 h-4" /> Copy</>}
                  </button>
                  <a href={displayLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-[7px] h-9 px-4 rounded-full border border-line bg-white text-ink text-sm font-semibold hover:bg-surface transition-colors cursor-pointer"
                    title="Preview link">
                    <ExternalLink className="w-[15px] h-[15px]" />
                    Preview
                  </a>
                  <button onClick={() => setLinkOpen(false)} title="Minimize link"
                    className="flex items-center justify-center w-9 h-9 rounded-full text-faint hover:text-ink hover:bg-surface active:scale-95 transition-all duration-150 cursor-pointer">
                    <ChevronUp className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>
            ) : (
              /* Collapsed — same bar, condensed to a single line */
              <div className="flex items-center gap-3 py-2.5 px-4 sm:px-6 lg:px-8">
                <Link2 className="w-4 h-4 text-faint2 flex-shrink-0" />
                <span className="font-mono-ds text-[13px] font-medium text-ink truncate flex-1 min-w-0">
                  {displayLink}
                </span>
                <button
                  onClick={() => copyToClipboard(displayLink, -1)}
                  title="Copy link"
                  className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-brand-soft text-brand-dark text-[12.5px] font-semibold hover:bg-brand/15 transition-colors flex-shrink-0 cursor-pointer"
                >
                  {copiedId === -1 ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
                <button onClick={() => setLinkOpen(true)} title="Expand link"
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-faint hover:text-ink hover:bg-surface transition-colors flex-shrink-0 cursor-pointer">
                  <ChevronDown className="w-[18px] h-[18px]" />
                </button>
              </div>
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
                          <span className="text-[13px] font-bold text-faint2 w-3.5 flex-shrink-0 tabular-nums">{idx+1}</span>
                          <span className="text-[13.5px] font-semibold text-ink truncate flex-1 min-w-0">{decodeHtml(c.name)}</span>
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

        {/* Tab panels — the tab nav lives in the header */}
        <div className="mt-5">

          {/* ── Cards Tab (Robinhood-style filters + list) ── */}
          <Tabs.Content value="cards">
          <div>
            <div style={{ top: 60 + linkBarH }} className="sticky z-10 bg-canvas pt-6 pb-1">
            {/* Type chips */}
            {cardTypes.length > 0 && (
              <div className="ds-chips flex items-center gap-2 overflow-x-auto mb-[18px]">
                {(['all', ...cardTypes]).map(type => {
                  const on = cardsTypeFilter === type;
                  return (
                    <button key={type} onClick={() => { setCardsTypeFilter(type); setCardsVisible(PAGE_SIZE); }}
                      className={`flex-shrink-0 h-9 px-4 rounded-full text-[13.5px] font-semibold tracking-[-0.01em] whitespace-nowrap transition-colors cursor-pointer ${
                        on ? 'bg-brand text-white' : 'bg-hair2 text-subtle hover:bg-hair'
                      }`}>
                      {type === 'all' ? 'All types' : type}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <div className="relative mb-[18px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-faint pointer-events-none" />
              <input type="text" placeholder="Search cards or issuers" value={cardsSearch}
                onChange={e => { setCardsSearch(e.target.value); setCardsVisible(PAGE_SIZE); }}
                className="w-full h-[42px] pl-10 pr-3.5 border border-line rounded-[10px] bg-white text-[14.5px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15" />
            </div>

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
                {([['earned', 'Earned'], ['cpa', 'Payout'], ['conv', 'Conv']] as const).map(([key, label]) => {
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
              const CardRow = ({ card, indent }: { card: any; indent?: boolean }) => {
                const isAdded = card.cardId && linkBuilderIds.includes(card.cardId);
                return (
                  <div className="flex items-center gap-[18px] py-4 border-b border-hair2 hover:bg-surface transition-colors duration-150"
                    style={{ paddingLeft: indent ? 24 : 0 }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15.5px] font-semibold text-ink tracking-[-0.01em] truncate">{card.name}</div>
                      <div className="flex items-center gap-2.5 mt-0.5">
                        <span className="text-[13px] font-medium text-faint">{card.issuer || '—'}</span>
                        {card.earned > 0 && (
                          <>
                            <span className="w-[3px] h-[3px] rounded-full bg-faint2" />
                            <span className="text-[13px] font-medium text-faint tabular-nums">${Math.round(card.earned).toLocaleString()} earned</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[18px] font-bold text-ink tracking-[-0.02em] tabular-nums">
                        {card.cpa > 0 ? `$${card.cpa.toLocaleString()}` : '—'}<span className="text-[12px] font-semibold text-faint2"> /appr</span>
                      </div>
                      <div className={`text-[12.5px] font-semibold mt-0.5 tabular-nums ${card.conv >= 3 ? 'text-brand' : 'text-faint'}`}>{card.conv.toFixed(1)}% conv</div>
                    </div>
                    {card.cardId && (
                      <button
                        onClick={() => setLinkBuilderIds(prev => isAdded ? prev.filter(id => id !== card.cardId) : [...prev, card.cardId])}
                        title={isAdded ? 'Remove from share page' : 'Add to share page'}
                        className={`flex-shrink-0 w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-150 cursor-pointer ${
                          isAdded ? 'bg-brand border-brand text-white' : 'border-line text-faint2 hover:border-brand hover:text-brand'
                        }`}>
                        {isAdded ? <Check className="w-[15px] h-[15px]" strokeWidth={3} /> : <Plus className="w-[15px] h-[15px]" strokeWidth={2.4} />}
                      </button>
                    )}
                  </div>
                );
              };

              if (displayCards.length === 0) {
                return (
                  <div className="py-14 text-center">
                    <div className="text-base font-bold text-ink mb-1">No cards found</div>
                    <div className="text-[13.5px] text-faint">{links.length === 0 ? 'No cards loaded yet — try refreshing.' : 'Try a different category or search.'}</div>
                  </div>
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
                            <span className="text-[15px] font-bold text-ink tracking-[-0.01em]">{issuer}</span>
                            <span className="text-[13px] font-semibold text-faint2 tabular-nums">{items.length}</span>
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
                  {cardsVisible < displayCards.length && (
                    <div className="pt-5 text-center">
                      <button onClick={() => setCardsVisible(n => n + PAGE_SIZE)}
                        className="px-4 py-2 text-[13px] font-semibold text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors cursor-pointer">
                        Show {Math.min(PAGE_SIZE, displayCards.length - cardsVisible)} more
                        <span className="text-faint ml-1">({displayCards.length - cardsVisible} remaining)</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          </Tabs.Content>

          {/* ── Create Link Tab ── */}
          <Tabs.Content value="create">
          <div className="pt-6">
            {(() => {
              const selected = linkBuilderIds.map(id => allCards.find(c => c.cardId === id)).filter(Boolean) as any[];
              const maxPayout = selected.reduce((s, c) => s + (c.cpa || 0), 0);
              const shareLink = linkBuilderIds.length > 0
                ? `https://www.cardratings.com/bestcards/featured-credit-cards?src=693350&shnq=${linkBuilderIds.join(',')}${ezrxRef ? `&var2=ezrxref-${ezrxRef}` : ''}`
                : masterLink;
              return (
                <div className="max-w-3xl">
                  <h3 className="text-lg font-bold text-ink tracking-[-0.01em]">Your share page</h3>
                  <p className="text-[13px] text-faint mt-0.5 mb-5">
                    These cards appear on the page you share. Add or remove cards from the <span className="font-semibold text-subtle">Cards</span> tab.
                  </p>

                  {/* Share link */}
                  <div className="flex items-center gap-3.5 flex-wrap p-4 border border-hair rounded-2xl mb-6">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-mono-ds text-[14.5px] font-medium text-ink break-all">{shareLink}</div>
                      <div className="text-xs text-faint font-medium mt-1">
                        {linkBuilderIds.length > 0
                          ? `${linkBuilderIds.length} card${linkBuilderIds.length !== 1 ? 's' : ''} · $${maxPayout.toLocaleString()} max payout`
                          : 'No cards selected — your default link will be shared'}
                      </div>
                    </div>
                    <button onClick={() => copyToClipboard(shareLink, -2)}
                      className="flex items-center gap-1.5 h-10 px-[18px] rounded-[10px] bg-brand text-white text-sm font-semibold hover:bg-brand-dark active:scale-95 transition-all duration-150 cursor-pointer">
                      {copiedId === -2 ? <><CheckCircle className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                    </button>
                  </div>

                  {/* Max payout summary */}
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[30px] font-bold text-ink tracking-[-0.025em] leading-none tabular-nums">${maxPayout.toLocaleString()}</span>
                    <span className="text-[12.5px] text-faint font-medium">max payout / approval · {selected.length} card{selected.length !== 1 ? 's' : ''}</span>
                  </div>

                  {selected.length > 0 ? (
                    <div className="border-t border-hair mt-3">
                      {selected.map(c => (
                        <div key={c.cardId} className="flex items-center gap-3 py-3 border-b border-hair2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-ink truncate">{c.name}</div>
                            <div className="text-xs text-faint font-medium">{c.issuer || '—'}</div>
                          </div>
                          <span className="text-sm font-bold text-pos tabular-nums flex-shrink-0">{c.cpa > 0 ? `$${c.cpa.toLocaleString()}` : '—'}</span>
                          <button onClick={() => setLinkBuilderIds(prev => prev.filter(id => id !== c.cardId))}
                            title="Remove" className="w-7 h-7 rounded-lg flex items-center justify-center text-faint hover:text-neg hover:bg-hair2 transition-colors cursor-pointer flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 px-5 py-7 text-center border border-dashed border-line rounded-2xl text-[13.5px] text-faint leading-relaxed">
                      No cards on your page yet.<br />
                      Go to the <span className="font-semibold text-brand">Cards</span> tab and tap <span className="font-semibold text-subtle">Add to link</span> on the cards you want to feature.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          </Tabs.Content>

          {/* ── Activity Tab ── */}
          <Tabs.Content value="activity">
            {/* Sticky controls */}
            <div style={{ top: 60 + linkBarH }} className="sticky z-10 bg-canvas border-b border-hair py-3">
            <div className="flex items-center justify-between mb-3 p-3.5 bg-surface rounded-xl border border-hair">
              <p className="text-sm text-subtle">
                <span className="font-semibold text-ink tabular-nums">{displayTracking.length}</span>
                {trackingFilter !== 'all' ? <span className="text-faint"> of {tracking.length}</span> : ''} activity records
              </p>
              <button
                onClick={fetchData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-subtle bg-white border border-hair rounded-lg hover:border-brand hover:text-brand active:scale-95 transition-all duration-150 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

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
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-hair2">
                  <TrendingUp className="w-7 h-7 text-faint2" />
                </div>
                <p className="text-faint text-sm font-medium mb-4">
                  {tracking.length === 0
                    ? 'No tracking activity found'
                    : 'No activity matches the selected date range.'}
                </p>
                {tracking.length === 0 && (
                  <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark active:scale-95 transition-all duration-150 text-sm font-medium shadow-sm cursor-pointer"
                  >
                    Refresh Data
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <p className="text-xs text-faint">
                    Showing {Math.min(activityVisible, displayTracking.length)} of {displayTracking.length} records
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-faint">
                    <span>Show</span>
                    {[25, 50, 100].map(n => (
                      <button
                        key={n}
                        onClick={() => { setActivityPageSize(n); setActivityVisible(n); }}
                        className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                          activityPageSize === n
                            ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                            : 'border-hair text-faint hover:bg-surface'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => { setActivityPageSize(Infinity); setActivityVisible(Infinity); }}
                      className={`px-2 py-0.5 rounded-md border transition-colors duration-150 cursor-pointer ${
                        activityPageSize === Infinity
                          ? 'border-brand/30 bg-brand-soft text-brand font-medium'
                          : 'border-hair text-faint hover:bg-surface'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>
                <div>
                  {displayTracking.slice(0, activityVisible).map((item) => {
                    const dot = item.status === 'approval' ? 'var(--ds-pos)' : item.status === 'application' ? 'var(--ds-subtle)' : 'var(--ds-faint2)';
                    return (
                      <div key={item.id} className="flex items-center gap-4 py-3.5 border-b border-hair2 hover:bg-surface transition-colors duration-150">
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold text-ink truncate">{item.cardName || '—'}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[12.5px] text-faint flex-wrap">
                            <span className="inline-flex items-center gap-1.5 capitalize"><span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: dot }} />{item.status}</span>
                            <span className="w-[3px] h-[3px] rounded-full bg-faint2 flex-shrink-0" />
                            <span className="whitespace-nowrap">{formatDate(item.clickDate)}</span>
                            {item.state && <><span className="hidden sm:inline w-[3px] h-[3px] rounded-full bg-faint2 flex-shrink-0" /><span className="hidden sm:inline whitespace-nowrap">{item.deviceType || '—'} · {item.state}</span></>}
                          </div>
                        </div>
                        <div className={`text-[16px] font-bold tabular-nums flex-shrink-0 ${item.totalEarnings > 0 ? 'text-ink' : 'text-faint2'}`}>
                          {item.totalEarnings > 0 ? `$${item.totalEarnings.toFixed(2)}` : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activityVisible < displayTracking.length && (
                  <div className="pt-4 text-center">
                    <button
                      onClick={() => setActivityVisible(n => n + activityPageSize)}
                      className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors"
                    >
                      Show {Math.min(activityPageSize, displayTracking.length - activityVisible)} more
                      <span className="text-faint ml-1">({displayTracking.length - activityVisible} remaining)</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          </Tabs.Content>

          {/* ── Invoices Tab ── */}
          <Tabs.Content value="invoices" className="pt-6">
            {invoices.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-hair2">
                  <FileText className="w-7 h-7 text-faint2" />
                </div>
                <p className="text-faint text-sm font-medium">No invoices found for your account.</p>
              </div>
            ) : (
              <>
              <div style={{ top: 60 + linkBarH }} className="sticky z-10 bg-canvas py-3 border-b border-hair">
                <p className="text-xs text-faint">
                  Showing {Math.min(invoicesVisible, invoices.length)} of {invoices.length} invoices
                </p>
              </div>
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
                        className="flex items-center gap-4 py-3.5 border-b border-hair2 hover:bg-surface transition-colors duration-150 cursor-pointer"
                        onClick={() => setExpandedInvoices(prev => { const next = new Set(prev); next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id); return next; })}
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} strokeWidth={2.6} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold text-ink truncate">{inv.month}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[12.5px] text-faint flex-wrap">
                            {inv.date && <><span className="whitespace-nowrap">{formatDate(inv.date)}</span><span className="w-[3px] h-[3px] rounded-full bg-faint2 flex-shrink-0" /></>}
                            <span className="tabular-nums">{approvalsCount} approvals</span>
                            {inv.status && <><span className="w-[3px] h-[3px] rounded-full bg-faint2 flex-shrink-0" /><span className="inline-flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: statusDot }} />{inv.status}</span></>}
                            {(inv.sent || inv.sentZelle) && <><span className="w-[3px] h-[3px] rounded-full bg-faint2 flex-shrink-0" /><span className="text-pos font-semibold">{inv.sentZelle ? 'Zelle sent' : 'Sent'}</span></>}
                          </div>
                        </div>
                        <div className={`text-[16px] font-bold tabular-nums flex-shrink-0 ${inv.amount > 0 ? 'text-ink' : 'text-faint2'}`}>
                          {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </div>
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
              {invoicesVisible < invoices.length && (
                <div className="pt-4 text-center">
                  <button
                    onClick={() => setInvoicesVisible(n => n + PAGE_SIZE)}
                    className="px-4 py-2 text-xs font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand-soft transition-colors"
                  >
                    Show {Math.min(PAGE_SIZE, invoices.length - invoicesVisible)} more
                    <span className="text-faint ml-1">({invoices.length - invoicesVisible} remaining)</span>
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
        </div>
      </main>
    </Tabs.Root>
  );
}
