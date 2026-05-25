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
  LogIn
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

export function Manager({ sessionToken, managerName, onLogout, onLoginAsUser }: ManagerProps) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [importingCPA, setImportingCPA] = useState(false);
  const [messageTimeout, setMessageTimeout] = useState<NodeJS.Timeout | null>(null);
  const [trackingActivity, setTrackingActivity] = useState([]);
  const [activeTab, setActiveTab] = useState('affiliates');

  // Edit user form fields
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editZip, setEditZip] = useState('');
  const [editCountry, setEditCountry] = useState('');

  // Create user form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserCommission, setNewUserCommission] = useState('100');

  // Reset password
  const [resetPassword, setResetPassword] = useState('');

  // Edit commission
  const [editingCommission, setEditingCommission] = useState<string | null>(null);
  const [commissionValue, setCommissionValue] = useState('');

  // Set message with auto-dismiss
  const setMessageWithTimeout = (msg: string, duration: number = 6000) => {
    if (messageTimeout) {
      clearTimeout(messageTimeout);
    }
    setMessage(msg);
    const timeout = setTimeout(() => {
      setMessage('');
    }, duration);
    setMessageTimeout(timeout);
  };

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    fetchUsers();
  }, [sessionToken]);

  useEffect(() => {
    return () => {
      if (messageTimeout) {
        clearTimeout(messageTimeout);
      }
    };
  }, [messageTimeout]);

  const fetchUsers = async () => {
    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/users`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Manager-Session': sessionToken,
          'Content-Type': 'application/json'
        }
      });

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        setMessageWithTimeout(`Server returned invalid response: ${responseText.substring(0, 100)}`, 8000);
        return;
      }

      if (response.ok) {
        const userList = data.users || [];
        setUsers(userList);

        if (userList.length === 0) {
          setMessageWithTimeout('No affiliates yet. Create your first affiliate to get started.', 8000);
        } else {
          setMessage('');
        }
      } else {
        const errorMsg = data.error || `Failed to fetch users (status ${response.status})`;
        setMessageWithTimeout(errorMsg, 8000);
      }
    } catch (error) {
      // Don't show scary error messages for expected cases
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
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user`;

      const requestBody = {
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName,
        commissionRate: parseInt(newUserCommission)
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Manager-Session': sessionToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        setMessageWithTimeout(`Server error: ${responseText.substring(0, 100)}`, 8000);
        return;
      }

      if (data.success) {
        setMessageWithTimeout('Affiliate created successfully!', 6000);
        setShowCreateModal(false);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserName('');
        setNewUserCommission('100');
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to create affiliate', 8000);
      }
    } catch (error) {
      setMessageWithTimeout(`Network error: ${error.message}. Check browser console for details.`, 8000);
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete ${email}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/user/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessageWithTimeout('Affiliate deleted successfully', 6000);
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to delete affiliate', 8000);
      }
    } catch (error) {
      setMessageWithTimeout('Failed to delete affiliate', 8000);
    }
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ newPassword: resetPassword })
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessageWithTimeout(`Password reset for ${selectedUser.email}`, 6000);
        setShowResetModal(false);
        setResetPassword('');
        setSelectedUser(null);
      } else {
        setMessageWithTimeout(data.error || 'Failed to reset password', 8000);
      }
    } catch (error) {
      setMessageWithTimeout('Failed to reset password', 8000);
    }
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ commissionRate: rate })
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessageWithTimeout('Commission rate updated', 5000);
        setEditingCommission(null);
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to update commission', 8000);
      }
    } catch (error) {
      setMessageWithTimeout('Failed to update commission', 8000);
    }
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: editName,
            email: editEmail,
            phone: editPhone,
            address: editAddress,
            city: editCity,
            state: editState,
            zip: editZip,
            country: editCountry
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessageWithTimeout('User updated successfully', 5000);
        setShowEditModal(false);
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to update user', 8000);
      }
    } catch (error) {
      setMessageWithTimeout('Failed to update user', 8000);
    }
  };

  const syncFromAirtable = async () => {
    setMessage('');
    setSyncing(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/sync-airtable`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        const summary = `Sync complete: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped${data.errors.length > 0 ? `, ${data.errors.length} errors` : ''}`;
        setMessageWithTimeout(summary, 10000);
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to sync from Airtable', 8000);
      }
    } catch (error) {
      setMessageWithTimeout(`Sync failed: ${error.message}`, 8000);
    } finally {
      setSyncing(false);
    }
  };

  const syncTrackingFromAirtable = async () => {
    setMessage('');
    setSyncingTracking(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/sync-tracking`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessageWithTimeout(data.message || 'Tracking data synced successfully', 8000);
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to sync tracking data', 8000);
      }
    } catch (error) {
      setMessageWithTimeout(`Tracking sync failed: ${error.message}`, 8000);
    } finally {
      setSyncingTracking(false);
    }
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
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (data.success && data.accessToken) {
        onLoginAsUser(email, data.accessToken);
      } else {
        setMessageWithTimeout(data.error || 'Failed to login as user', 8000);
      }
    } catch (error) {
      setMessageWithTimeout(`Login failed: ${error.message}`, 8000);
    }
  };

  const fetchTrackingActivity = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/tracking-activity`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        setTrackingActivity(data.activity || []);
      } else {
        setMessageWithTimeout(data.error || 'Failed to fetch tracking activity', 8000);
      }
    } catch (error) {
      setMessageWithTimeout(`Failed to fetch tracking: ${error.message}`, 8000);
    }
  };

  const importCPAData = async () => {
    setMessage('');
    setImportingCPA(true);

    try {
      // Read the CSV file from imports folder
      const response = await fetch('/src/imports/QuinStreet_CPA_Report.csv');
      const csvData = await response.text();

      // Send to backend for processing
      const importResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/import-cpa-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Manager-Session': sessionToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ csvData })
        }
      );

      const data = await importResponse.json();

      if (data.success) {
        const summary = `CPA Import: ${data.stats.cardsUpdated} cards updated across ${data.stats.usersUpdated} users (${data.stats.uniqueCards} unique cards found)`;
        setMessageWithTimeout(summary, 10000);
        await fetchUsers();
      } else {
        setMessageWithTimeout(data.error || 'Failed to import CPA data', 8000);
      }
    } catch (error) {
      setMessageWithTimeout(`Import failed: ${error.message}`, 8000);
    } finally {
      setImportingCPA(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tracking' && trackingActivity.length === 0) {
      fetchTrackingActivity();
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading manager dashboard...</p>
      </div>
    );
  }

  const totalStats = users.reduce((acc, user) => ({
    clicks: acc.clicks + (user.stats?.totalClicks || 0),
    conversions: acc.conversions + (user.stats?.totalConversions || 0),
    commissions: acc.commissions + (user.stats?.totalCommissions || 0)
  }), { clicks: 0, conversions: 0, commissions: 0 });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl mb-2">Manager Dashboard</h1>
            <p className="text-gray-600">Welcome, {managerName} - Manage affiliates and monitor performance</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={syncFromAirtable}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Affiliates'}
            </button>
            <button
              onClick={syncTrackingFromAirtable}
              disabled={syncingTracking}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${syncingTracking ? 'animate-spin' : ''}`} />
              {syncingTracking ? 'Syncing...' : 'Sync Tracking'}
            </button>
            <button
              onClick={importCPAData}
              disabled={importingCPA}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${importingCPA ? 'animate-spin' : ''}`} />
              {importingCPA ? 'Importing...' : 'Import CPA Rates'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Affiliate
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
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

        {/* Tabs Navigation */}
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
          </Tabs.List>

          {/* Affiliates Tab */}
          <Tabs.Content value="affiliates">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Total Affiliates</span>
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="text-3xl">{users.length}</div>
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

            {/* Users Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-4 px-6 text-gray-700">Affiliate</th>
                      <th className="text-left py-4 px-6 text-gray-700">Contact Info</th>
                      <th className="text-left py-4 px-6 text-gray-700">Affiliate ID</th>
                      <th className="text-right py-4 px-6 text-gray-700">Commission %</th>
                      <th className="text-right py-4 px-6 text-gray-700">Clicks</th>
                      <th className="text-right py-4 px-6 text-gray-700">Conversions</th>
                      <th className="text-right py-4 px-6 text-gray-700">Earned</th>
                      <th className="text-right py-4 px-6 text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div>
                            <div className="font-medium">{user.name || 'N/A'}</div>
                            <div className="text-sm text-gray-600">{user.email}</div>
                            <div className="text-xs text-gray-500">
                              Joined: {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm">
                            {user.phone && <div className="text-gray-700">📞 {user.phone}</div>}
                            {user.address && <div className="text-gray-600">{user.address}</div>}
                            {(user.city || user.state || user.zip) && (
                              <div className="text-gray-600">
                                {[user.city, user.state, user.zip].filter(Boolean).join(', ')}
                              </div>
                            )}
                            {user.country && <div className="text-gray-600">{user.country}</div>}
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
                                min="0"
                                max="100"
                              />
                              <button
                                onClick={() => updateCommission(user.id, parseInt(commissionValue))}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingCommission(null)}
                                className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span>{user.commissionRate || 100}%</span>
                              <button
                                onClick={() => {
                                  setEditingCommission(user.id);
                                  setCommissionValue((user.commissionRate || 100).toString());
                                }}
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
                                setEditName(user.name || '');
                                setEditEmail(user.email || '');
                                setEditPhone(user.phone || '');
                                setEditAddress(user.address || '');
                                setEditCity(user.city || '');
                                setEditState(user.state || '');
                                setEditZip(user.zip || '');
                                setEditCountry(user.country || '');
                                setShowEditModal(true);
                              }}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Edit affiliate"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowResetModal(true);
                              }}
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

          {/* Tracking Activity Tab */}
          <Tabs.Content value="tracking">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">All Tracking Activity ({trackingActivity.length} records)</h2>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="text-left py-3 px-4 text-gray-700">Date/Time</th>
                      <th className="text-left py-3 px-4 text-gray-700">Affiliate</th>
                      <th className="text-left py-3 px-4 text-gray-700">Card</th>
                      <th className="text-left py-3 px-4 text-gray-700">Status</th>
                      <th className="text-right py-3 px-4 text-gray-700">Earnings</th>
                      <th className="text-left py-3 px-4 text-gray-700">Device</th>
                      <th className="text-left py-3 px-4 text-gray-700">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackingActivity.map((activity) => (
                      <tr key={activity.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">
                          <div>{activity.clickDate}</div>
                          <div className="text-xs text-gray-500">{activity.clickTime?.split('T')[1]?.split('.')[0]}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <div className="font-medium">{activity.memberName}</div>
                          <div className="text-xs text-gray-500">{activity.affiliateId}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">{activity.cardName}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            activity.status === 'approval' ? 'bg-green-100 text-green-800' :
                            activity.status === 'application' ? 'bg-blue-100 text-blue-800' :
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
        </Tabs.Root>

        {/* Create User Modal */}
        <Dialog.Root open={showCreateModal} onOpenChange={setShowCreateModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <Dialog.Title className="text-xl mb-4">Create New Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">
                Create a new affiliate account with name, email, password, and commission rate
              </Dialog.Description>

              <form onSubmit={createUser} className="space-y-4">
                <div>
                  <label className="block mb-2 text-gray-700">Name</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block mb-2 text-gray-700">Email</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block mb-2 text-gray-700">Password</label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="block mb-2 text-gray-700">Commission Rate (%)</label>
                  <input
                    type="number"
                    value={newUserCommission}
                    onChange={(e) => setNewUserCommission(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    min="0"
                    max="100"
                    required
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Create Affiliate
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Reset Password Modal */}
        <Dialog.Root open={showResetModal} onOpenChange={setShowResetModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <Dialog.Title className="text-xl mb-4">Reset Password</Dialog.Title>
              <Dialog.Description className="sr-only">
                Reset the password for the selected affiliate account
              </Dialog.Description>

              {selectedUser && (
                <p className="mb-4 text-gray-600">
                  Reset password for <strong>{selectedUser.email}</strong>
                </p>
              )}

              <form onSubmit={resetUserPassword} className="space-y-4">
                <div>
                  <label className="block mb-2 text-gray-700">New Password</label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    minLength={6}
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(false);
                      setSelectedUser(null);
                      setResetPassword('');
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Edit User Modal */}
        <Dialog.Root open={showEditModal} onOpenChange={setShowEditModal}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <Dialog.Title className="text-xl mb-4">Edit Affiliate</Dialog.Title>
              <Dialog.Description className="sr-only">
                Edit affiliate profile information
              </Dialog.Description>

              {selectedUser && (
                <p className="mb-4 text-gray-600">
                  Editing: <strong>{selectedUser.email}</strong>
                </p>
              )}

              <form onSubmit={editUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 text-gray-700">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">Address</label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">City</label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">State</label>
                    <input
                      type="text"
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">ZIP Code</label>
                    <input
                      type="text"
                      value={editZip}
                      onChange={(e) => setEditZip(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 text-gray-700">Country</label>
                    <input
                      type="text"
                      value={editCountry}
                      onChange={(e) => setEditCountry(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setSelectedUser(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
