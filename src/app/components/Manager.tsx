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
  ChevronsUpDown
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
      className={`py-4 px-6 text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors text-${align}`}
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
      : <ChevronsUpDown className="w-3 h-3 flex-shrink-0 text-gray-400" />;
  return (
    <th
      onClick={() => onSort(field)}
      className={`py-3 px-4 text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors text-${align}`}
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

  const totalStats = displayUsers.reduce((acc: any, user: any) => ({
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

  useEffect(() => {
    if (activeTab === 'tracking' && trackingActivity.length === 0) {
      fetchTrackingActivity();
    }
    if (activeTab === 'cpa-rates' && cpaRates.length === 0) {
      fetchCpaRates(cpaAffiliateFilter);
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading manager dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl mb-2">Manager Dashboard</h1>
            <p className="text-gray-600">Welcome, {managerName} — Manage affiliates and monitor performance</p>
          </div>
          <button
            onClick={() => { setActionsOpen(false); onLogout(); }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('success') || message.includes('updated')
              ? 'bg-green-50 text-green-800'
              : message.includes('No affiliates') || message.includes('get started')
              ? 'bg-blue-50 text-blue-800'
              : 'bg-red-50 text-red-800'
          }`}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Tabs.List className="flex border-b border-gray-200 mb-6">
            <Tabs.Trigger
              value="affiliates"
              className="px-6 py-3 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors"
            >
              Affiliates
            </Tabs.Trigger>
            <Tabs.Trigger
              value="tracking"
              className="px-6 py-3 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors"
            >
              Tracking Activity
            </Tabs.Trigger>
            <Tabs.Trigger
              value="cpa-rates"
              className="px-6 py-3 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors"
            >
              CPA Rates
            </Tabs.Trigger>
          </Tabs.List>

          {/* ── Affiliates Tab ── */}
          <Tabs.Content value="affiliates">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">
                    {affiliatesFilter !== 'all' ? 'Filtered Affiliates' : 'Total Affiliates'}
                  </span>
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="text-3xl">
                  {displayUsers.length}
                  {affiliatesFilter !== 'all' && (
                    <span className="text-base text-gray-400 ml-1">/ {users.length}</span>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Total Clicks</span>
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-3xl">{totalStats.clicks.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Total Conversions</span>
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl">{totalStats.conversions}</div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Total Commissions</span>
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-3xl">${totalStats.commissions.toLocaleString()}</div>
              </div>
            </div>

            {/* Actions row */}
            {(() => {
              const anyBusy = syncing || syncingTracking || importingCPA;
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  {/* Period filter on the left */}
                  <FilterBar
                    filter={affiliatesFilter}     setFilter={setAffiliatesFilter}
                    customFrom={affiliatesCustomFrom} setCustomFrom={setAffiliatesCustomFrom}
                    customTo={affiliatesCustomTo}     setCustomTo={setAffiliatesCustomTo}
                  />

                  {/* Buttons on the right */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Create Affiliate
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => setActionsOpen(o => !o)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm"
                      >
                        {anyBusy
                          ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                          : <RefreshCw className="w-4 h-4" />}
                        Actions
                        <ChevronDown className={`w-4 h-4 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {actionsOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
                          <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
                            <div className="py-1">
                              <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Sync</p>
                              <button
                                onClick={() => { setActionsOpen(false); syncFromAirtable(); }}
                                disabled={syncing}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <RefreshCw className={`w-4 h-4 text-purple-600 ${syncing ? 'animate-spin' : ''}`} />
                                {syncing ? 'Syncing affiliates…' : 'Sync Affiliates'}
                              </button>
                              <button
                                onClick={() => { setActionsOpen(false); syncTrackingFromAirtable(); }}
                                disabled={syncingTracking}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <RefreshCw className={`w-4 h-4 text-green-600 ${syncingTracking ? 'animate-spin' : ''}`} />
                                {syncingTracking ? 'Syncing tracking…' : 'Sync Tracking'}
                              </button>
                              <button
                                onClick={() => { setActionsOpen(false); importCPAData(); }}
                                disabled={importingCPA}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <RefreshCw className={`w-4 h-4 text-orange-600 ${importingCPA ? 'animate-spin' : ''}`} />
                                {importingCPA ? 'Importing…' : 'Import CPA Rates'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {affiliatesFilter !== 'all' && (
              <p className="text-xs text-gray-500 mb-3">
                {displayUsers.length} of {users.length} affiliates (filtered by join date)
              </p>
            )}

            {/* Affiliates Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <SortTh label="Affiliate"     field="name"             sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} />
                      <th className="text-left py-4 px-6 text-gray-700">Contact Info</th>
                      <th className="text-left py-4 px-6 text-gray-700">Affiliate ID</th>
                      <SortTh label="Commission %"  field="commissionRate"   sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Clicks"        field="totalClicks"      sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Conversions"   field="totalConversions" sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Earned"        field="totalCommissions" sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <SortTh label="Joined"        field="createdAt"        sort={affiliatesSort} onSort={(f) => setAffiliatesSort(toggleSort(affiliatesSort, f))} align="right" />
                      <th className="text-right py-4 px-6 text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayUsers.map((user: any) => (
                      <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="font-medium">{user.name || 'N/A'}</div>
                          <div className="text-sm text-gray-600">{user.email}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm">
                            {user.phone    && <div className="text-gray-700">📞 {user.phone}</div>}
                            {user.address  && <div className="text-gray-600">{user.address}</div>}
                            {(user.city || user.state || user.zip) && (
                              <div className="text-gray-600">
                                {[user.city, user.state, user.zip].filter(Boolean).join(', ')}
                              </div>
                            )}
                            {user.country  && <div className="text-gray-600">{user.country}</div>}
                            {!user.phone && !user.address && !user.city && !user.state && !user.zip && !user.country && (
                              <span className="text-gray-400 text-xs">No contact info</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
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
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                min="0" max="100"
                              />
                              <button onClick={() => updateCommission(user.id, parseInt(commissionValue))} className="p-1 text-green-600 hover:bg-green-50 rounded">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingCommission(null)} className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span>{user.commissionRate || 100}%</span>
                              <button
                                onClick={() => { setEditingCommission(user.id); setCommissionValue((user.commissionRate || 100).toString()); }}
                                className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">{user.stats?.totalClicks || 0}</td>
                        <td className="py-4 px-6 text-right">{user.stats?.totalConversions || 0}</td>
                        <td className="py-4 px-6 text-right">${(user.stats?.totalCommissions || 0).toLocaleString()}</td>
                        <td className="py-4 px-6 text-right text-sm text-gray-500">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => loginAsUser(user.id, user.email)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
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
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Edit affiliate"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setSelectedUser(user); setShowResetModal(true); }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Reset password"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteUser(user.id, user.email)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">
                    All Tracking Activity
                    <span className="text-base font-normal text-gray-500 ml-2">
                      ({displayTrackingActivity.length}
                      {(mgTrackingFilter !== 'all' || mgTrackingStatusFilter !== 'all' || mgTrackingAffiliateFilter !== 'all')
                        ? ` of ${trackingActivity.length}` : ''} records)
                    </span>
                  </h2>
                  <button
                    onClick={fetchTrackingActivity}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
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
                  <span className="text-xs font-medium text-gray-500 mr-1">Status:</span>
                  {[
                    { value: 'all',         label: 'All' },
                    { value: 'click',       label: 'Click' },
                    { value: 'application', label: 'Application' },
                    { value: 'approval',    label: 'Approval' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setMgTrackingStatusFilter(value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        mgTrackingStatusFilter === value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Affiliate filter */}
                {affiliateOptions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 mr-1">Affiliate:</span>
                    <select
                      value={mgTrackingAffiliateFilter}
                      onChange={(e) => setMgTrackingAffiliateFilter(e.target.value)}
                      className="px-3 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-gray-700"
                    >
                      <option value="all">All affiliates</option>
                      {affiliateOptions.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    {mgTrackingAffiliateFilter !== 'all' && (
                      <button
                        onClick={() => setMgTrackingAffiliateFilter('all')}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
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
                      <tr key={activity.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">
                          <div>{formatDate(activity.clickDate)}</div>
                          <div className="text-xs text-gray-500">{formatTime(activity.clickTime)}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <div className="font-medium">{activity.memberName}</div>
                          <div className="text-xs text-gray-500">{activity.affiliateId}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">{activity.cardName}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            activity.status === 'approval'    ? 'bg-green-100 text-green-800' :
                            activity.status === 'application' ? 'bg-blue-100 text-blue-800'  :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {activity.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-medium">
                          {activity.totalEarnings > 0 ? `$${activity.totalEarnings.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{activity.deviceType || '-'}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{activity.state || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Tabs.Content>

          {/* ── CPA Rates Tab ── */}
          <Tabs.Content value="cpa-rates">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-gray-600">Affiliate:</span>
                  <select
                    value={cpaAffiliateFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCpaAffiliateFilter(val);
                      fetchCpaRates(val);
                    }}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">All (bank CPA only)</option>
                    {(users as any[]).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.commissionRate || 50}%)
                      </option>
                    ))}
                  </select>
                  {cpaAffiliateLabel && (
                    <span className="text-xs text-indigo-600 font-medium">
                      Showing payouts for: {cpaAffiliateLabel}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => fetchCpaRates(cpaAffiliateFilter)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {cpaRatesLoading ? (
                <div className="text-center py-12 text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-600" />
                  <p>Loading CPA rates from Airtable…</p>
                </div>
              ) : cpaRates.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <DollarSign className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p>No CPA rates found. Try refreshing.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <p className="text-xs text-gray-500 mb-3">{cpaRates.length} cards loaded</p>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <SortThSm label="Card"        field="card"             sort={cpaSort} onSort={(f) => setCpaSort(toggleSort(cpaSort, f))} />
                        <SortThSm label="Issuer"      field="issuer"           sort={cpaSort} onSort={(f) => setCpaSort(toggleSort(cpaSort, f))} />
                        <SortThSm label="Bank CPA"    field="bankCpa"          sort={cpaSort} onSort={(f) => setCpaSort(toggleSort(cpaSort, f))} align="right" />
                        {cpaAffiliateFilter !== 'all' && (
                          <SortThSm label="Affiliate Payout" field="affiliatePayout" sort={cpaSort} onSort={(f) => setCpaSort(toggleSort(cpaSort, f))} align="right" />
                        )}
                        <SortThSm label="Rate Date"   field="date"             sort={cpaSort} onSort={(f) => setCpaSort(toggleSort(cpaSort, f))} />
                      </tr>
                    </thead>
                    <tbody>
                      {applySort(cpaRates, cpaSort).map((rate: any) => (
                        <tr key={rate.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-900">{rate.card}</td>
                          <td className="py-2 px-3 text-gray-600">{rate.issuer || '—'}</td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900">
                            {rate.bankCpa > 0 ? `$${rate.bankCpa.toLocaleString()}` : '—'}
                          </td>
                          {cpaAffiliateFilter !== 'all' && (
                            <td className="py-2 px-3 text-right font-medium text-indigo-700">
                              {rate.affiliatePayout != null && rate.affiliatePayout > 0
                                ? `$${rate.affiliatePayout.toLocaleString()}`
                                : '—'}
                            </td>
                          )}
                          <td className="py-2 px-3 text-gray-500">{formatDate(rate.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Tabs.Content>
        </Tabs.Root>

        {/* ── Modals ── */}

        {/* Create Affiliate */}
        <Dialog.Root open={showCreateModal} onOpenChange={setShowCreateModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <Dialog.Title className="text-xl mb-4">Create New Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">Create a new affiliate account with name, email, password, and commission rate</Dialog.Description>
              <form onSubmit={createUser} className="space-y-4">
                {[
                  { label: 'Name',  value: newUserName,     set: setNewUserName,     type: 'text' },
                  { label: 'Email', value: newUserEmail,    set: setNewUserEmail,    type: 'email' },
                  { label: 'Password', value: newUserPassword, set: setNewUserPassword, type: 'password' },
                ].map(({ label, value, set, type }) => (
                  <div key={label}>
                    <label className="block mb-2 text-gray-700">{label}</label>
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                      minLength={type === 'password' ? 6 : undefined}
                    />
                  </div>
                ))}
                <div>
                  <label className="block mb-2 text-gray-700">Commission Rate (%)</label>
                  <input
                    type="number"
                    value={newUserCommission}
                    onChange={(e) => setNewUserCommission(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    min="0" max="100" required
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors">Create Affiliate</button>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Reset Password */}
        <Dialog.Root open={showResetModal} onOpenChange={setShowResetModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <Dialog.Title className="text-xl mb-4">Reset Password</Dialog.Title>
              <Dialog.Description className="sr-only">Reset the password for the selected affiliate account</Dialog.Description>
              {selectedUser && <p className="mb-4 text-gray-600">Reset password for <strong>{selectedUser.email}</strong></p>}
              <form onSubmit={resetUserPassword} className="space-y-4">
                <div>
                  <label className="block mb-2 text-gray-700">New Password</label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required minLength={6}
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors">Reset Password</button>
                  <button type="button" onClick={() => { setShowResetModal(false); setSelectedUser(null); setResetPassword(''); }} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Edit Affiliate */}
        <Dialog.Root open={showEditModal} onOpenChange={setShowEditModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <Dialog.Title className="text-xl mb-4">Edit Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">Edit affiliate profile information</Dialog.Description>
              {selectedUser && <p className="mb-4 text-gray-600">Editing: <strong>{selectedUser.email}</strong></p>}
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
                      <label className="block mb-2 text-gray-700">{label}</label>
                      <input
                        type={type}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required={req}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors">Save Changes</button>
                  <button type="button" onClick={() => { setShowEditModal(false); setSelectedUser(null); }} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
