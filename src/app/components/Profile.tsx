import { useState, useEffect } from 'react';
import { User, Save, Copy, CheckCircle } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface ProfileProps {
  accessToken: string;
}

export function Profile({ accessToken }: ProfileProps) {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: ''
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      console.log('Profile: Fetching user data with access token:', accessToken?.substring(0, 10) + '...');
      console.log('Profile: Token type:', accessToken?.startsWith('imp_') ? 'impersonation' : 'regular');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Use custom header for impersonation tokens to bypass Supabase JWT validation
      if (accessToken?.startsWith('imp_')) {
        headers['X-Impersonation-Token'] = accessToken;
      } else {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/user`,
        { headers }
      );

      console.log('Profile: Response status:', response.status);
      console.log('Profile: Response ok?', response.ok);

      let data;
      try {
        data = await response.json();
        console.log('Profile: Response data:', data);
      } catch (parseError) {
        console.error('Profile: Failed to parse response as JSON:', parseError);
        const text = await response.text();
        console.error('Profile: Response text:', text);
        return;
      }

      if (!response.ok) {
        console.error('Profile: Failed to fetch user data. Status:', response.status, 'Error:', data.error || 'No error message provided');
        console.error('Profile: Full response data:', JSON.stringify(data));
        return;
      }

      if (data.user) {
        console.log('Profile: User data loaded successfully:', data.user);
        setUserData(data.user);
        setFormData({
          email: data.user.email || '',
          name: data.user.name || '',
          phone: data.user.phone || '',
          address: data.user.address || '',
          city: data.user.city || '',
          state: data.user.state || '',
          zip: data.user.zip || '',
          country: data.user.country || ''
        });
      } else {
        console.error('Profile: No user data in response. Full response:', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Profile: Exception while fetching user data:', error);
      console.error('Profile: Error message:', error.message);
      console.error('Profile: Error stack:', error.stack);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Use custom header for impersonation tokens
      if (accessToken?.startsWith('imp_')) {
        headers['X-Impersonation-Token'] = accessToken;
      } else {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/user`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(formData)
        }
      );

      const data = await response.json();
      if (data.success) {
        setUserData(data.user);
        setSuccessMessage('Profile updated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const copyAffiliateId = async () => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = userData.affiliateId;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Loading profile...</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load profile data</p>
          <p className="text-gray-600 text-sm">Check the browser console for error details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-indigo-600" />
          <h2 className="text-2xl">Affiliate Profile</h2>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 text-green-800 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* Affiliate ID Section */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-6 border border-indigo-200">
          <label className="block text-sm text-gray-700 mb-2">Your Affiliate ID</label>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-2xl font-bold text-indigo-900">
              {userData?.affiliateId || 'N/A'}
            </code>
            <button
              onClick={copyAffiliateId}
              className="p-3 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-indigo-200"
              title="Copy Affiliate ID"
            >
              {copiedId ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-indigo-600" />
              )}
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            This ID is used in all your tracking links
          </p>
        </div>

        {/* Contact Information Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="mb-6">Contact Information</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block mb-2 text-gray-700">
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Changing your email will update your login credentials
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block mb-2 text-gray-700">
                  Full Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="phone" className="block mb-2 text-gray-700">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div>
              <label htmlFor="address" className="block mb-2 text-gray-700">
                Street Address
              </label>
              <input
                id="address"
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="123 Main Street"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="city" className="block mb-2 text-gray-700">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="state" className="block mb-2 text-gray-700">
                  State/Province
                </label>
                <input
                  id="state"
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="zip" className="block mb-2 text-gray-700">
                  ZIP/Postal Code
                </label>
                <input
                  id="zip"
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="country" className="block mb-2 text-gray-700">
                Country
              </label>
              <input
                id="country"
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="United States"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Account Details */}
        <div className="mt-6 bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="mb-4">Account Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Member Since:</span>
              <span className="font-medium">
                {userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Updated:</span>
              <span className="font-medium">
                {userData?.updatedAt ? new Date(userData.updatedAt).toLocaleDateString() : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
