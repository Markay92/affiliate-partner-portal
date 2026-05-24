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
  RefreshCw
} from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Profile } from './Profile';

interface DashboardProps {
  userEmail: string;
  accessToken: string;
  onLogout: () => void;
}

export function Dashboard({ userEmail, accessToken, onLogout }: DashboardProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [links, setLinks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper to build headers with impersonation support
  const buildHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (accessToken?.startsWith('imp_')) {
      headers['X-Impersonation-Token'] = accessToken;
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  };

  const fetchData = async () => {
    try {
      console.log('Dashboard: Starting data fetch with access token:', accessToken?.substring(0, 10) + '...');
      console.log('Dashboard: Token type:', accessToken?.startsWith('imp_') ? 'impersonation' : 'regular');

      const headers = buildHeaders();


      const [linksRes, activityRes, payoutsRes, trackingRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/links`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/activity`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/payouts`, { headers }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/tracking`, { headers })
      ]);

      console.log('Dashboard: Response statuses - Links:', linksRes.status, 'Activity:', activityRes.status, 'Payouts:', payoutsRes.status, 'Tracking:', trackingRes.status);

      const [linksData, activityData, payoutsData, trackingData] = await Promise.all([
        linksRes.json(),
        activityRes.json(),
        payoutsRes.json(),
        trackingRes.json()
      ]);

      console.log('=== Dashboard Data Loaded ===');
      console.log('Links response:', linksData);
      console.log('Links:', linksData.links?.length || 0, 'items');
      console.log('Activity response:', activityData);
      console.log('Activity:', activityData.activity?.length || 0, 'items');
      console.log('Tracking response:', trackingData);
      console.log('Tracking:', trackingData.tracking?.length || 0, 'items');
      console.log('Payouts response:', payoutsData);
      console.log('Payouts:', payoutsData.payouts?.length || 0, 'items');

      if (linksData.error) console.error('Links error:', linksData.error);
      if (activityData.error) console.error('Activity error:', activityData.error);
      if (trackingData.error) console.error('Tracking error:', trackingData.error);
      if (payoutsData.error) console.error('Payouts error:', payoutsData.error);

      setLinks(linksData.links || []);
      setActivity(activityData.activity || []);
      setTracking(trackingData.tracking || []);
      setPayouts(payoutsData.payouts || []);
    } catch (error) {
      console.error('Dashboard: Exception while fetching data:', error);
      console.error('Dashboard: Error message:', error.message);
      console.error('Dashboard: Error stack:', error.stack);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0);
  const totalConversions = links.reduce((sum, link) => sum + link.conversions, 0);
  const totalCommissions = activity.filter(a => a.status === 'approved').reduce((sum, a) => sum + a.amount, 0);
  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);

  const copyToClipboard = async (text: string, id: number) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for browsers that don't support clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed:', err);
        }

        document.body.removeChild(textArea);
      }

      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      // Still show the copied state even if copy fails
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const simulateClick = async (linkId: number) => {
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/click`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ linkId })
      });
      await fetchData();
    } catch (error) {
      console.error('Error recording click:', error);
    }
  };

  const simulateConversion = async (linkId: number, cardName: string) => {
    const commissions = { 1: 150, 2: 100, 3: 125, 4: 175 };
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/conversion`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          linkId,
          cardName,
          commission: commissions[linkId] || 100
        })
      });
      await fetchData();
    } catch (error) {
      console.error('Error recording conversion:', error);
    }
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

      {/* Data Debug Banner */}
      <div className="bg-blue-50 border-b border-blue-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center gap-4 text-xs text-blue-800">
            <span className="font-semibold">Data Status:</span>
            <span>Links: {links.length}</span>
            <span>Activity: {activity.length}</span>
            <span>Tracking: {tracking.length}</span>
            <span>Payouts: {payouts.length}</span>
            <button
              onClick={fetchData}
              className="ml-auto px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              Refresh All
            </button>
          </div>
        </div>
      </div>

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
              <span className="text-gray-600">Total Payouts</span>
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl mb-1">${totalPayouts.toLocaleString()}</div>
            <div className="text-gray-500">All time</div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="links" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <Tabs.List className="flex border-b border-gray-200 overflow-x-auto">
            <Tabs.Trigger
              value="links"
              className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            >
              Tracking Links
            </Tabs.Trigger>
            <Tabs.Trigger
              value="activity"
              className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            >
              Activity
            </Tabs.Trigger>
            <Tabs.Trigger
              value="payouts"
              className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            >
              Payouts
            </Tabs.Trigger>
            <Tabs.Trigger
              value="tracking"
              className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            >
              API Tracking
            </Tabs.Trigger>
            <Tabs.Trigger
              value="profile"
              className="px-6 py-4 text-gray-600 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            >
              Profile
            </Tabs.Trigger>
          </Tabs.List>

          {/* Tracking Links Tab */}
          <Tabs.Content value="links" className="p-6">
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Demo:</strong> Use the buttons below to simulate clicks and conversions for testing.
              </p>
            </div>
            <div className="space-y-4">
              {links.map((link) => (
                <div key={link.id} className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <h3>{link.name}</h3>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-600">{link.clicks} clicks</span>
                      <span className="text-green-600">{link.conversions} approvals</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 mb-3">
                    <code className="flex-1 text-sm overflow-x-auto">{link.url}</code>
                    <button
                      onClick={() => copyToClipboard(link.url, link.id)}
                      className="p-2 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      title="Copy link"
                    >
                      {copiedId === link.id ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-600" />
                      )}
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => simulateClick(link.id)}
                      className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      + Simulate Click
                    </button>
                    <button
                      onClick={() => simulateConversion(link.id, link.name)}
                      className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                    >
                      + Simulate Approval
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Tabs.Content>

          {/* Activity Tab */}
          <Tabs.Content value="activity" className="p-6">
            {activity.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No activity yet. Start promoting your tracking links!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-600">Date</th>
                      <th className="text-left py-3 px-4 text-gray-600">Card</th>
                      <th className="text-left py-3 px-4 text-gray-600">Type</th>
                      <th className="text-right py-3 px-4 text-gray-600">Commission</th>
                      <th className="text-right py-3 px-4 text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">{item.date}</td>
                        <td className="py-3 px-4">{item.card}</td>
                        <td className="py-3 px-4 capitalize">{item.type}</td>
                        <td className="py-3 px-4 text-right">${item.amount}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs ${
                              item.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
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

          {/* Payouts Tab */}
          <Tabs.Content value="payouts" className="p-6">
            {payouts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No payouts yet. Keep promoting to earn commissions!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-600">Date</th>
                      <th className="text-right py-3 px-4 text-gray-600">Amount</th>
                      <th className="text-left py-3 px-4 text-gray-600">Method</th>
                      <th className="text-right py-3 px-4 text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">{payout.date}</td>
                        <td className="py-3 px-4 text-right">${payout.amount.toLocaleString()}</td>
                        <td className="py-3 px-4">{payout.method}</td>
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

          {/* API Tracking Tab */}
          <Tabs.Content value="tracking" className="p-6">
            <div className="mb-4 p-4 bg-green-50 rounded-lg flex items-center justify-between">
              <p className="text-sm text-green-800">
                <strong>API Tracking:</strong> Real-time data from Airtable API Output showing all your card clicks, applications, and approvals. ({tracking.length} records)
              </p>
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
            {tracking.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-2">No tracking activity found</p>
                <p className="text-sm text-gray-500">Check browser console for debug info</p>
                <button
                  onClick={fetchData}
                  className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Refresh Data
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-gray-700">Date/Time</th>
                      <th className="text-left py-3 px-4 text-gray-700">Card</th>
                      <th className="text-left py-3 px-4 text-gray-700">Status</th>
                      <th className="text-right py-3 px-4 text-gray-700">Earnings</th>
                      <th className="text-left py-3 px-4 text-gray-700">Device</th>
                      <th className="text-left py-3 px-4 text-gray-700">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracking.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">
                          <div>{item.clickDate}</div>
                          <div className="text-xs text-gray-500">{item.clickTime?.split('T')[1]?.split('.')[0]}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">{item.cardName}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.status === 'approval' ? 'bg-green-100 text-green-800' :
                            item.status === 'application' ? 'bg-blue-100 text-blue-800' :
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

          {/* Profile Tab */}
          <Tabs.Content value="profile">
            <Profile accessToken={accessToken} />
          </Tabs.Content>
        </Tabs.Root>
      </main>
    </div>
  );
}
