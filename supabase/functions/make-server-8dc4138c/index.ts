import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Fetch credit cards from CardBenefit API
async function fetchCards() {
  try {
    console.log('Fetching cards from CardBenefit API...');
    const response = await fetch(
      'https://www.cardbenefit.com/cardWebService/CBCardService.php?user=92252472&key=kaWzigpZELWKY&format=json'
    );

    if (!response.ok) {
      console.log('CardBenefit API returned status:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('CardBenefit API response type:', typeof data);
    console.log('Is array?', Array.isArray(data));

    // Ensure we have an array
    let cardsArray = [];
    if (Array.isArray(data)) {
      cardsArray = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.cards)) {
      cardsArray = data.cards;
    } else if (data && typeof data === 'object') {
      console.log('CardBenefit response keys:', Object.keys(data));
      cardsArray = [];
    }

    console.log('Successfully fetched', cardsArray.length, 'cards from CardBenefit');

    if (cardsArray.length === 0) {
      console.log('No cards returned from API, using fallback');
      // Fallback to sample cards if API fails
      return [
        { card: { name: 'Premium Rewards Card', bank: 'Chase', link: 'https://apply.cards/premium-rewards?ref=SAMPLE', annualFee: 95, creditLevel: 'Excellent' } },
        { card: { name: 'Cash Back Plus', bank: 'Citi', link: 'https://apply.cards/cashback-plus?ref=SAMPLE', annualFee: 0, creditLevel: 'Good' } },
        { card: { name: 'Travel Elite Card', bank: 'Amex', link: 'https://apply.cards/travel-elite?ref=SAMPLE', annualFee: 550, creditLevel: 'Excellent' } },
        { card: { name: 'Business Advantage', bank: 'Capital One', link: 'https://apply.cards/business-adv?ref=SAMPLE', annualFee: 0, creditLevel: 'Fair' } },
      ];
    }

    return cardsArray;
  } catch (error) {
    console.log('Error fetching cards from CardBenefit:', error.message);
    console.log('Error stack:', error.stack);
    // Return fallback cards
    return [
      { card: { name: 'Premium Rewards Card', bank: 'Chase', link: 'https://apply.cards/premium-rewards?ref=SAMPLE', annualFee: 95, creditLevel: 'Excellent' } },
      { card: { name: 'Cash Back Plus', bank: 'Citi', link: 'https://apply.cards/cashback-plus?ref=SAMPLE', annualFee: 0, creditLevel: 'Good' } },
      { card: { name: 'Travel Elite Card', bank: 'Amex', link: 'https://apply.cards/travel-elite?ref=SAMPLE', annualFee: 550, creditLevel: 'Excellent' } },
      { card: { name: 'Business Advantage', bank: 'Capital One', link: 'https://apply.cards/business-adv?ref=SAMPLE', annualFee: 0, creditLevel: 'Fair' } },
    ];
  }
}

/**
 * Build a correctly-formatted affiliate tracking URL.
 *
 * cardbenefit.com requires the `ref=` query parameter.
 * Some legacy slugs/links stored in Airtable or the CardBenefit API
 * contain `uv=` instead (an older/incorrect parameter name).
 * This helper normalises every URL: removes `uv=` and sets `ref=<affiliateId>`.
 */
function buildAffiliateUrl(rawLink: string | undefined, affiliateId: string, cardName?: string): string {
  const fallback = `https://apply.cards/${(cardName || 'card').toLowerCase().replace(/\s+/g, '-')}?ref=${affiliateId}`;
  if (!rawLink) return fallback;

  try {
    // Ensure it's an absolute URL so the URL constructor works
    const absolute = rawLink.startsWith('http')
      ? rawLink
      : `https://www.cardbenefit.com/${rawLink.replace(/^\//, '')}`;

    const u = new URL(absolute);
    u.searchParams.delete('uv');             // remove wrong param
    u.searchParams.set('ref', affiliateId);  // set correct param
    return u.toString();
  } catch {
    // URL constructor failed (malformed) — fall back to string surgery
    const stripped = rawLink.replace(/([?&])uv=[^&]*/g, '$1').replace(/[?&]$/, '');
    const sep = stripped.includes('?') ? '&' : '?';
    return `${stripped}${sep}ref=${affiliateId}`;
  }
}

// Get user from access token or impersonation token
async function getUserFromToken(accessToken, impersonationToken = null) {
  // Check if it's an impersonation token (either from header or from Authorization)
  const tokenToCheck = impersonationToken || accessToken;

  if (tokenToCheck?.startsWith('imp_')) {
    // Token format: imp_{userId}_{expiresTimestamp}
    // userId is a UUID (contains hyphens but not underscores), so lastIndexOf finds the separator
    const withoutPrefix = tokenToCheck.slice(4);
    const lastUnderscore = withoutPrefix.lastIndexOf('_');
    if (lastUnderscore === -1) {
      return { user: null, error: 'Invalid impersonation token' };
    }
    const userId = withoutPrefix.slice(0, lastUnderscore);
    const expiresTimestamp = parseInt(withoutPrefix.slice(lastUnderscore + 1));

    if (!userId || isNaN(expiresTimestamp)) {
      return { user: null, error: 'Invalid impersonation token' };
    }
    if (Date.now() > expiresTimestamp) {
      return { user: null, error: 'Impersonation token expired' };
    }
    return { user: { id: userId }, error: null };
  }

  // Regular Supabase access token
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  return { user, error };
}

// Sync tracking event to Airtable API Output table
async function syncTrackingToAirtable(affiliateId, cardName, status, earnings = 0) {
  try {
    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'API Output';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    if (!airtableToken) {
      console.log('Airtable API key not configured, skipping tracking sync');
      return null;
    }

    const now = new Date();
    const fields = {
      'affiliate-id': affiliateId,
      'Card Name': cardName,
      'Status': status, // 'click', 'application', 'approval'
      'Click Date': now.toISOString().split('T')[0],
      'Click Time': now.toISOString(),
      'Process Date': now.toISOString().split('T')[0],
      'Total Earnings': earnings,
      'Clicks': status === 'click' ? 1 : 0,
      'Applications': status === 'application' ? 1 : 0,
      'Approvals': status === 'approval' ? 1 : 0
    };

    console.log('Syncing tracking event to Airtable:', fields);

    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${airtableToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Airtable tracking sync error:', response.status, errorText);
      return null;
    } else {
      const result = await response.json();
      console.log('Successfully synced tracking event to Airtable:', result.id);
      return result.id;
    }
  } catch (error) {
    console.log('Error syncing tracking to Airtable:', error.message);
    return null;
  }
}

// Sync user data back to Airtable
async function syncToAirtable(airtableRecordId, userData, userId = null) {
  try {
    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'Affiliates';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    if (!airtableToken) {
      console.log('Airtable API key not configured, skipping sync');
      return null;
    }

    // Split name into first and last
    const nameParts = (userData.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const fields: Record<string, any> = {
      'Email':        userData.email,
      'Name':         userData.name  || `${firstName} ${lastName}`.trim(),
      'First Name':   firstName,
      'Last Name':    lastName,
      'Phone':        userData.phone || '',
      'Affiliate-ID': userData.affiliateId || '',
      // 'Aff Cut' is a number field — must send a number, not a string
      'Aff Cut':      Number(userData.commissionRate) || 50,
      'Activity':     true,
    };

    // Only sync the affiliate link reference when we have a value for it in KV,
    // so we don't blow away an Airtable-side value that hasn't been pulled yet.
    if (userData.ezrxRef !== undefined) {
      fields['ezrxref-'] = userData.ezrxRef;
    }

    // If no Airtable record ID yet, try to find existing record by email
    // to avoid creating duplicates
    if (!airtableRecordId && userData.email) {
      const searchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(`{Email}="${userData.email}"`)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${airtableToken}` }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.records?.length > 0) {
          airtableRecordId = searchData.records[0].id;
          console.log('Found existing Airtable record by email:', airtableRecordId);
          // Persist the found ID back to KV
          if (userId) {
            const cur = await kv.get(`user:${userId}`);
            if (cur) { cur.airtableRecordId = airtableRecordId; await kv.set(`user:${userId}`, cur); }
          }
        }
      }
    }

    if (airtableRecordId) {
      // Update existing record
      console.log('Updating Airtable record:', airtableRecordId);
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${airtableRecordId}`;
      const response = await fetch(airtableUrl, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Airtable update error:', response.status, errorText);
      } else {
        console.log('Successfully updated Airtable record');
      }
      return airtableRecordId;
    } else {
      // Create new record in Airtable
      console.log('Creating new Airtable record for:', userData.email);
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
      const response = await fetch(airtableUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Airtable create error:', response.status, errorText);
        return null;
      }
      const result = await response.json();
      console.log('Successfully created Airtable record:', result.id);
      // Persist the new record ID back to KV
      if (userId) {
        const currentUserData = await kv.get(`user:${userId}`);
        if (currentUserData) {
          currentUserData.airtableRecordId = result.id;
          await kv.set(`user:${userId}`, currentUserData);
        }
      }
      return result.id;
    }
  } catch (error) {
    console.log('Error syncing to Airtable:', error.message);
    return null;
  }
}

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Manager-Session", "X-Impersonation-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-8dc4138c/health", (c) => {
  return c.json({ status: "ok" });
});

// Signup endpoint
app.post("/make-server-8dc4138c/signup", async (c) => {
  try {
    const { email: rawEmail, password, name } = await c.req.json();
    // Normalize email (lowercase + trim) so accounts aren't case-sensitive.
    const email = (rawEmail || '').trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log(`Signup error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    // Initialize user's affiliate data
    const affiliateId = `ai-${Math.random().toString(36).substring(2, 7)}`;
    await kv.set(`user:${data.user.id}`, {
      email,
      name,
      affiliateId,
      createdAt: new Date().toISOString()
    });

    // Initialize tracking links with real card data
    const cards = await fetchCards();
    const cardsArray = Array.isArray(cards) ? cards : [];
    const trackingLinks = cardsArray.slice(0, 10).map((item, index) => {
      const card = item.card;
      const url = buildAffiliateUrl(card.link, affiliateId, card.name);
      return {
        id: index + 1,
        name: card.name,
        bank: card.bank,
        url,
        clicks: 0,
        conversions: 0,
        commission: 150,
        annualFee: card.annualFee,
        creditLevel: card.creditLevel
      };
    });

    await kv.set(`links:${data.user.id}`, trackingLinks);
    await kv.set(`activity:${data.user.id}`, []);
    await kv.set(`payouts:${data.user.id}`, []);

    // Sync new affiliate to Airtable and store the returned record ID
    const newUserData = await kv.get(`user:${data.user.id}`);
    const airtableRecordId = await syncToAirtable(null, newUserData, data.user.id);
    if (airtableRecordId) {
      console.log('Signup: created Airtable record', airtableRecordId);
    }

    return c.json({ success: true, user: data.user });
  } catch (error) {
    console.log(`Signup error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Login endpoint
app.post("/make-server-8dc4138c/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
    );

    // Email is not case-sensitive — Supabase Auth stores emails lowercased, so
    // normalize the input so "John@X.com" signs in the same as "john@x.com".
    const { data, error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim().toLowerCase(),
      password,
    });

    if (error) {
      console.log(`Login error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    return c.json({
      success: true,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.log(`Login error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Get tracking links
// Decode common HTML entities (CardBenefit / Airtable data often includes &reg; etc.)
function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g,   '&')
    .replace(/&reg;/g,   '®')
    .replace(/&trade;/g, '™')
    .replace(/&copy;/g,  '©')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

app.get("/make-server-8dc4138c/links", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Ensure user has an affiliate ID
    const userData = await kv.get(`user:${user.id}`) || {};
    let affiliateId = userData.affiliateId;
    if (!affiliateId) {
      affiliateId = `AF${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      userData.affiliateId = affiliateId;
      await kv.set(`user:${user.id}`, userData);
      console.log(`Generated affiliate ID: ${affiliateId} for user ${user.id}`);
    }

    // Load any existing KV links so we can preserve click/conversion counts
    const existingLinks: any[] = await kv.get(`links:${user.id}`) || [];
    const clickMap: Record<string, { clicks: number; conversions: number }> = {};
    for (const l of existingLinks) {
      if (l.name) clickMap[l.name] = { clicks: l.clicks || 0, conversions: l.conversions || 0 };
    }

    // Pull live card list from Airtable CPA Changes (same source as Payouts tab)
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    const baseId = 'appJq70k9nl9MK2zk';
    const tableId = 'tbl31rWYAh5hb02Tx';
    const params = [
      'fields[]=Card+Name',
      'fields[]=Issuer',
      'fields[]=Net+CPA+60%25',
      'fields[]=slug',
      'sort[0][field]=Card+Name',
      'sort[0][direction]=asc',
    ].join('&');

    let records: any[] = [];
    if (airtableToken) {
      try {
        records = await getCachedCardList(airtableToken);
        console.log(`Loaded ${records.length} cards (cached snapshot)`);
      } catch (err: any) {
        console.log('Airtable links fetch error:', err.message);
      }
    }

    // Real per-card stats for this affiliate, aggregated from the Airtable
    // tracking table (the same source the Activity tab uses) so the Cards tab's
    // clicks / conv% / earned reflect actual data instead of the legacy in-app
    // click counter (which is only bumped by the /click + /conversion pixels and
    // is effectively all zeros). "conversions" = paid approvals, so conv% is the
    // approval rate and earned = CPA × conversions is correct.
    const _normName = (s: string) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cardClicks: Record<string, number> = {};
    const cardApprovals: Record<string, number> = {};
    if (airtableToken) {
      try {
        const tracking = await getCachedTracking(airtableToken);
        const ezrxRaw = (userData.ezrxRef || '').toString().trim();
        const ezrxVal = ezrxRaw
          ? (ezrxRaw.toLowerCase().startsWith('ezrxref-') ? ezrxRaw : `ezrxref-${ezrxRaw}`)
          : '';
        const ownIds = new Set([affiliateId, ezrxVal].filter(Boolean).map(s => s.toString().trim().toLowerCase()));
        const mine = (v: unknown) => (Array.isArray(v) ? v : [v]).some(x => x != null && ownIds.has(x.toString().trim().toLowerCase()));
        for (const rec of tracking) {
          if (!mine(rec.fields['affiliate-id'])) continue;
          const nm = _normName(rec.fields['Card Name'] || '');
          if (!nm) continue;
          cardClicks[nm]    = (cardClicks[nm]    || 0) + (parseInt(rec.fields['Clicks'])    || 0);
          cardApprovals[nm] = (cardApprovals[nm] || 0) + (parseInt(rec.fields['Approvals']) || 0);
        }
      } catch (err: any) {
        console.log('per-card stats aggregation error (non-fatal):', err.message);
      }
    }

    // Deduplicate by card name (keep first / most-recent per card after sort)
    const seen = new Set<string>();
    const links = [];

    for (let i = 0; i < records.length; i++) {
      const f = records[i].fields || {};
      const rawName = f['Card Name'] ?? '';
      const cardName = decodeHtml(rawName.trim());
      if (!cardName || seen.has(cardName)) continue;
      seen.add(cardName);

      const issuer   = decodeHtml(f['Issuer'] ?? '');
      const bankCpa  = parseFloat(String(f['Net CPA 60%'] ?? '0').replace(/[^0-9.]/g, '')) || 0;
      const slug     = (f['slug'] ?? '').trim();

      // Build tracking URL from slug; fall back to a slug derived from card name.
      // Use buildAffiliateUrl so any legacy uv= param in the slug gets replaced with ref=.
      const urlSlug  = slug || cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const url      = buildAffiliateUrl(urlSlug, affiliateId, cardName);

      // Prefer real tracking-derived stats; fall back to the legacy click counter.
      const nm   = _normName(cardName);
      const prev = clickMap[cardName] || { clicks: 0, conversions: 0 };
      const clicks      = cardClicks[nm]    ?? prev.clicks;
      const conversions = cardApprovals[nm] ?? prev.conversions;

      links.push({
        id: i + 1,
        name: cardName,
        bank: issuer,
        url,
        clicks,
        conversions,
        commission:  bankCpa,   // bank CPA; affiliate cut calculated at display time
      });
    }

    // Persist updated list (keeps click counts in sync)
    if (links.length > 0) {
      await kv.set(`links:${user.id}`, links);
    }

    // Build the single cardratings.com master link.
    // The base URL (src + shnq) is the same for all affiliates — only the
    // per-affiliate var2 changes. The ezrxref- field now stores the full value
    // (prefix + number, e.g. "ezrxref-14"); legacy values may be just the
    // number. Emit exactly one "ezrxref-" prefix either way.
    const MASTER_LINK_BASE = 'https://www.cardratings.com/bestcards/featured-credit-cards?src=693350&shnq=4028089,4048264,5048295,340040,4048084,4048251';
    const ezrxRefRaw = (userData.ezrxRef || '').trim();
    const var2 = ezrxRefRaw
      ? (ezrxRefRaw.toLowerCase().startsWith('ezrxref-') ? ezrxRefRaw : `ezrxref-${ezrxRefRaw}`)
      : '';
    const masterLink = var2
      ? `${MASTER_LINK_BASE}&var2=${var2}`
      : '';

    return c.json({ links, masterLink });
  } catch (error) {
    console.log(`Get links error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Record click
app.post("/make-server-8dc4138c/click", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { linkId } = await c.req.json();

    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const links = await kv.get(`links:${user.id}`) || [];
    const clickedLink = links.find(link => link.id === linkId);
    const updatedLinks = links.map(link =>
      link.id === linkId ? { ...link, clicks: link.clicks + 1 } : link
    );
    await kv.set(`links:${user.id}`, updatedLinks);

    // Sync click to Airtable
    if (clickedLink) {
      const userData = await kv.get(`user:${user.id}`) || {};
      await syncTrackingToAirtable(
        userData.affiliateId,
        clickedLink.name,
        'click',
        0
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.log(`Record click error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Record conversion
app.post("/make-server-8dc4138c/conversion", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { linkId, cardName, commission } = await c.req.json();

    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Update link conversions
    const links = await kv.get(`links:${user.id}`) || [];
    const updatedLinks = links.map(link =>
      link.id === linkId ? { ...link, conversions: link.conversions + 1 } : link
    );
    await kv.set(`links:${user.id}`, updatedLinks);

    // Add activity record
    const activity = await kv.get(`activity:${user.id}`) || [];
    const newActivity = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      card: cardName,
      type: 'approval',
      amount: commission,
      status: 'pending'
    };
    activity.unshift(newActivity);
    await kv.set(`activity:${user.id}`, activity);

    // Sync conversion to Airtable
    const userData = await kv.get(`user:${user.id}`) || {};
    await syncTrackingToAirtable(
      userData.affiliateId,
      cardName,
      'approval',
      commission
    );

    return c.json({ success: true });
  } catch (error) {
    console.log(`Record conversion error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Get user's tracking activity from Airtable
app.get("/make-server-8dc4138c/tracking", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get user data to find their affiliate ID
    const userData = await kv.get(`user:${user.id}`) || {};
    const affiliateId = userData.affiliateId;

    console.log(`Fetching tracking for user ${user.id}, affiliate ID: ${affiliateId}`);

    if (!affiliateId) {
      console.log('No affiliate ID found for user');
      return c.json({ tracking: [] });
    }

    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'API Output';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    if (!airtableToken) {
      console.log('Airtable API key not configured');
      return c.json({ tracking: [] });
    }

    // Fetch ALL records from the full table (no view/formula filter, since
    // `affiliate-id` is an Airtable lookup field and can't be matched with
    // filterByFormula), then filter to this affiliate's rows in JS.
    console.log(`Fetching tracking records (cached snapshot) and filtering for affiliate ${affiliateId}`);

    const records = await getCachedTracking(airtableToken);

    // A row's Var2 (the `affiliate-id` field) may be this affiliate's code
    // (Affiliate-ID) OR their ezrxref- link value — accept either.
    const ezrxRefRaw = (userData.ezrxRef || '').toString().trim();
    const ezrxVal = ezrxRefRaw
      ? (ezrxRefRaw.toLowerCase().startsWith('ezrxref-') ? ezrxRefRaw : `ezrxref-${ezrxRefRaw}`)
      : '';
    // Match Var2 case-insensitively — a click's Var2 and the affiliate's stored
    // code can differ in letter case (e.g. "afwcrxq" vs "AFWCRXQ").
    const ownIds = new Set(
      [affiliateId, ezrxVal].filter(Boolean).map(s => s.toString().trim().toLowerCase()),
    );
    const matchesAffiliate = (value: unknown) => {
      const arr = Array.isArray(value) ? value : [value];
      return arr.some(v => v != null && ownIds.has(v.toString().trim().toLowerCase()));
    };

    const ownRecords = records.filter(record => matchesAffiliate(record.fields['affiliate-id']));

    console.log(`Found ${ownRecords.length} of ${records.length} tracking records for affiliate ${affiliateId}`);

    // Format tracking records
    const tracking = ownRecords.map(record => ({
      id: record.id,
      cardName: record.fields['Card Name'] || 'Unknown',
      status: record.fields['Status'] || 'N/A',
      totalEarnings: parseFloat(record.fields['Total Earnings']) || 0,
      clickDate: record.fields['Click Date'] || '',
      clickTime: record.fields['Click Time'] || '',
      processDate: record.fields['Process Date'] || record.fields['Click Date'] || '',
      clicks: parseInt(record.fields['Clicks']) || 0,
      applications: parseInt(record.fields['Applications']) || 0,
      approvals: parseInt(record.fields['Approvals']) || 0,
      deviceType: record.fields['Device Type'] || '',
      state: record.fields['State'] || '',
      stateCode: record.fields['State Code'] || '',
      country: record.fields['Country Code'] || ''
    }));

    return c.json({ tracking, syncedAt: await kv.get(SYNCED_AT_KEY) });
  } catch (error) {
    console.log(`Get tracking error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Get activity
app.get("/make-server-8dc4138c/activity", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const activity = await kv.get(`activity:${user.id}`) || [];
    return c.json({ activity });
  } catch (error) {
    console.log(`Get activity error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Fetch ALL records from an Airtable table, paginating automatically (max 100/page).
async function fetchAllAirtableRecords(token: string, baseId: string, tableId: string, params: string): Promise<any[]> {
  const all: any[] = [];
  let offset: string | null = null;
  do {
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?${params}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Airtable ${res.status}: ${errText.substring(0, 200)}`);
    }
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset ?? null;
  } while (offset);
  return all;
}

// ── CPA rate cache helpers ───────────────────────────────────────────────────
// Raw Airtable records from CPA Changes are cached in KV for 15 minutes so
// every affiliate page-load doesn't hit Airtable separately.
const CPA_CACHE_KEY = 'cache:cpa_rates_raw';
const CPA_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — refresh via Import CPA Rates

// ── Card Rating (QuinStreet ListingDisplay) helpers ──────────────────────────
// Card enrichment (logo, card type, cardId, bonuses, APR) is pulled DIRECTLY
// from the QuinStreet / NextInsure ListingDisplay API — one call per issuer —
// then cached in KV. This is the same feed that used to populate the Airtable
// "CardRatingAPI" table via an Airtable automation; we now run it ourselves, so
// there's no Airtable dependency for card-rating anymore.
const CARD_RATING_CACHE_KEY = 'cache:card_rating_api';
const CARD_RATING_CACHE_TTL_MS = 15 * 24 * 60 * 60 * 1000; // 15 days (manual refresh also available)

const QS_LISTING_BASE = 'https://www.nextinsure.com/ListingDisplay/Display/';
const QS_LISTING_SRC = '693350';
const QS_LISTING_VERSION = 2;
const QS_LISTING_MAX = 1000;
// Issuer → QuinStreet ccis (credit-card-issuer-set) id.
const QS_ISSUER_CCIS: Record<string, number> = {
  'AmEx Business': 640029, 'AmEx Consumer': 639943, 'Applied Bank': 640091,
  'Bank of America': 574429, 'Bilt': 692149, 'Capital One': 637902,
  'Celtic Bank': 607790, 'Chase': 188933, 'Chime': 669122, 'Citi': 188934,
  'CreditStrong': 691904, 'Current': 692271, 'First PREMIER': 691829,
  'First Progress': 572111, 'Luxury Card': 636901, 'Marcus': 669410,
  'Mission Lane': 691381, 'NetSpend': 663106, 'PenFed': 690515,
  'Revenued': 691015, 'Revvi': 692060, 'Self': 665501, 'StellarFi': 691424,
  'Synovus Bank': 640407, 'The Bank of Missouri': 606689, 'Upgrade': 693779,
  'US Bank': 637950, 'USAA': 692282,
};

// Strip HTML tags + decode the entities QuinStreet returns (numeric + named).
function cleanListingText(v: unknown): string {
  if (typeof v !== 'string') return v == null ? '' : String(v);
  return v
    .replace(/&#174;/g, '(R)').replace(/&#8482;/g, '(TM)').replace(/&#169;/g, '(C)').replace(/&#8480;/g, '(SM)')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '-').replace(/&#8212;/g, '--')
    .replace(/&#8216;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8226;/g, '*').replace(/&#8230;/g, '...')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/<sup>\(R\)<\/sup>/g, '(R)')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// Strip ALL trademark markers BEFORE removing non-alphanumerics so the same card
// matches whether it's written with (R)/(TM)/(SM)/(C) or ®/™/℠/© or nothing.
function normCardName(s: string): string {
  return s.toLowerCase()
    .replace(/\(r\)|\(tm\)|\(sm\)|\(c\)|®|™|℠|©/gi, ' ')
    .replace(/[^a-z0-9]/g, '');
}

// Fetch one issuer's listings from the QuinStreet ListingDisplay API.
async function fetchListingIssuer(ccis: number): Promise<any[]> {
  const url = `${QS_LISTING_BASE}?json=1&src=${QS_LISTING_SRC}&xml_version=${QS_LISTING_VERSION}&max=${QS_LISTING_MAX}&ccis=${ccis}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`listing ${ccis}: ${res.status}`);
  const data = await res.json();
  const listing = data?.ResultSet?.Listings?.Listing;
  return Array.isArray(listing) ? listing : listing ? [listing] : [];
}

// Pull every issuer in parallel and dedupe by CreditCardID.
async function fetchAllCardRatingListings(): Promise<any[]> {
  const results = await Promise.allSettled(Object.values(QS_ISSUER_CCIS).map(fetchListingIssuer));
  const out: any[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== 'fulfilled') { console.log('CardRating issuer fetch failed:', (r as any).reason?.message); continue; }
    for (const l of r.value) {
      const id = String(l?.CreditCardID || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(l);
    }
  }
  return out;
}

function buildCardRatingIndex(listings: any[]): Record<string, any> {
  const index: Record<string, any> = {};
  for (const l of listings) {
    const name = cleanListingText(l?.CardName);
    if (!name) continue;
    const creative = l?.Creative || {};
    // Use the stable CDN logo URL (cdn.nextinsure.com).
    const imageUrl = String(creative.LogoImageUrl || creative.RawLogoImageUrl || '').trim();
    index[normCardName(name)] = {
      cardId:   String(l?.CreditCardID || '').trim(),
      cardType: cleanListingText(l?.DefaultCreditCardTypeName),
      cardUse:  cleanListingText(l?.CardUse),
      imageUrl,
      annualFee:        cleanListingText(l?.AnnualFeesAmount),
      introBonus:       cleanListingText(l?.SignupReward),
      introAprRate:     cleanListingText(l?.IntroAPRRate),
      introAprDuration: cleanListingText(l?.IntroAPRDuration),
      bonusMilesFull:   cleanListingText(l?.BonusMilesFull),
    };
  }
  return index;
}

// Cached card-rating index. Fetches the QuinStreet ListingDisplay feed (per
// issuer) at most once per TTL; `force` refetches now (used by the manual sync).
// We cache only the SLIM built index (not the multi-MB raw listings) so it
// actually persists in KV. The `_airtableToken` arg is kept for call-site
// compatibility and unused.
async function getCachedCardRatingIndex(_airtableToken?: string, force = false): Promise<Record<string, any>> {
  if (!force) {
    const cached = await kv.get(CARD_RATING_CACHE_KEY);
    if (cached && cached.index && cached.fetchedAt && Date.now() - cached.fetchedAt < CARD_RATING_CACHE_TTL_MS) {
      return cached.index;
    }
  }
  const listings = await fetchAllCardRatingListings();
  if (listings.length > 0) {
    const index = buildCardRatingIndex(listings);
    await kv.set(CARD_RATING_CACHE_KEY, { index, fetchedAt: Date.now(), count: Object.keys(index).length });
    console.log(`CardRating cache updated (${Object.keys(index).length} cards from QuinStreet)`);
    return index;
  }
  // Feed returned nothing — keep serving the last good cache if we have one.
  const cached = await kv.get(CARD_RATING_CACHE_KEY);
  if (cached?.index) { console.log('CardRating feed empty — serving stale cache'); return cached.index; }
  return {};
}

function lookupCardRating(index: Record<string, any>, cardName: string): any {
  const key = normCardName(cardName);
  if (index[key]) return index[key];
  // Try the base name — strip a trailing tier/level bracket ("… [Level 2]",
  // "… [Level 1 android]") that the CPA names carry but the QuinStreet feed
  // names don't.
  const baseKey = normCardName((cardName || '').replace(/\s*\[[^\]]*\]\s*$/, ''));
  if (baseKey && baseKey !== key && index[baseKey]) return index[baseKey];
  // Partial-match fallback on the base key (guard against tiny keys that would
  // match almost anything).
  const probe = baseKey || key;
  if (probe.length >= 6) {
    for (const [k, v] of Object.entries(index)) {
      if (k.includes(probe) || probe.includes(k)) return v;
    }
  }
  return null;
}

async function getCachedCpaRecords(airtableToken: string): Promise<any[]> {
  // Try cache first
  const cached = await kv.get(CPA_CACHE_KEY);
  if (cached && cached.records && cached.fetchedAt) {
    const age = Date.now() - cached.fetchedAt;
    if (age < CPA_CACHE_TTL_MS) {
      console.log(`CPA cache hit (${Math.round(age / 1000)}s old, ${cached.records.length} records)`);
      return cached.records;
    }
    console.log(`CPA cache stale (${Math.round(age / 1000)}s old), refreshing`);
  } else {
    console.log('CPA cache miss, fetching from Airtable');
  }

  // Fetch fresh from Airtable
  const baseId = 'appJq70k9nl9MK2zk';
  const tableId = 'tbl31rWYAh5hb02Tx';
  const fields = [
    'Card Name', 'Issuer', 'Net CPA 60%', 'Date', 'Date Change of Current Net CPA',
  ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  const sort = 'sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=desc';

  const records = await fetchAllAirtableRecords(airtableToken, baseId, tableId, `${fields}&${sort}`);
  await kv.set(CPA_CACHE_KEY, { records, fetchedAt: Date.now() });
  console.log(`CPA cache updated (${records.length} records)`);
  await updateCpaRateLog(records);
  return records;
}

// ── CPA rate history log ─────────────────────────────────────────────────────
// The Airtable CPA Changes table keeps ONE row per card holding only the
// current rate (the nightly QuinStreet sync updates rows in place), so the
// server accumulates its own per-card rate history in KV: every fresh Airtable
// fetch appends an entry when a card's rate differs from the last logged one.
// This history is what lets an approval keep the rate that was in effect when
// it happened — a rate change only re-prices approvals from its effective date
// forward, never retroactively.
const CPA_RATE_LOG_KEY = 'cpa_rate_log';

type RateEntry = { date: string; bankCpa: number };

// Effective date of a rate row: "Date Change of Current Net CPA" (an ISO
// datetime in practice) → YYYY-MM-DD, falling back to Date / createdTime.
function cpaRowEffectiveDate(rec: any): string {
  const f = rec.cellValuesByFieldId || rec.fields || {};
  const raw = f['fldW5olh5ASAJ39uD'] ?? f['Date Change of Current Net CPA']
           ?? f['fldfL3uObDr0uotjI'] ?? f['Date'] ?? rec.createdTime ?? '';
  return String(raw).split('T')[0];
}

// Current rate per normalised card name — first record with a real rate wins,
// mirroring the most-recent-first dedupe the payout/rate endpoints use.
function currentCpaByCard(records: any[]): Map<string, RateEntry> {
  const out = new Map<string, RateEntry>();
  for (const rec of records) {
    const f = rec.cellValuesByFieldId || rec.fields || {};
    const cardName = f['fldN6ug8vDACn4yO1'] ?? f['Card Name'] ?? '';
    if (!cardName) continue;
    const key = normCardName(cardName);
    if (out.has(key)) continue;
    const bankCpa = parseFloat(String(f['fldr71bjB28kEAsbp'] ?? f['Net CPA 60%'] ?? '0').replace(/[^0-9.]/g, '')) || 0;
    if (bankCpa <= 0) continue;
    out.set(key, { date: cpaRowEffectiveDate(rec), bankCpa });
  }
  return out;
}

// Merge the persisted log with the current-rates snapshot. Entries are kept
// ascending by date; a card's entry is appended only when its rate actually
// changed. Pure — reads use it to serve history even before the log's first
// write, and updateCpaRateLog persists the same merge.
function mergeRateLog(log: Record<string, RateEntry[]>, records: any[]): { merged: Record<string, RateEntry[]>; changed: boolean } {
  const merged: Record<string, RateEntry[]> = { ...log };
  let changed = false;
  const today = new Date().toISOString().split('T')[0];
  for (const [key, cur] of currentCpaByCard(records)) {
    const entries = merged[key] || [];
    const last = entries[entries.length - 1];
    if (!last || last.bankCpa !== cur.bankCpa) {
      // Use the reported effective date when it keeps the log ordered;
      // otherwise stamp today (guards against a backdated change date).
      const date = (cur.date && (!last || cur.date > last.date)) ? cur.date : today;
      merged[key] = [...entries, { date, bankCpa: cur.bankCpa }];
      changed = true;
    }
  }
  return { merged, changed };
}

async function updateCpaRateLog(records: any[]): Promise<void> {
  try {
    const log = (await kv.get(CPA_RATE_LOG_KEY)) || {};
    const { merged, changed } = mergeRateLog(log, records);
    if (changed) {
      await kv.set(CPA_RATE_LOG_KEY, merged);
      console.log('CPA rate log updated');
    }
  } catch (e: any) {
    console.log('CPA rate log update failed (non-fatal):', e.message);
  }
}

// Per-card rate history for API responses, newest first.
async function getCpaHistories(records: any[]): Promise<Record<string, RateEntry[]>> {
  let log: Record<string, RateEntry[]> = {};
  try { log = (await kv.get(CPA_RATE_LOG_KEY)) || {}; } catch (_) { /* serve snapshot-only */ }
  const { merged } = mergeRateLog(log, records);
  const out: Record<string, RateEntry[]> = {};
  for (const [k, v] of Object.entries(merged)) out[k] = v.slice().reverse();
  return out;
}

// Get payouts — current CPA rates from Airtable CPA Changes table,
// adjusted to the affiliate's individual commission rate.
app.get("/make-server-8dc4138c/payouts", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get the affiliate's commission rate (default 50 if not set)
    const userData = await kv.get(`user:${user.id}`) || {};
    const commissionRate = Number(userData.commissionRate) || 50;

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    let records: any[];
    try {
      records = await getCachedCpaRecords(airtableToken);
    } catch (airtableErr: any) {
      console.log('Airtable CPA Changes fetch error:', airtableErr.message);
      return c.json({ payouts: [], error: airtableErr.message });
    }

    // Load CardRatingAPI enrichment index (non-fatal if unavailable)
    let cardRatingIndex: Record<string, any> = {};
    try {
      cardRatingIndex = await getCachedCardRatingIndex(airtableToken);
    } catch (e: any) {
      console.log('CardRating enrich skipped (non-fatal):', e.message);
    }

    // Per-card rate history (newest first) so the client can price each
    // approval at the rate in effect on its date — not today's rate.
    const rateHistories = await getCpaHistories(records);

    // Deduplicate — keep the most recent record per card name (data is sorted desc by date)
    const seen = new Set<string>();
    const payouts = [];

    for (let i = 0; i < records.length; i++) {
      const f = records[i].cellValuesByFieldId || records[i].fields || {};

      // Support both fieldId-keyed and field-name-keyed responses
      const cardName  = f['fldN6ug8vDACn4yO1'] ?? f['Card Name'] ?? '';
      const issuer    = f['fldXsTKc4Op37yXWu'] ?? f['Issuer'] ?? '';
      const netCpa60  = f['fldr71bjB28kEAsbp'] ?? f['Net CPA 60%'] ?? '0';
      const date      = f['fldfL3uObDr0uotjI'] ?? f['Date'] ?? '';
      const rateDate  = f['fldW5olh5ASAJ39uD'] ?? f['Date Change of Current Net CPA'] ?? '';

      if (!cardName || seen.has(cardName)) continue;
      seen.add(cardName);

      // Calculate affiliate's amount: bank payout × (affiliate's commission rate / 100)
      // "Net CPA 60%" is just the field name — it represents the full amount received from the bank.
      const bankCpa = parseFloat(String(netCpa60).replace(/[^0-9.]/g, '')) || 0;
      const affiliateAmount = bankCpa > 0
        ? Math.round((bankCpa * commissionRate / 100) * 100) / 100
        : 0;

      const enrichment = lookupCardRating(cardRatingIndex, cardName);

      // Rate history at the affiliate's cut (newest first) — used for
      // effective-dated earnings and the payout-history display.
      const history = (rateHistories[normCardName(cardName)] || []).map(h => ({
        date: h.date,
        amount: Math.round((h.bankCpa * commissionRate / 100) * 100) / 100,
      }));

      payouts.push({
        id: i + 1,
        card: cardName,
        issuer,
        amount: affiliateAmount,
        history,
        date: date || rateDate || records[i].createdTime?.split('T')[0] || '',
        status: 'current',
        cardId:   enrichment?.cardId   ?? '',
        cardType: enrichment?.cardType ?? '',
        cardUse:  enrichment?.cardUse  ?? '',
        imageUrl: enrichment?.imageUrl ?? '',
        annualFee:        enrichment?.annualFee        ?? '',
        introBonus:       enrichment?.introBonus       ?? '',
        introAprRate:     enrichment?.introAprRate     ?? '',
        introAprDuration: enrichment?.introAprDuration ?? '',
        bonusMilesFull:   enrichment?.bonusMilesFull   ?? '',
      });
    }

    return c.json({ payouts });
  } catch (error) {
    console.log(`Get payouts error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ── Affiliate Invoices ────────────────────────────────────────────────────────

const INVOICES_BASE  = 'apphsOm1RQvOeiAEl';
const INVOICES_TABLE = 'tblMKN6vPd8750asu';

/** Extract the first value from an Airtable lookup/linked-record field. */
function getLookupValue(fieldValue: any): string {
  if (!fieldValue) return '';
  if (typeof fieldValue === 'string') return fieldValue;
  if (fieldValue.valuesByLinkedRecordId) {
    const vals = Object.values(fieldValue.valuesByLinkedRecordId) as any[][];
    return vals[0]?.[0] != null ? String(vals[0][0]) : '';
  }
  return String(fieldValue);
}

/** Normalise a raw Airtable Affiliate Invoices record into a clean shape. */
function parseInvoice(record: any) {
  const f = record.cellValuesByFieldId || record.fields || {};
  return {
    id:            record.id,
    name:          f['fldpph5qUumSAsmXi'] || '',
    month:         f['fldGRagNyYA6vALjQ']?.name  || f['fldGRagNyYA6vALjQ']  || '',
    date:          f['fldrH2uVerdMI1uzE'] || '',
    amount:        typeof f['fldveSxf590VvfmqQ'] === 'number' ? f['fldveSxf590VvfmqQ'] : 0,
    approvals:     typeof f['fldDrYvhw37hQUB9P'] === 'number' ? f['fldDrYvhw37hQUB9P'] : 0,
    totalEarnings: typeof f['fldWlaNrlSKYBjcc9']  === 'number' ? f['fldWlaNrlSKYBjcc9']  : 0,
    status:        f['fldeTOEK0bjT2Ma4y']?.name  || f['fldeTOEK0bjT2Ma4y']  || '',
    sent:          !!f['fldehPk4tasjkWuzp'],
    sentZelle:     !!f['fldkQqKK5bjGlgWUL'],
    email:         getLookupValue(f['fldr887GwDk8Q4oih']),
    zelle:         getLookupValue(f['fldh7HculBfNbYHSp']),
    notes:         typeof f['fldddHfcW4Q11w6FO'] === 'string' ? f['fldddHfcW4Q11w6FO'] : '',
  };
}

/** Fetch all records from the Affiliate Invoices Airtable table. */
async function fetchAllInvoices(airtableToken: string): Promise<any[]> {
  // Request specific fields by ID. returnFieldsByFieldId=true makes Airtable
  // key the response record.fields by field ID instead of field name, which
  // is required for parseInvoice to find values by ID.
  const fields = [
    'fldpph5qUumSAsmXi','fldGRagNyYA6vALjQ','fldrH2uVerdMI1uzE',
    'fldveSxf590VvfmqQ','fldDrYvhw37hQUB9P','fldWlaNrlSKYBjcc9',
    'fldeTOEK0bjT2Ma4y','fldehPk4tasjkWuzp','fldkQqKK5bjGlgWUL',
    'fldr887GwDk8Q4oih','fldh7HculBfNbYHSp','fldddHfcW4Q11w6FO',
  ].map(id => `fields[]=${id}`).join('&');
  const sort = 'sort%5B0%5D%5Bfield%5D=fldrH2uVerdMI1uzE&sort%5B0%5D%5Bdirection%5D=desc';
  return fetchAllAirtableRecords(airtableToken, INVOICES_BASE, INVOICES_TABLE, `${fields}&${sort}&returnFieldsByFieldId=true`);
}

// ── Dashboard snapshot cache ─────────────────────────────────────────────────
// The affiliate-facing datasets (tracking, invoices, card list) are stored in KV
// so ordinary page-loads serve from the snapshot instead of hitting Airtable
// every time. The snapshot refreshes only when a manager runs a sync / "Refresh
// data" (or after the long TTL as a cold-start safety net). Each write stamps
// `cache:synced_at`, which the dashboard surfaces as "Last updated".
const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — effectively manual-refresh
const SYNCED_AT_KEY = 'cache:synced_at';
const SNAPSHOT_KEYS = ['snap:tracking', 'snap:invoices', 'snap:cards'];

async function readSnapshot(key: string): Promise<any[] | null> {
  const cached = await kv.get(`snap:${key}`);
  if (cached && Array.isArray(cached.records) && cached.fetchedAt &&
      Date.now() - cached.fetchedAt < SNAPSHOT_TTL_MS) {
    return cached.records;
  }
  return null;
}

async function writeSnapshot(key: string, records: any[]): Promise<void> {
  const now = Date.now();
  await kv.set(`snap:${key}`, { records, fetchedAt: now });
  await kv.set(SYNCED_AT_KEY, now);
}

// Invalidate every dashboard snapshot (plus the CPA-rate and Card-Rating
// enrichment caches) and stamp the refresh time. Reads then lazily repopulate
// from Airtable on next access — so card enrichment fields refresh too.
async function flushSnapshots(): Promise<void> {
  await Promise.all([
    ...SNAPSHOT_KEYS.map(k => kv.del(k)),
    kv.del(CPA_CACHE_KEY),
    kv.del(CARD_RATING_CACHE_KEY),
  ]);
  await kv.set(SYNCED_AT_KEY, Date.now());
}

// Tracking — sourced from the site's OWN database (quinstreet_records). The
// QuinStreet importer writes here directly; the historical Airtable API Output
// rows were backfilled in. Records are shaped to match the previous Airtable
// `{ id, fields }` form so every downstream consumer — the affiliate /tracking
// feed, the affiliate KPIs, and the manager activity table — works unchanged.
// Airtable is no longer in this read path. `token` is unused (kept for callers).
async function getCachedTracking(_token: string, force = false): Promise<any[]> {
  if (!force) { const hit = await readSnapshot('tracking'); if (hit) return hit; }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );

  // Page through every row (a single Supabase select caps at 1000).
  const rows: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('quinstreet_records')
      .select('*')
      .order('process_date', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`quinstreet_records read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // Member-name lookup (affiliate code → name). QuinStreet-native rows lack
  // Airtable's "Member Name (from AffiliateID)" lookup field, so resolve the
  // member from the affiliate the Var2/ezrxref maps to, via affiliate_map.
  const memberByAff: Record<string, string> = {};
  try {
    const { data: amap } = await supabase.from('affiliate_map').select('affiliate_id, member_name');
    for (const m of (amap || [])) {
      const aid = (m.affiliate_id || '').toString().trim().toLowerCase();
      if (aid && m.member_name) memberByAff[aid] = m.member_name;
    }
  } catch (_) { /* non-fatal — falls back to Unknown */ }

  const num = (v: any) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

  // Build Airtable-API-Output-shaped records from the canonical columns. Status
  // and Member Name were Airtable-only fields absent from raw QuinStreet rows,
  // so derive them: Status from the click/application/approval counts, and
  // Member from the affiliate the Var2/ezrxref resolved to.
  const records = rows.map((r: any) => {
    const f = r.fields || {};
    const apr = num(r.approvals), app = num(r.applications), clk = num(r.clicks);
    const derivedStatus = apr > 0 ? 'approval' : app > 0 ? 'application' : clk > 0 ? 'click' : '';
    const aid = (r.affiliate_id || '').toString().trim().toLowerCase();
    return {
      id: `${r.click_id || ''}|${r.click_key || ''}`,
      fields: {
        ...f,
        'affiliate-id':   r.affiliate_id,
        'Card Name':      r.card_name,
        'Advertiser':     r.advertiser,
        'Item Name':      r.item_name,
        'Clicks':         r.clicks,
        'Applications':   r.applications,
        'Approvals':      r.approvals,
        'Conversion ID':  r.conversion_id,
        'Total Earnings': r.total_earnings,
        'Click Date':     r.click_date,
        'Process Date':   r.process_date,
        'Status':         f['Status'] || derivedStatus,
        // Resolve the member: Airtable lookup → affiliate_map by code → if the
        // Var2/ezrxref never mapped to an affiliate, surface the raw ezrxref so
        // it's visible (and mappable) instead of a bare "Unknown".
        'Member Name (from AffiliateID)':
          f['Member Name (from AffiliateID)'] || memberByAff[aid] ||
          (r.fields?.['Var2 Raw'] ? `${r.fields['Var2 Raw']} (unmapped)` : ''),
      },
    };
  });

  await writeSnapshot('tracking', records);
  return records;
}

// Affiliate invoices.
async function getCachedInvoiceRecords(token: string, force = false): Promise<any[]> {
  if (!force) { const hit = await readSnapshot('invoices'); if (hit) return hit; }
  const records = await fetchAllInvoices(token);
  await writeSnapshot('invoices', records);
  return records;
}

// Card list for the Cards tab (CPA Changes table, with slug for link building).
async function getCachedCardList(token: string, force = false): Promise<any[]> {
  if (!force) { const hit = await readSnapshot('cards'); if (hit) return hit; }
  const params = [
    'fields[]=Card+Name', 'fields[]=Issuer', 'fields[]=Net+CPA+60%25', 'fields[]=slug',
    'sort[0][field]=Card+Name', 'sort[0][direction]=asc',
  ].join('&');
  const records = await fetchAllAirtableRecords(token, 'appJq70k9nl9MK2zk', 'tbl31rWYAh5hb02Tx', params);
  await writeSnapshot('cards', records);
  return records;
}

// Force-refresh every dashboard snapshot (used by the "Refresh data" action).
async function refreshAllSnapshots(token: string): Promise<{ tracking: number; invoices: number; cards: number; syncedAt: number }> {
  // Also clear the enrichment caches (CPA rates + Card Rating) so a manager
  // "Refresh data" actually refreshes card IDs / payouts / card metadata — not
  // just the tracking/invoice/card snapshots. Without this, a stale 30-day Card
  // Rating cache left cards without their cardId even after syncing.
  await Promise.all([kv.del(CPA_CACHE_KEY), kv.del(CARD_RATING_CACHE_KEY)]);
  const [tracking, invoices, cards] = await Promise.all([
    getCachedTracking(token, true),
    getCachedInvoiceRecords(token, true),
    getCachedCardList(token, true),
  ]);
  const syncedAt = await kv.get(SYNCED_AT_KEY);
  return { tracking: tracking.length, invoices: invoices.length, cards: cards.length, syncedAt };
}

// GET /invoices — affiliate's own invoices
app.get("/make-server-8dc4138c/invoices", async (c) => {
  try {
    const accessToken       = c.req.header('Authorization')?.split(' ')[1];
    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error }   = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const userData: any = await kv.get(`user:${user.id}`) || {};
    const userEmail = (userData.email || '').toLowerCase().trim();

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    if (!airtableToken) return c.json({ invoices: [], error: 'Airtable not configured' });

    const records  = await getCachedInvoiceRecords(airtableToken);
    const invoices = records
      .map(parseInvoice)
      .filter(inv => inv.email.toLowerCase().trim() === userEmail);

    return c.json({ invoices });
  } catch (err: any) {
    console.log('GET /invoices error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// GET /manager/invoices — all invoices (manager only)
app.get("/make-server-8dc4138c/manager/invoices", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    if (!sessionToken) return c.json({ error: 'Unauthorized' }, 401);
    const session: any = await kv.get(`manager_session:${sessionToken}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    if (!airtableToken) return c.json({ invoices: [], error: 'Airtable not configured' });

    const records  = await getCachedInvoiceRecords(airtableToken);
    const invoices = records.map(parseInvoice);

    return c.json({ invoices, total: invoices.length });
  } catch (err: any) {
    console.log('GET /manager/invoices error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// PUT /manager/invoices/:id — update an invoice (manager only)
app.put("/make-server-8dc4138c/manager/invoices/:id", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    if (!sessionToken) return c.json({ error: 'Unauthorized' }, 401);
    const session: any = await kv.get(`manager_session:${sessionToken}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const recordId = c.req.param('id');
    const body: any = await c.req.json();

    // Build Airtable fields update — only include fields that were sent
    const fields: Record<string, any> = {};
    if (body.status    !== undefined) fields['fldeTOEK0bjT2Ma4y'] = body.status || null;
    if (body.sent      !== undefined) fields['fldehPk4tasjkWuzp'] = !!body.sent;
    if (body.sentZelle !== undefined) fields['fldkQqKK5bjGlgWUL'] = !!body.sentZelle;
    if (body.notes     !== undefined) fields['fldddHfcW4Q11w6FO'] = body.notes;

    if (Object.keys(fields).length === 0) {
      return c.json({ error: 'No updatable fields provided' }, 400);
    }

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    const url = `https://api.airtable.com/v0/${INVOICES_BASE}/${INVOICES_TABLE}/${recordId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log('Airtable invoice update error:', res.status, err);
      return c.json({ error: `Airtable error: ${res.status}` }, 500);
    }

    const updated = await res.json();
    return c.json({ success: true, invoice: parseInvoice(updated) });
  } catch (err: any) {
    console.log('PUT /manager/invoices/:id error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// Get user info
app.get("/make-server-8dc4138c/user", async (c) => {
  try {
    // Check for impersonation token first (custom header to bypass Supabase JWT validation)
    const impersonationToken = c.req.header('X-Impersonation-Token');
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    console.log(`Get user: impersonation token present: ${!!impersonationToken}`);
    console.log(`Get user: access token type: ${(impersonationToken || accessToken)?.startsWith('imp_') ? 'impersonation' : 'regular'}`);

    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      console.log(`Get user: unauthorized - ${error || 'no user ID'}`);
      return c.json({ error: error || 'Unauthorized' }, 401);
    }

    console.log(`Get user: fetching data for user ID ${user.id}`);
    const userData = await kv.get(`user:${user.id}`);
    console.log(`Get user: userData found:`, !!userData, 'with fields:', Object.keys(userData || {}));

    if (!userData) {
      console.log(`Get user: no user data found for ${user.id}`);
      return c.json({ error: 'User data not found' }, 404);
    }

    return c.json({ user: userData });
  } catch (error) {
    console.log(`Get user error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Update user profile
app.put("/make-server-8dc4138c/user", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { email, name, phone, address, city, state, zip, country, currentPassword } = await c.req.json();

    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const isImpersonation = (impersonationToken || accessToken || '').startsWith('imp_');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Require the current password to save any profile change.
    // Skipped for manager impersonation sessions, which don't have the affiliate's password.
    if (!isImpersonation) {
      if (!currentPassword) {
        return c.json({ error: 'Current password is required to save changes' }, 400);
      }

      if (!user.email) {
        return c.json({ error: 'Unable to verify password for this account' }, 400);
      }

      const { error: pwError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (pwError) {
        return c.json({ error: 'Current password is incorrect' }, 401);
      }
    }

    if (email && email !== user.email) {
      const { error: emailError } = await supabase.auth.admin.updateUserById(
        user.id,
        { email }
      );

      if (emailError) {
        console.log(`Email update error: ${emailError.message}`);
        return c.json({ error: `Failed to update email: ${emailError.message}` }, 400);
      }
    }

    const userData = await kv.get(`user:${user.id}`);
    const updatedUser = {
      ...userData,
      email: email || userData.email,
      name,
      phone,
      address,
      city,
      state,
      zip,
      country,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`user:${user.id}`, updatedUser);

    // Sync updated profile to Airtable
    await syncToAirtable(updatedUser.airtableRecordId, updatedUser, user.id);

    return c.json({ success: true, user: updatedUser });
  } catch (error) {
    console.log(`Update user error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Get all available credit cards
app.get("/make-server-8dc4138c/cards", async (c) => {
  try {
    const cards = await fetchCards();
    return c.json({ cards });
  } catch (error) {
    console.log(`Get cards error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Sync affiliates from Airtable
app.post("/make-server-8dc4138c/manager/sync-airtable", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('Starting Airtable sync...');

    // Airtable credentials
    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'Affiliates';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    if (!airtableToken) {
      return c.json({ error: 'Airtable API key not configured' }, 500);
    }

    // Fetch ALL records from Airtable with pagination (100 per page)
    const records: any[] = [];
    let offset: string | null = null;
    do {
      const pageUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
      const airtableResponse = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' }
      });
      if (!airtableResponse.ok) {
        const errorText = await airtableResponse.text();
        console.log('Airtable API error:', errorText);
        return c.json({ error: `Airtable API error: ${airtableResponse.status}` }, 500);
      }
      const page = await airtableResponse.json();
      records.push(...(page.records || []));
      offset = page.offset ?? null;
    } while (offset);
    console.log(`Fetched ${records.length} records from Airtable`);

    if (records.length > 0) {
      console.log('Sample record fields:', Object.keys(records[0].fields || {}));
      console.log('First record data:', JSON.stringify(records[0].fields, null, 2));
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const record of records) {
      const fields = record.fields;

      console.log(`Processing record - Email: ${fields.Email}, Activity: ${fields.Activity}`);

      // Skip if Activity not checked or missing email
      if (!fields.Email || !fields.Activity) {
        console.log(`Skipping record - Email: ${fields.Email}, Activity: ${fields.Activity}`);
        skipped++;
        continue;
      }

      const email = fields.Email;
      const firstName = fields['First Name'] || '';
      const lastName = fields['Last Name'] || '';
      const name = `${firstName} ${lastName}`.trim();
      const affiliateId = fields['Affiliate-ID'] || '';
      const commissionRate = parseInt(fields['Aff Cut']) || 50;
      const phone = fields.Phone || fields.Zelle || '';
      // ezrxref- is the only per-affiliate variable in the master link URL
      const ezrxRef = (fields['ezrxref-'] || '').trim();
      const memberJoinDate = fields['Member Join Date'] || null;

      try {
        // Check if user exists. Supabase Auth normalizes emails to lowercase,
        // but Airtable's Email field may preserve the original casing, so
        // compare case-insensitively to avoid creating duplicate accounts.
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (existingUser) {
          // Update existing user
          const userData = await kv.get(`user:${existingUser.id}`) || {};
          await kv.set(`user:${existingUser.id}`, {
            ...userData,
            name,
            phone,
            commissionRate,
            affiliateId: affiliateId || userData.affiliateId,
            email,
            airtableRecordId: record.id, // Store Airtable record ID for bidirectional sync
            ...(ezrxRef && { ezrxRef }),
            ...(memberJoinDate && { joinedDate: memberJoinDate }),
          });
          updated++;
          console.log(`Updated user: ${email}`);
        } else {
          // Create new user with random password
          const tempPassword = `Temp${Math.random().toString(36).substring(2, 10)}!`;

          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            user_metadata: { name },
            email_confirm: true
          });

          if (createError) {
            errors.push(`${email}: ${createError.message}`);
            continue;
          }

          // Initialize user data
          const newAffiliateId = affiliateId || `ai-${Math.random().toString(36).substring(2, 7)}`;
          await kv.set(`user:${newUser.user.id}`, {
            email,
            name,
            phone,
            affiliateId: newAffiliateId,
            commissionRate,
            createdAt: new Date().toISOString(),
            airtableRecordId: record.id, // Store Airtable record ID for bidirectional sync
            ...(ezrxRef && { ezrxRef }),
            ...(memberJoinDate && { joinedDate: memberJoinDate }),
          });

          // Initialize tracking links
          const cards = await fetchCards();
          const cardsArray = Array.isArray(cards) ? cards : [];
          const trackingLinks = cardsArray.slice(0, 10).map((item, index) => {
            const card = item.card;
            const url = buildAffiliateUrl(card.link, newAffiliateId, card.name);
            return {
              id: index + 1,
              name: card.name,
              bank: card.bank,
              url,
              clicks: 0,
              conversions: 0,
              commission: 150,
              annualFee: card.annualFee,
              creditLevel: card.creditLevel
            };
          });

          await kv.set(`links:${newUser.user.id}`, trackingLinks);
          await kv.set(`activity:${newUser.user.id}`, []);
          await kv.set(`payouts:${newUser.user.id}`, []);

          created++;
          console.log(`Created user: ${email} (temp password: ${tempPassword})`);
        }
      } catch (userError) {
        errors.push(`${email}: ${userError.message}`);
        console.log(`Error processing ${email}:`, userError.message);
      }
    }

    console.log(`Sync complete: ${created} created, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return c.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
      total: records.length
    });
  } catch (error) {
    console.log(`Airtable sync error: ${error.message}`);
    console.log('Error stack:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Sync tracking data from Airtable API Output
app.post("/make-server-8dc4138c/manager/sync-tracking", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('Starting tracking data sync from site DB (quinstreet_records)...');

    // Read tracking from the site's own database (force-refresh the snapshot).
    const records = await getCachedTracking('', true);
    console.log(`Loaded ${records.length} tracking records from site DB`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Get all users
    const { data: existingUsers } = await supabase.auth.admin.listUsers();

    // A click's Var2 (the API Output `affiliate-id`) may identify the affiliate
    // by EITHER their code (Affiliate-ID, e.g. "ai-p2Ce") OR their ezrxref- link
    // value (e.g. "ezrxref-14"). Build a map from both identifiers to the user.
    const norm = (v) => (v || '').toString().trim().toLowerCase();
    const ezrxKey = (v) => {
      const t = norm(v);
      if (!t) return '';
      return t.startsWith('ezrxref-') ? t : `ezrxref-${t}`;
    };
    const idToUser = {};
    for (const user of (existingUsers?.users || [])) {
      const userData = await kv.get(`user:${user.id}`);
      if (userData?.affiliateId) idToUser[norm(userData.affiliateId)] = user.id;
      const ez = ezrxKey(userData?.ezrxRef);
      if (ez) idToUser[ez] = user.id;
    }

    // Aggregate stats per user. A user may receive clicks under more than one
    // identifier (code links and ezrxref- links), so merge by userId.
    const statsByUser = {};
    for (const record of records) {
      const fields = record.fields;
      const var2 = norm(fields['affiliate-id']);
      if (!var2) continue;
      const userId = idToUser[var2];
      if (!userId) continue;

      const cardName = fields['Card Name'];
      const earnings = parseFloat(fields['Total Earnings']) || 0;
      const clicks = parseInt(fields['Clicks']) || 0;
      const applications = parseInt(fields['Applications']) || 0;
      const approvals = parseInt(fields['Approvals']) || 0;

      if (!statsByUser[userId]) {
        statsByUser[userId] = { totalClicks: 0, totalConversions: 0, totalCommissions: 0, cardStats: {} };
      }
      const s = statsByUser[userId];
      s.totalClicks += clicks;
      s.totalConversions += (applications + approvals);
      s.totalCommissions += earnings;

      if (cardName) {
        if (!s.cardStats[cardName]) {
          s.cardStats[cardName] = { clicks: 0, conversions: 0, commissions: 0 };
        }
        s.cardStats[cardName].clicks += clicks;
        s.cardStats[cardName].conversions += (applications + approvals);
        s.cardStats[cardName].commissions += earnings;
      }
    }

    console.log('Aggregated stats for', Object.keys(statsByUser).length, 'users');

    // Write merged stats to each matched user.
    let updated = 0;
    for (const [userId, stats] of Object.entries(statsByUser)) {
      const userData = await kv.get(`user:${userId}`) || {};
      userData.stats = stats;
      await kv.set(`user:${userId}`, userData);
      updated++;
    }

    // Refresh what affiliates see: invalidate dashboard snapshots + stamp the
    // sync time so "Last updated" reflects this sync.
    await flushSnapshots();

    return c.json({
      success: true,
      recordsProcessed: records.length,
      affiliatesUpdated: updated,
      message: `Synced ${records.length} tracking records, updated ${updated} affiliates`
    });
  } catch (error) {
    console.log(`Tracking sync error: ${error.message}`);
    console.log('Error stack:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// ── QuinStreet manager proxy ─────────────────────────────────────────────────
// The QuinStreet pull/store/mirror pipeline lives in the standalone
// `quinstreet-sync` edge function (pulls the QMP report → upserts the site's
// quinstreet_records table → upserts Airtable API Output, merging on Click ID +
// Click Key so duplicates can't happen). It runs nightly via pg_cron. This route
// lets the Manager UI trigger it on demand for a specific timeframe — or run the
// duplicate cleanup — WITHOUT exposing the trigger secret to the browser: the
// secret is read server-side from the get_quinstreet_config RPC and forwarded as
// the x-trigger-secret header.
app.post("/make-server-8dc4138c/manager/quinstreet", async (c) => {
  try {
    const session = await kv.get(`manager_session:${c.req.header('X-Manager-Session')}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const action = body?.action === 'dedupe' ? 'dedupe' : 'sync';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Pull the trigger secret from the same Vault-backed config the function uses.
    const { data: cfg, error: cfgErr } = await supabase.rpc('get_quinstreet_config');
    if (cfgErr || !cfg?.quinstreet_trigger_secret) {
      return c.json({ error: `QuinStreet config unavailable: ${cfgErr?.message || 'no trigger secret'}` }, 500);
    }

    // Build the quinstreet-sync call.
    const fnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/quinstreet-sync`;
    const params = new URLSearchParams({ action });
    if (action === 'sync') {
      params.set('source', 'site');
      if (body?.startDate) params.set('startDate', body.startDate);
      if (body?.endDate) params.set('endDate', body.endDate);
    } else if (body?.maxDeletes) {
      params.set('maxDeletes', String(body.maxDeletes));
    }

    const res = await fetch(`${fnBase}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'x-trigger-secret': cfg.quinstreet_trigger_secret,
        'Content-Type': 'application/json',
        // verify_jwt is disabled on quinstreet-sync; pass a key so the gateway
        // always lets the request through.
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return c.json({ error: data?.error || `quinstreet-sync ${res.status}` }, 502);
    }
    return c.json({ success: true, action, ...data });
  } catch (error) {
    console.log(`QuinStreet proxy error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Refresh all dashboard data — force-repopulate every snapshot from
// Airtable and stamp the sync time. Backs the "Refresh data" button.
app.post("/make-server-8dc4138c/manager/refresh-data", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    if (!airtableToken) return c.json({ error: 'Airtable API key not configured' }, 500);

    const result = await refreshAllSnapshots(airtableToken);
    console.log(`Refresh data: tracking=${result.tracking} invoices=${result.invoices} cards=${result.cards}`);
    return c.json({ success: true, ...result });
  } catch (error) {
    console.log(`Refresh data error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Get all tracking activity
app.get("/make-server-8dc4138c/manager/tracking-activity", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('Fetching all tracking activity from Airtable...');

    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'API Output';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    if (!airtableToken) {
      return c.json({ error: 'Airtable API key not configured' }, 500);
    }

    // Fetch ALL records from the full table (no view filter) so nothing is excluded
    console.log('Fetching all records from API Output table (no view filter)');

    // force=1 rebuilds from the site DB and re-stamps "Last updated" (used by
    // the Activity Refresh button); otherwise serve the cached snapshot.
    const force = c.req.query('force') === '1';
    let records: any[];
    try {
      records = await getCachedTracking(airtableToken, force);
    } catch (err: any) {
      console.log('Airtable fetch error:', err.message);
      return c.json({ error: `Airtable API error: ${err.message}` }, 500);
    }

    console.log('Total records fetched:', records.length);

    // Format activity records
    const activity = records.map(record => ({
      id: record.id,
      affiliateId: record.fields['affiliate-id'] || 'N/A',
      memberName: record.fields['Member Name (from AffiliateID)'] || 'Unknown',
      cardName: record.fields['Card Name'] || 'Unknown',
      status: record.fields['Status'] || 'N/A',
      totalEarnings: parseFloat(record.fields['Total Earnings']) || 0,
      clickDate: record.fields['Click Date'] || '',
      clickTime: record.fields['Click Time'] || '',
      processDate: record.fields['Process Date'] || record.fields['Click Date'] || '',
      clicks: parseInt(record.fields['Clicks']) || 0,
      applications: parseInt(record.fields['Applications']) || 0,
      approvals: parseInt(record.fields['Approvals']) || 0,
      deviceType: record.fields['Device Type'] || '',
      state: record.fields['State'] || '',
      stateCode: record.fields['State Code'] || '',
      country: record.fields['Country Code'] || ''
    }));

    // Aggregate per-affiliate stats and write to KV so the Affiliates tab
    // shows correct Earned / Clicks / Conversions without a separate sync.
    try {
      const norm = (v: any) => (v || '').toString().trim().toLowerCase();
      const ezrxKey = (v: any) => {
        const t = norm(v);
        if (!t) return '';
        return t.startsWith('ezrxref-') ? t : `ezrxref-${t}`;
      };

      // Build identifier → userId map. A click's Var2 may be the affiliate's
      // code (Affiliate-ID) OR their ezrxref- link value — map both.
      const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
      const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const idToUser: Record<string, string> = {};
      const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey }
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        for (const user of (usersData.users || [])) {
          const userData = await kv.get(`user:${user.id}`);
          if (userData?.affiliateId) idToUser[norm(userData.affiliateId)] = user.id;
          const ez = ezrxKey(userData?.ezrxRef);
          if (ez) idToUser[ez] = user.id;
        }
      }

      // Aggregate stats per user (a user may have clicks under both their code
      // and their ezrxref- value, so merge by userId).
      const statsByUser: Record<string, { totalClicks: number; totalConversions: number; totalCommissions: number }> = {};
      for (const row of activity) {
        const var2 = norm(row.affiliateId);
        if (!var2 || var2 === 'n/a') continue;
        const userId = idToUser[var2];
        if (!userId) continue;
        if (!statsByUser[userId]) {
          statsByUser[userId] = { totalClicks: 0, totalConversions: 0, totalCommissions: 0 };
        }
        statsByUser[userId].totalClicks      += row.clicks;
        statsByUser[userId].totalConversions += (row.applications + row.approvals);
        statsByUser[userId].totalCommissions += row.totalEarnings;
      }

      // Write merged stats to each matched user. Only bump `statsUpdatedAt`
      // (and re-write) when the numbers actually changed, so "Last updated"
      // reflects a real data change rather than every sync run.
      let changedCount = 0;
      for (const [userId, stats] of Object.entries(statsByUser)) {
        const userData = await kv.get(`user:${userId}`) || {};
        const prev = userData.stats;
        const unchanged = prev
          && prev.totalClicks === stats.totalClicks
          && prev.totalConversions === stats.totalConversions
          && prev.totalCommissions === stats.totalCommissions;
        if (unchanged) continue;
        userData.stats = stats;
        userData.statsUpdatedAt = new Date().toISOString();
        await kv.set(`user:${userId}`, userData);
        changedCount++;
      }
      console.log(`KV stats updated for ${changedCount} of ${Object.keys(statsByUser).length} users (unchanged skipped)`);
    } catch (kvErr: any) {
      // Non-fatal — stats update is best-effort
      console.log('KV stats update error (non-fatal):', kvErr.message);
    }

    return c.json({
      success: true,
      activity,
      total: activity.length,
      syncedAt: await kv.get(SYNCED_AT_KEY)
    });
  } catch (error) {
    console.log(`Fetch tracking activity error: ${error.message}`);
    console.log('Error stack:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Get user debug info
app.get("/make-server-8dc4138c/manager/user/:userId/debug", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const userId = c.req.param('userId');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Get user auth data
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get user KV data
    const userData = await kv.get(`user:${userId}`) || {};
    const links = await kv.get(`links:${userId}`) || [];
    const activity = await kv.get(`activity:${userId}`) || [];

    // Check Airtable for this affiliate ID
    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'API Output';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    let airtableRecords = [];

    if (airtableToken && userData.affiliateId) {
      // `affiliate-id` is an Airtable lookup field and can't be matched with
      // filterByFormula, so fetch all records and filter in JS (same as /tracking).
      const allRecords = await fetchAllAirtableRecords(
        airtableToken,
        baseId,
        encodeURIComponent(tableName),
        '',
      );

      const wanted = (userData.affiliateId || '').toString().trim().toLowerCase();
      const matchesAffiliate = (value: unknown) => {
        const arr = Array.isArray(value) ? value : [value];
        return arr.some(v => v != null && v.toString().trim().toLowerCase() === wanted);
      };

      airtableRecords = allRecords.filter(record => matchesAffiliate(record.fields['affiliate-id'])).slice(0, 10);
    }

    return c.json({
      userId,
      email: authData.user.email,
      affiliateId: userData.affiliateId,
      commissionRate: userData.commissionRate,
      stats: userData.stats,
      linksCount: links.length,
      activityCount: activity.length,
      airtableRecordsFound: airtableRecords.length,
      sampleAirtableRecords: airtableRecords.slice(0, 3).map(r => ({
        cardName: r.fields['Card Name'],
        status: r.fields['Status'],
        clickDate: r.fields['Click Date'],
        affiliateId: r.fields['affiliate-id']
      })),
      userData,
      links
    });
  } catch (error) {
    console.log(`Debug user error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Login
app.post("/make-server-8dc4138c/manager/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    // Check against manager credentials
    const managers = await kv.get('managers') || [
      { email: 'admin@manager.com', password: 'admin123', name: 'Admin Manager' }
    ];

    const manager = managers.find(m => m.email === email && m.password === password);

    if (!manager) {
      return c.json({ error: 'Invalid manager credentials' }, 401);
    }

    // Create session token
    const sessionToken = `mgr_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Store session
    await kv.set(`manager_session:${sessionToken}`, {
      email: manager.email,
      name: manager.name,
      createdAt: new Date().toISOString()
    });

    return c.json({
      success: true,
      manager: {
        email: manager.email,
        name: manager.name
      },
      sessionToken
    });
  } catch (error) {
    console.log(`Manager login error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Verify session
app.get("/make-server-8dc4138c/manager/verify", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');

    if (!sessionToken || !sessionToken.startsWith('mgr_')) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const session = await kv.get(`manager_session:${sessionToken}`);

    if (!session) {
      return c.json({ error: 'Session expired' }, 401);
    }

    return c.json({ success: true, manager: session });
  } catch (error) {
    console.log(`Manager verify error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Get all affiliate users
app.get("/make-server-8dc4138c/manager/users", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    console.log('Fetch users - session token received:', sessionToken?.substring(0, 10) + '...');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      console.log('Unauthorized: No valid manager session found');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('Manager session verified');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.log('Missing Supabase credentials');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all users from Supabase Auth
    console.log('Listing users from Supabase Auth...');

    let users = [];
    try {
      const listResult = await supabase.auth.admin.listUsers();
      console.log('List users result data:', listResult.data);
      console.log('List users result error:', listResult.error);

      if (listResult.error) {
        console.log(`List users error: ${listResult.error.message}`);
        return c.json({ error: `Supabase Auth error: ${listResult.error.message}` }, 400);
      }

      users = listResult.data?.users || [];
      console.log(`Found ${users.length} users in Supabase Auth`);

      if (users.length === 0) {
        console.log('No users found, returning empty array');
        return c.json({ users: [] });
      }
    } catch (listException) {
      console.log('List users exception:', listException.message);
      console.log('Exception stack:', listException.stack);
      return c.json({ error: `Database exception: ${listException.message}` }, 500);
    }

    // Get additional data for each user
    console.log('Fetching additional data for users...');
    const usersWithData = await Promise.all(
      users.map(async (authUser) => {
        console.log(`Fetching data for user: ${authUser.email}`);

        let userData, links, activity;
        try {
          userData = await kv.get(`user:${authUser.id}`) || {};
          links = await kv.get(`links:${authUser.id}`) || [];
          activity = await kv.get(`activity:${authUser.id}`) || [];
        } catch (kvError) {
          console.log(`KV error for user ${authUser.email}:`, kvError.message);
          userData = {};
          links = [];
          activity = [];
        }

        // Prefer stats synced from Airtable tracking (written by tracking-activity endpoint).
        // Fall back to computing from KV links/activity if not yet synced.
        const airtableStats = userData.stats;
        const totalClicks = airtableStats?.totalClicks
          ?? links.reduce((sum, link) => sum + (link.clicks || 0), 0);
        const totalConversions = airtableStats?.totalConversions
          ?? links.reduce((sum, link) => sum + (link.conversions || 0), 0);
        const totalCommissions = airtableStats?.totalCommissions
          ?? activity.filter(a => a.status === 'approved').reduce((sum, a) => sum + (a.amount || 0), 0);

        return {
          id: authUser.id,
          email: authUser.email,
          createdAt: authUser.created_at,
          lastSignIn: authUser.last_sign_in_at,
          ...userData,
          stats: {
            totalClicks,
            totalConversions,
            totalCommissions,
            activeLinks: links.length,
            lastSynced: airtableStats ? (userData.statsUpdatedAt || null) : null,
          }
        };
      })
    );

    console.log(`Returning ${usersWithData.length} users with data`);
    return c.json({ users: usersWithData });
  } catch (error) {
    console.log(`Get all users error: ${error.message}`);
    console.log('Error stack:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Update affiliate commission rate
app.put("/make-server-8dc4138c/manager/user/:userId/commission", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const userId = c.req.param('userId');
    const { commissionRate } = await c.req.json();

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Update user commission rate
    const userData = await kv.get(`user:${userId}`);
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    userData.commissionRate = commissionRate;
    userData.updatedAt = new Date().toISOString();
    await kv.set(`user:${userId}`, userData);

    // Sync back to Airtable
    await syncToAirtable(userData.airtableRecordId, userData, userId);

    return c.json({ success: true, user: userData });
  } catch (error) {
    console.log(`Update commission error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Delete affiliate
// Manager: Update affiliate details
app.put("/make-server-8dc4138c/manager/user/:userId", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const userId = c.req.param('userId');
    const { name, email, phone, address, city, state, zip, country, ezrxRef } = await c.req.json();

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Update email in Supabase Auth if changed
    if (email) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
        userId,
        { email }
      );
      if (updateAuthError) {
        console.log(`Update auth email error: ${updateAuthError.message}`);
        return c.json({ error: updateAuthError.message }, 400);
      }
    }

    // Update user data in KV store
    const userData = await kv.get(`user:${userId}`) || {};
    const updatedUserData = {
      ...userData,
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      country,
      ezrxRef: (ezrxRef ?? userData.ezrxRef ?? '').trim(),
      updatedAt: new Date().toISOString()
    };

    await kv.set(`user:${userId}`, updatedUserData);

    // Sync back to Airtable
    await syncToAirtable(updatedUserData.airtableRecordId, updatedUserData, userId);

    return c.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.log(`Update user error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

app.delete("/make-server-8dc4138c/manager/user/:userId", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const userId = c.req.param('userId');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Delete user from Supabase Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.log(`Delete user error: ${deleteError.message}`);
      return c.json({ error: deleteError.message }, 400);
    }

    // Delete user data
    await kv.del(`user:${userId}`);
    await kv.del(`links:${userId}`);
    await kv.del(`activity:${userId}`);
    await kv.del(`payouts:${userId}`);

    return c.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.log(`Delete user error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Reset affiliate password
app.post("/make-server-8dc4138c/manager/user/:userId/reset-password", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const userId = c.req.param('userId');
    const { newPassword } = await c.req.json();

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.log(`Manager password reset error: ${updateError.message}`);
      return c.json({ error: updateError.message }, 400);
    }

    return c.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.log(`Manager reset password error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Login as user
app.post("/make-server-8dc4138c/manager/login-as/:userId", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const userId = c.req.param('userId');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Get user data
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Ensure user has all required data initialized
    let kvUserData = await kv.get(`user:${userId}`) || {};

    // Initialize missing fields
    let needsUpdate = false;

    if (!kvUserData.affiliateId) {
      kvUserData.affiliateId = `AF${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      needsUpdate = true;
      console.log(`Generated affiliate ID ${kvUserData.affiliateId} for user ${userId}`);
    }

    if (!kvUserData.email) {
      kvUserData.email = userData.user.email;
      needsUpdate = true;
    }

    if (!kvUserData.id) {
      kvUserData.id = userId;
      needsUpdate = true;
    }

    if (!kvUserData.createdAt) {
      kvUserData.createdAt = userData.user.created_at || new Date().toISOString();
      needsUpdate = true;
    }

    if (!kvUserData.name) {
      kvUserData.name = userData.user.user_metadata?.name || userData.user.email?.split('@')[0] || 'User';
      needsUpdate = true;
    }

    // Ensure all profile fields exist
    kvUserData.phone = kvUserData.phone || '';
    kvUserData.address = kvUserData.address || '';
    kvUserData.city = kvUserData.city || '';
    kvUserData.state = kvUserData.state || '';
    kvUserData.zip = kvUserData.zip || '';
    kvUserData.country = kvUserData.country || '';
    kvUserData.updatedAt = new Date().toISOString();

    if (needsUpdate) {
      await kv.set(`user:${userId}`, kvUserData);
      console.log(`Initialized user data for ${userId}:`, kvUserData);
    }

    // Ensure user has tracking links
    let links = await kv.get(`links:${userId}`) || [];
    if (links.length === 0) {
      console.log('Initializing tracking links for user', userId);
      const cards = await fetchCards();
      const cardsArray = Array.isArray(cards) ? cards : [];

      links = cardsArray.slice(0, 10).map((item, index) => {
        const card = item.card;
        const url = buildAffiliateUrl(card.link, kvUserData.affiliateId, card.name);
        return {
          id: index + 1,
          name: card.name,
          bank: card.bank,
          url,
          clicks: 0,
          conversions: 0,
          commission: 150,
          annualFee: card.annualFee,
          creditLevel: card.creditLevel
        };
      });

      await kv.set(`links:${userId}`, links);
      console.log(`Initialized ${links.length} links for user ${userId}`);
    }

    // Ensure activity and payouts exist
    const activity = await kv.get(`activity:${userId}`);
    if (!activity) {
      await kv.set(`activity:${userId}`, []);
    }

    const payouts = await kv.get(`payouts:${userId}`);
    if (!payouts) {
      await kv.set(`payouts:${userId}`, []);
    }

    // Create a self-contained impersonation token (no KV lookup needed on verify)
    const expiresTimestamp = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const impersonationToken = `imp_${userId}_${expiresTimestamp}`;

    console.log('Created impersonation token for user:', userId);
    return c.json({
      success: true,
      accessToken: impersonationToken,
      email: userData.user.email
    });
  } catch (error) {
    console.log(`Manager login-as error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: CPA rates — all cards from Airtable with bank total + optional affiliate payout
app.get("/make-server-8dc4138c/manager/cpa-rates", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    // Optional: calculate payout for a specific affiliate
    const affiliateUserId = c.req.query('userId');
    let affiliateCommissionRate = 0;
    let affiliateName = '';
    if (affiliateUserId) {
      const affiliateKvData = await kv.get(`user:${affiliateUserId}`) || {};
      affiliateCommissionRate = Number(affiliateKvData.commissionRate) || 50;
      affiliateName = affiliateKvData.name || affiliateKvData.email || affiliateUserId;
    }

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    let records: any[];
    try {
      records = await getCachedCpaRecords(airtableToken);
    } catch (airtableErr: any) {
      console.log('CPA rates Airtable error:', airtableErr.message);
      return c.json({ rates: [], error: airtableErr.message });
    }

    // Load CardRatingAPI enrichment (non-fatal)
    let cardRatingIndex: Record<string, any> = {};
    try {
      cardRatingIndex = await getCachedCardRatingIndex(airtableToken);
    } catch (e: any) {
      console.log('Manager CPA CardRating enrich skipped:', e.message);
    }

    // Per-card rate history (newest first) for the rate-history expansion.
    const rateHistories = await getCpaHistories(records);

    // Deduplicate by card name, keep most recent
    const seen = new Set<string>();
    const rates = [];

    for (let i = 0; i < records.length; i++) {
      const f = records[i].cellValuesByFieldId || records[i].fields || {};
      const cardName = f['fldN6ug8vDACn4yO1'] ?? f['Card Name'] ?? '';
      const issuer   = f['fldXsTKc4Op37yXWu'] ?? f['Issuer'] ?? '';
      const netCpa60 = f['fldr71bjB28kEAsbp'] ?? f['Net CPA 60%'] ?? '0';
      const date     = f['fldfL3uObDr0uotjI'] ?? f['Date'] ?? '';
      const rateDate = f['fldW5olh5ASAJ39uD'] ?? f['Date Change of Current Net CPA'] ?? '';

      if (!cardName || seen.has(cardName)) continue;
      seen.add(cardName);

      const bankCpa = parseFloat(String(netCpa60).replace(/[^0-9.]/g, '')) || 0;
      const affiliatePayout = (affiliateCommissionRate > 0 && bankCpa > 0)
        ? Math.round(bankCpa * affiliateCommissionRate / 100 * 100) / 100
        : null;

      const enrichment = lookupCardRating(cardRatingIndex, cardName);

      // Rate history (newest first), with the affiliate's cut when one is selected.
      const history = (rateHistories[normCardName(cardName)] || []).map(h => ({
        date: h.date,
        bankCpa: h.bankCpa,
        affiliatePayout: (affiliateCommissionRate > 0 && h.bankCpa > 0)
          ? Math.round(h.bankCpa * affiliateCommissionRate / 100 * 100) / 100
          : null,
      }));

      rates.push({
        id: i + 1,
        card: cardName,
        issuer,
        bankCpa,
        affiliatePayout,
        history,
        affiliateCommissionRate: affiliateCommissionRate || null,
        date: date || rateDate || records[i].createdTime?.split('T')[0] || '',
        cardId:   enrichment?.cardId   ?? '',
        cardType: enrichment?.cardType ?? '',
        cardUse:  enrichment?.cardUse  ?? '',
        imageUrl: enrichment?.imageUrl ?? '',
        annualFee:        enrichment?.annualFee        ?? '',
        introBonus:       enrichment?.introBonus       ?? '',
        introAprRate:     enrichment?.introAprRate     ?? '',
        introAprDuration: enrichment?.introAprDuration ?? '',
        bonusMilesFull:   enrichment?.bonusMilesFull   ?? '',
      });
    }

    return c.json({ rates, affiliateName, affiliateCommissionRate });
  } catch (error) {
    console.log(`Manager CPA rates error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manager: Create affiliate
app.post("/make-server-8dc4138c/manager/user", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const { email: rawEmail, password, name, commissionRate } = await c.req.json();
    // Normalize email (lowercase + trim) so accounts aren't case-sensitive.
    const email = (rawEmail || '').trim().toLowerCase();

    console.log('Create user request:', { email, name, commissionRate });

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      console.log('Unauthorized: No valid manager session');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('Manager session verified');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Create new user
    console.log('Creating Supabase auth user...');
    const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true
    });

    if (createError) {
      console.log(`Create user error: ${createError.message}`);
      return c.json({ error: createError.message }, 400);
    }

    console.log('Supabase auth user created:', newUserData.user.id);

    // Initialize user data
    const affiliateId = `ai-${Math.random().toString(36).substring(2, 7)}`;
    console.log('Generated affiliate ID:', affiliateId);

    await kv.set(`user:${newUserData.user.id}`, {
      email,
      name,
      affiliateId,
      commissionRate: commissionRate || 100,
      createdAt: new Date().toISOString()
    });
    console.log('User data saved to KV store');

    // Initialize tracking links with real card data
    console.log('Fetching cards for tracking links...');
    const cards = await fetchCards();
    const cardsArray = Array.isArray(cards) ? cards : [];
    console.log('Fetched', cardsArray.length, 'cards from CardBenefit');

    const trackingLinks = cardsArray.slice(0, 10).map((item, index) => {
      const card = item.card;
      const url = buildAffiliateUrl(card.link, affiliateId, card.name);
      return {
        id: index + 1,
        name: card.name,
        bank: card.bank,
        url,
        clicks: 0,
        conversions: 0,
        commission: 150,
        annualFee: card.annualFee,
        creditLevel: card.creditLevel
      };
    });

    await kv.set(`links:${newUserData.user.id}`, trackingLinks);
    await kv.set(`activity:${newUserData.user.id}`, []);
    await kv.set(`payouts:${newUserData.user.id}`, []);
    console.log('Initialized', trackingLinks.length, 'tracking links with real card data');

    // Create record in Airtable for new manually created user
    const userData = {
      email,
      name,
      affiliateId,
      commissionRate: commissionRate || 100
    };
    const airtableRecordId = await syncToAirtable(null, userData, newUserData.user.id);
    console.log('Created Airtable record:', airtableRecordId);

    console.log('User created successfully');
    return c.json({ success: true, user: newUserData.user });
  } catch (error) {
    console.log(`Manager create user error: ${error.message}`);
    console.log('Error stack:', error.stack);
    return c.json({ error: error.message }, 500);
  }
});

// Reset password
app.post("/make-server-8dc4138c/reset-password", async (c) => {
  try {
    const { email, newPassword } = await c.req.json();

    if (!email || !newPassword) {
      return c.json({ error: 'Email and new password are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Find user by email (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.log(`List users error: ${listError.message}`);
      return c.json({ error: 'Failed to find user' }, 400);
    }

    console.log(`Searching for user with email: ${normalizedEmail}`);
    console.log(`Total users found: ${users?.length || 0}`);

    const user = users?.find(u => u.email?.toLowerCase().trim() === normalizedEmail);

    if (!user) {
      console.log(`No user found with email: ${normalizedEmail}`);
      return c.json({ error: 'No account found with that email address' }, 404);
    }

    console.log(`Found user with ID: ${user.id}`);

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.log(`Password reset error: ${updateError.message}`);
      return c.json({ error: updateError.message }, 400);
    }

    console.log(`Password reset successful for user: ${user.email}`);
    return c.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.log(`Reset password error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Import CPA data from QuinStreet CSV
// Import CPA rates directly from Airtable CPA Changes table.
// Fetches current bank CPA per card and updates all users' KV link commissions.
app.post("/make-server-8dc4138c/manager/import-cpa-data", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');
    if (!airtableToken) {
      return c.json({ error: 'AIRTABLE_API_KEY not configured on server' }, 500);
    }

    // Bust the CPA rates cache so everyone sees fresh data immediately after import
    await kv.del(CPA_CACHE_KEY);
    console.log('CPA cache cleared before import');

    // Fetch all records from CPA Changes table (ZeroAPR - COLLECTIONS base)
    const baseId = 'appJq70k9nl9MK2zk';
    const tableId = 'tbl31rWYAh5hb02Tx';
    const params = 'fields%5B%5D=Card+Name&fields%5B%5D=Net+CPA+60%25&sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=desc';

    console.log('Fetching CPA rates from Airtable...');
    let records: any[];
    try {
      records = await fetchAllAirtableRecords(airtableToken, baseId, tableId, params);
    } catch (airtableErr: any) {
      console.log('Airtable CPA fetch failed:', airtableErr.message);
      return c.json({ error: airtableErr.message }, 500);
    }
    console.log(`Fetched ${records.length} records from Airtable CPA Changes`);

    // Build card → bank CPA map (most recent per card, data is sorted desc by date)
    const cardCommissions = new Map<string, number>();
    for (const rec of records) {
      const f = rec.fields || {};
      const cardName = f['Card Name'] ?? '';
      const rawCpa   = f['Net CPA 60%'] ?? '0';
      const bankCpa  = parseFloat(String(rawCpa).replace(/[^0-9.]/g, '')) || 0;
      if (cardName && bankCpa > 0 && !cardCommissions.has(cardName)) {
        cardCommissions.set(cardName, bankCpa);
      }
    }

    console.log(`Unique cards with CPA: ${cardCommissions.size}`);

    if (cardCommissions.size === 0) {
      return c.json({
        error: 'No valid CPA rates found in Airtable. Check that "Card Name" and "Net CPA 60%" fields have data.'
      }, 400);
    }

    // Update every user's KV tracking links with the matched bank CPA
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: `Failed to list users: ${listError.message}` }, 500);
    }

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    let usersUpdated = 0;
    let cardsUpdated = 0;

    for (const user of users || []) {
      const links = await kv.get(`links:${user.id}`) || [];
      let changed = false;

      for (const link of links) {
        const normLink = norm(link.name || '');
        for (const [airtableCard, bankCpa] of cardCommissions.entries()) {
          if (norm(airtableCard) === normLink ||
              normLink.includes(norm(airtableCard)) ||
              norm(airtableCard).includes(normLink)) {
            link.commission = bankCpa; // store bank CPA; each affiliate's cut calculated at display time
            cardsUpdated++;
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        await kv.set(`links:${user.id}`, links);
        usersUpdated++;
      }
    }

    console.log(`Import done: ${cardsUpdated} cards updated across ${usersUpdated} users`);

    await flushSnapshots();

    return c.json({
      success: true,
      stats: { uniqueCards: cardCommissions.size, usersUpdated, cardsUpdated },
    });
  } catch (error) {
    console.log(`Import CPA data error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Manual refresh of the card-rating index. Pulls fresh from the QuinStreet
// ListingDisplay feed (per issuer) and caches it in KV for payouts/card enrichment.
app.post("/make-server-8dc4138c/manager/sync-card-rating-api", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    // Pull fresh from the QuinStreet ListingDisplay feed (per issuer) and cache it.
    const index = await getCachedCardRatingIndex('', true);
    const count = Object.keys(index).length;
    if (count === 0) {
      return c.json({ error: 'QuinStreet ListingDisplay returned no cards — try again shortly.' }, 502);
    }

    await flushSnapshots();

    return c.json({ success: true, cards: count, message: `Refreshed ${count} cards from QuinStreet.` });
  } catch (error: any) {
    console.log(`Sync CardRatingAPI error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Send password reset email
app.post("/make-server-8dc4138c/send-password-reset", async (c) => {
  try {
    const { email, redirectUrl } = await c.req.json();

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
    );

    // Build redirect URL from frontend origin
    const origin = c.req.header('origin') || c.req.header('referer')?.split('/').slice(0, 3).join('/');
    const resetUrl = redirectUrl || `${origin}/reset-password`;

    console.log(`Sending password reset email to: ${email}`);
    console.log(`Redirect URL: ${resetUrl}`);

    // Use Supabase's built-in password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetUrl,
    });

    if (error) {
      console.log(`Send password reset error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    console.log(`Password reset email sent successfully to: ${email}`);
    return c.json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.'
    });
  } catch (error) {
    console.log(`Send password reset error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);
