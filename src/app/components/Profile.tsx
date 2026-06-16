import { useState, useEffect } from 'react';
import { User, Save, Copy, CheckCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

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
    firstName: '',
    lastName: '',
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

  /** Build headers that work for both regular and impersonation sessions.
   *  Supabase infra requires Authorization at the network level; impersonation
   *  sessions use the anon key there and pass the imp token via a custom header. */
  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken?.startsWith('imp_')) {
      h['Authorization'] = `Bearer ${publicAnonKey}`;
      h['X-Impersonation-Token'] = accessToken;
    } else {
      h['Authorization'] = `Bearer ${accessToken}`;
    }
    return h;
  };

  const fetchUserData = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/user`,
        { headers: buildHeaders() }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.user) {
        setLoading(false);
        return;
      }

      setUserData(data.user);
      const nameParts = (data.user.name || '').trim().split(/\s+/);
      setFormData({
        email:     data.user.email   || '',
        firstName: nameParts[0]      || '',
        lastName:  nameParts.slice(1).join(' ') || '',
        phone:     data.user.phone   || '',
        address:   data.user.address || '',
        city:      data.user.city    || '',
        state:     data.user.state   || '',
        zip:       data.user.zip     || '',
        country:   data.user.country || '',
      });
    } catch (error) {
      // userData stays null → error UI shown
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage('');

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/user`,
        {
          method: 'PUT',
          headers: buildHeaders(),
          body: JSON.stringify({
            ...formData,
            name: `${formData.firstName} ${formData.lastName}`.trim(),
          })
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

  const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm text-ink bg-white";
  const labelCls = "block text-sm font-medium text-subtle mb-1.5";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-faint text-sm">Loading profile…</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-1">Failed to load profile data</p>
          <p className="text-faint text-xs">Check the browser console for details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-brand-soft rounded-xl">
            <User className="w-5 h-5 text-brand" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Affiliate Profile</h2>
        </div>

        {successMessage && (
          <div className="mb-5 p-3.5 bg-emerald-50 text-emerald-800 rounded-xl text-sm ring-1 ring-emerald-200/60">
            {successMessage}
          </div>
        )}

        {/* Affiliate ID */}
        <div className="bg-gradient-to-r from-brand-soft to-brand-soft rounded-2xl p-6 mb-5 ring-1 ring-brand/30">
          <label className="block text-xs font-semibold text-faint uppercase tracking-wider mb-2">Your Affiliate ID</label>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-2xl font-bold text-ink tracking-tight">
              {userData?.affiliateId || 'N/A'}
            </code>
            <button
              onClick={copyAffiliateId}
              className="p-2.5 bg-white hover:bg-surface rounded-xl transition-colors ring-1 ring-brand/30"
              title="Copy Affiliate ID"
            >
              {copiedId
                ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                : <Copy className="w-5 h-5 text-brand" />}
            </button>
          </div>
          <p className="text-xs text-faint mt-2">This ID is embedded in all your tracking links</p>
        </div>

        {/* Contact Form */}
        <div className="bg-white rounded-2xl ring-1 ring-ink/5 shadow-sm p-6">
          <h3 className="text-base font-semibold text-ink mb-5">Contact Information</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className={labelCls}>Email Address *</label>
              <input
                id="email" type="email" required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputCls}
              />
              <p className="text-xs text-faint mt-1.5">Changing your email updates your login credentials</p>
            </div>

            {/* First Name + Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className={labelCls}>First Name *</label>
                <input
                  id="firstName" type="text" required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className={inputCls}
                  placeholder="John"
                />
              </div>
              <div>
                <label htmlFor="lastName" className={labelCls}>Last Name *</label>
                <input
                  id="lastName" type="text" required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className={inputCls}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className={labelCls}>Phone Number</label>
              <input
                id="phone" type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={inputCls}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            {/* Address */}
            <div>
              <label htmlFor="address" className={labelCls}>Street Address</label>
              <input
                id="address" type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className={inputCls}
                placeholder="123 Main Street"
              />
            </div>

            {/* City / State / ZIP */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="city" className={labelCls}>City</label>
                <input
                  id="city" type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="state" className={labelCls}>State / Province</label>
                <input
                  id="state" type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="zip" className={labelCls}>ZIP / Postal Code</label>
                <input
                  id="zip" type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Country */}
            <div>
              <label htmlFor="country" className={labelCls}>Country</label>
              <input
                id="country" type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className={inputCls}
                placeholder="United States"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Account Details */}
        <div className="mt-5 bg-surface rounded-2xl p-5 ring-1 ring-hair/60">
          <h3 className="text-sm font-semibold text-subtle mb-3">Account Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-faint">Member Since:</span>
              <span className="font-medium text-ink">
                {userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-faint">Last Updated:</span>
              <span className="font-medium text-ink">
                {userData?.updatedAt ? new Date(userData.updatedAt).toLocaleDateString() : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
