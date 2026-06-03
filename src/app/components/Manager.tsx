import { useState, useEffect } from 'react';
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

type DateFilter = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';
type SortState  = { field: string; dir: 'asc' | 'desc' };

const DATE_LABELS: Record<DateFilter, string> = {
  all: 'All time', today: 'Today', '7d': '7 days',
  '30d': '30 days', '90d': '90 days', custom: 'Custom',
};

function parseLocalDate(str: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-400 mr-1">Period:</span>
      {(['all', 'today', '7d', '30d', '90d', 'custom'] as DateFilter[]).map((f) => (
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

  // Edit commission
  const [editingCommission, setEditingCommission] = useState<string | null>(null);
  const [commissionValue, setCommissionValue]     = useState('');

  // ── Affiliates filter / sort ────────────────────────────────────────────────
  const [affiliatesFilter,     setAffiliatesFilter]     = useState<DateFilter>('all');
  const [affiliatesCustomFrom, setAffiliatesCustomFrom] = useState('');
  const [affiliatesCustomTo,   setAffiliatesCustomTo]   = useState('');
  const [affiliatesSort,       setAffiliatesSort]       = useState<SortState>({ field: 'name', dir: 'asc' });

  // ── Tracking Activity filter / sort ────────────────────────────────────────
  const [mgTrackingFilter,           setMgTrackingFilter]           = useState<DateFilter>('all');
  const [mgTrackingCustomFrom,       setMgTrackingCustomFrom]       = useState('');
  const [mgTrackingCustomTo,         setMgTrackingCustomTo]         = useState('');
  const [mgTrackingSort,             setMgTrackingSort]             = useState<SortState>({ field: 'clickDate', dir: 'desc' });
  const [mgTrackingStatusFilter,     setMgTrackingStatusFilter]     = useState('all');
  const [mgTrackingAffiliateFilter,  setMgTrackingAffiliateFilter]  = useState('all');

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

  // Invoices tab
  const [invoices,              setInvoices]              = useState<any[]>([]);
  const [invoicesLoading,       setInvoicesLoading]       = useState(false);
  const [invoiceAffiliateFilter, setInvoiceAffiliateFilter] = useState('all');
  const [invoiceStatusFilter,   setInvoiceStatusFilter]   = useState('all');
  const [invoiceMonthFilter,    setInvoiceMonthFilter]    = useState('all');
  const [invoiceSort,           setInvoiceSort]           = useState<SortState>({ field: 'date', dir: 'desc' });
  const [updatingInvoice,       setUpdatingInvoice]       = useState<string | null>(null);

  // ── Derived display data ────────────────────────────────────────────────────
  const displayUsers = sortUsers(
    users.filter((u: any) => inDateRange(u.createdAt, affiliatesFilter, affiliatesCustomFrom, affiliatesCustomTo)),
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

  // Always all-time — not affected by the period filter (which only filters the table rows).
  // Prefer summing from the live trackingActivity array (real Airtable data) when loaded;
  // fall back to KV-cached user.stats for the period before the first tracking fetch completes.
  const totalStats = trackingActivity.length > 0
    ? trackingActivity.reduce((acc: any, row: any) => ({
        clicks:      acc.clicks      + (row.clicks      || 0),
        conversions: acc.conversions + ((row.applications || 0) + (row.approvals || 0)),
        commissions: acc.commissions + (row.totalEarnings || 0),
      }), { clicks: 0, conversions: 0, commissions: 0 })
    : users.reduce((acc: any, user: any) => ({
        clicks:      acc.clicks      + (user.stats?.totalClicks      || 0),
        conversions: acc.conversions + (user.stats?.totalConversions  || 0),
        commissions: acc.commissions + (user.stats?.totalCommissions  || 0),
      }), { clicks: 0, conversions: 0, commissions: 0 });

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
    if (activeTab === 'tracking' && trackingActivity.length === 0) {
      fetchTrackingActivity();
    }
    if (activeTab === 'cpa-rates' && cpaRates.length === 0) {
      fetchCpaRates(cpaAffiliateFilter);
    }
    if (activeTab === 'invoices' && invoices.length === 0) {
      fetchInvoices();
    }
  }, [activeTab]);

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
              <div className="bg-indigo-500 p-2 rounded-xl">
                <Users className="w-5 h-5 text-white" />
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Tabs.List className="flex border-b border-slate-200 mb-6">
            <Tabs.Trigger
              value="affiliates"
              className="px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px"
            >
              Affiliates
            </Tabs.Trigger>
            <Tabs.Trigger
              value="tracking"
              className="px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px"
            >
              Tracking Activity
            </Tabs.Trigger>
            <Tabs.Trigger
              value="cpa-rates"
              className="px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px"
            >
              CPA Rates
            </Tabs.Trigger>
            <Tabs.Trigger
              value="invoices"
              className="px-5 py-3.5 text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-slate-800 transition-colors -mb-px"
            >
              <span className="flex items-center gap-1.5">
                Invoices
                {invoices.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{invoices.length}</span>}
              </span>
            </Tabs.Trigger>
          </Tabs.List>

          {/* ── Affiliates Tab ── */}
          <Tabs.Content value="affiliates">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-500">
                    {affiliatesFilter !== 'all' ? 'Filtered Affiliates' : 'Total Affiliates'}
                  </span>
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <Users className="w-4 h-4 text-indigo-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900">
                  {displayUsers.length}
                  {affiliatesFilter !== 'all' && (
                    <span className="text-base font-normal text-slate-400 ml-1">/ {users.length}</span>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-500">Total Clicks</span>
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900">{totalStats.clicks.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-500">Total Conversions</span>
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900">{totalStats.conversions}</div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-500">Total Commissions</span>
                  <div className="p-2 bg-violet-50 rounded-xl">
                    <DollarSign className="w-4 h-4 text-violet-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900">${totalStats.commissions.toLocaleString()}</div>
              </div>
            </div>

            {/* Filter + Create row */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <FilterBar
                filter={affiliatesFilter}     setFilter={setAffiliatesFilter}
                customFrom={affiliatesCustomFrom} setCustomFrom={setAffiliatesCustomFrom}
                customTo={affiliatesCustomTo}     setCustomTo={setAffiliatesCustomTo}
              />
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Create Affiliate
              </button>
            </div>

            {affiliatesFilter !== 'all' && (
              <p className="text-xs text-slate-500 mb-3">
                {displayUsers.length} of {users.length} affiliates (filtered by join date)
              </p>
            )}

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
                    {displayUsers.map((user: any) => (
                      <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-medium text-slate-900">{user.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm">
                            {user.phone    && <div className="text-slate-700">📞 {user.phone}</div>}
                            {user.address  && <div className="text-slate-500">{user.address}</div>}
                            {(user.city || user.state || user.zip) && (
                              <div className="text-slate-500">
                                {[user.city, user.state, user.zip].filter(Boolean).join(', ')}
                              </div>
                            )}
                            {user.country  && <div className="text-slate-500">{user.country}</div>}
                            {!user.phone && !user.address && !user.city && !user.state && !user.zip && !user.country && (
                              <span className="text-slate-400 text-xs">No contact info</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-mono">
                            {user.affiliateId || 'N/A'}
                          </code>
                        </td>
                        <td className="py-4 px-6 text-right">
                          {editingCommission === user.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                value={commissionValue}
                                onChange={(e) => setCommissionValue(e.target.value)}
                                className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                min="0" max="100"
                              />
                              <button onClick={() => updateCommission(user.id, parseInt(commissionValue))} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingCommission(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-medium text-slate-700">{user.commissionRate || 100}%</span>
                              <button
                                onClick={() => { setEditingCommission(user.id); setCommissionValue((user.commissionRate || 100).toString()); }}
                                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right text-sm text-slate-700">{user.stats?.totalClicks || 0}</td>
                        <td className="py-4 px-6 text-right text-sm text-slate-700">{user.stats?.totalConversions || 0}</td>
                        <td className="py-4 px-6 text-right text-sm font-semibold text-slate-900">${(user.stats?.totalCommissions || 0).toLocaleString()}</td>
                        <td className="py-4 px-6 text-right text-xs text-slate-500">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => loginAsUser(user.id, user.email)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Login as this affiliate"
                            >
                              <LogIn className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setEditName(user.name || ''); setEditEmail(user.email || '');
                                setEditPhone(user.phone || ''); setEditAddress(user.address || '');
                                setEditCity(user.city || ''); setEditState(user.state || '');
                                setEditZip(user.zip || ''); setEditCountry(user.country || '');
                                setShowEditModal(true);
                              }}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit affiliate"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setSelectedUser(user); setShowResetModal(true); }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Reset password"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteUser(user.id, user.email)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete affiliate"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
                    <h2 className="text-base font-semibold text-slate-900">
                      All Tracking Activity
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {displayTrackingActivity.length}
                      {(mgTrackingFilter !== 'all' || mgTrackingStatusFilter !== 'all' || mgTrackingAffiliateFilter !== 'all')
                        ? ` of ${trackingActivity.length}` : ''} records
                    </p>
                  </div>
                  <button
                    onClick={fetchTrackingActivity}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
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
                    {displayTrackingActivity.map((activity: any) => (
                      <tr key={activity.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 text-sm">
                          <div className="font-medium text-slate-900">{formatDate(activity.clickDate)}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{formatTime(activity.clickTime)}</div>
                        </td>
                        <td className="py-3.5 px-4 text-sm">
                          <div className="font-medium text-slate-900">{activity.memberName}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{activity.affiliateId}</div>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-slate-700">{activity.cardName}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            activity.status === 'approval'    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' :
                            activity.status === 'application' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {activity.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-right font-semibold text-slate-900">
                          {activity.totalEarnings > 0 ? `$${activity.totalEarnings.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="py-3.5 px-4 text-sm text-slate-500">{activity.deviceType || '—'}</td>
                        <td className="py-3.5 px-4 text-sm text-slate-500">{activity.state || '—'}</td>
                      </tr>
                    ))}
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
                      onClick={() => setCpaGroupBy(g => !g)}
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
                    <p className="text-xs text-slate-400 px-5 py-2">
                      {filtered.length}{filtered.length !== cpaRates.length ? ` of ${cpaRates.length}` : ''} cards
                      {cpaAffiliateLabel ? ` · ${cpaAffiliateLabel}` : ''}
                    </p>
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
                          // Grouped by issuer
                          (() => {
                            const groups: Record<string, any[]> = {};
                            filtered.forEach(r => {
                              const key = r.issuer || 'Other';
                              if (!groups[key]) groups[key] = [];
                              groups[key].push(r);
                            });
                            return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([issuer, rates]) => (
                              <>
                                <tr key={`group-${issuer}`} className="bg-slate-50 border-b border-slate-200">
                                  <td colSpan={cpaAffiliateFilter !== 'all' ? 4 : 3} className="py-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    {issuer} <span className="font-normal text-slate-400 normal-case ml-1">({rates.length})</span>
                                  </td>
                                </tr>
                                {rates.map(r => <CpaRow key={r.id} rate={r} />)}
                              </>
                            ));
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
                <button
                  onClick={fetchInvoices}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${invoicesLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {invoicesLoading ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Loading invoices…</p>
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
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-7 h-7 text-slate-300" />
                    </div>
                    <p className="text-slate-500 text-sm">No invoices match the selected filters.</p>
                  </div>
                );
                return (
                  <div className="overflow-x-auto">
                    <p className="text-xs text-slate-400 px-5 py-2">{filtered.length}{invoices.length !== filtered.length ? ` of ${invoices.length}` : ''} invoices</p>
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
                        {filtered.map((inv: any) => {
                          const busy = updatingInvoice === inv.id;
                          return (
                            <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-medium text-sm text-slate-900">{inv.name}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{inv.email}</div>
                              </td>
                              <td className="py-3.5 px-4 text-sm text-slate-700">{inv.month}</td>
                              <td className="py-3.5 px-4 text-right font-semibold text-sm text-slate-900">
                                {inv.amount > 0 ? `$${inv.amount.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}` : <span className="text-slate-300 font-normal">—</span>}
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
                                ) : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              {/* Sent toggle */}
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  disabled={busy}
                                  onClick={() => updateInvoice(inv.id, { sent: !inv.sent })}
                                  title={inv.sent ? 'Mark unsent' : 'Mark sent'}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${inv.sent ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              </td>
                              {/* Sent Zelle toggle */}
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  disabled={busy}
                                  onClick={() => updateInvoice(inv.id, { sentZelle: !inv.sentZelle })}
                                  title={inv.sentZelle ? 'Unmark Zelle sent' : 'Mark Zelle sent'}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${inv.sentZelle ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              </td>
                              <td className="py-3.5 px-4 text-xs text-slate-500">{inv.zelle || '—'}</td>
                              {/* Notes / status edit could go here */}
                              <td className="py-3.5 px-4 text-right">
                                {busy && <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 ml-auto" />}
                              </td>
                            </tr>
                          );
                        })}
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
