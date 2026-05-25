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

    const fields = {
      'Email': userData.email,
      'First Name': firstName,
      'Last Name': lastName,
      'Phone': userData.phone || '',
      'Affiliate-ID': userData.affiliateId || '',
      'Aff Cut': userData.commissionRate ? String(userData.commissionRate) : '50',
      'Activity': true // Mark as active
    };

    if (airtableRecordId) {
      // Update existing record
      console.log('Updating Airtable record:', airtableRecordId, fields);

      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${airtableRecordId}`;
      const response = await fetch(airtableUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        },
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
      console.log('Creating new Airtable record:', fields);

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
        console.log('Airtable create error:', response.status, errorText);
        return null;
      } else {
        const result = await response.json();
        console.log('Successfully created Airtable record:', result.id);

        // Update user data with the new Airtable record ID
        if (userId) {
          const currentUserData = await kv.get(`user:${userId}`);
          if (currentUserData) {
            currentUserData.airtableRecordId = result.id;
            await kv.set(`user:${userId}`, currentUserData);
          }
        }

        return result.id;
      }
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
    const { email, password, name } = await c.req.json();

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
    const affiliateId = `AF${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
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
      const url = card.link ? card.link.replace(/ref=[^&]+/, `ref=${affiliateId}`) : `https://apply.cards/${card.name.toLowerCase().replace(/\s+/g, '-')}?ref=${affiliateId}`;
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
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
app.get("/make-server-8dc4138c/links", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let links = await kv.get(`links:${user.id}`) || [];

    // If user has no links, initialize them with real card data
    if (links.length === 0) {
      console.log('User has no links, initializing with real card data...');
      const userData = await kv.get(`user:${user.id}`) || {};
      let affiliateId = userData.affiliateId;

      // If no affiliate ID exists, generate one and save it
      if (!affiliateId) {
        affiliateId = `AF${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        userData.affiliateId = affiliateId;
        await kv.set(`user:${user.id}`, userData);
        console.log(`Generated new affiliate ID: ${affiliateId} for user ${user.id}`);
      } else {
        console.log(`Using existing affiliate ID: ${affiliateId} for user ${user.id}`);
      }

      const cards = await fetchCards();
      const cardsArray = Array.isArray(cards) ? cards : [];
      console.log('Fetched', cardsArray.length, 'cards from CardBenefit');

      links = cardsArray.slice(0, 10).map((item, index) => {
        const card = item.card;
        const url = card.link ? card.link.replace(/ref=[^&]+/, `ref=${affiliateId}`) : `https://apply.cards/${card.name.toLowerCase().replace(/\s+/g, '-')}?ref=${affiliateId}`;
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

      await kv.set(`links:${user.id}`, links);
      console.log('Initialized', links.length, 'links for user');
    }

    return c.json({ links });
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

    // Fetch records from Airtable filtered by affiliate ID
    const filterFormula = `{affiliate-id}='${affiliateId}'`;
    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(filterFormula)}&sort[0][field]=Click Date&sort[0][direction]=desc&pageSize=100`;

    console.log('Airtable filter formula:', filterFormula);
    console.log('Airtable URL:', airtableUrl);

    const airtableResponse = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${airtableToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Airtable response status:', airtableResponse.status);

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.log('Airtable API error:', airtableResponse.status, errorText);
      return c.json({ tracking: [] });
    }

    const airtableData = await airtableResponse.json();
    const records = airtableData.records || [];

    console.log(`Found ${records.length} tracking records for affiliate ${affiliateId}`);

    // Format tracking records
    const tracking = records.map(record => ({
      id: record.id,
      cardName: record.fields['Card Name'] || 'Unknown',
      status: record.fields['Status'] || 'N/A',
      totalEarnings: parseFloat(record.fields['Total Earnings']) || 0,
      clickDate: record.fields['Click Date'] || '',
      clickTime: record.fields['Click Time'] || '',
      clicks: parseInt(record.fields['Clicks']) || 0,
      applications: parseInt(record.fields['Applications']) || 0,
      approvals: parseInt(record.fields['Approvals']) || 0,
      deviceType: record.fields['Device Type'] || '',
      state: record.fields['State'] || ''
    }));

    return c.json({ tracking });
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

// Get payouts
app.get("/make-server-8dc4138c/payouts", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payouts = await kv.get(`payouts:${user.id}`) || [];
    return c.json({ payouts });
  } catch (error) {
    console.log(`Get payouts error: ${error.message}`);
    return c.json({ error: error.message }, 500);
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
    const { email, name, phone, address, city, state, zip, country } = await c.req.json();

    const impersonationToken = c.req.header('X-Impersonation-Token');
    const { user, error } = await getUserFromToken(accessToken, impersonationToken);
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Update email in Supabase Auth if it changed
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

    // Fetch all records from Airtable
    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
    const airtableResponse = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${airtableToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.log('Airtable API error:', errorText);
      return c.json({ error: `Airtable API error: ${airtableResponse.status}` }, 500);
    }

    const airtableData = await airtableResponse.json();
    const records = airtableData.records || [];
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

      try {
        // Check if user exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === email);

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
            airtableRecordId: record.id // Store Airtable record ID for bidirectional sync
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
          const newAffiliateId = affiliateId || `AF${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          await kv.set(`user:${newUser.user.id}`, {
            email,
            name,
            phone,
            affiliateId: newAffiliateId,
            commissionRate,
            createdAt: new Date().toISOString(),
            airtableRecordId: record.id // Store Airtable record ID for bidirectional sync
          });

          // Initialize tracking links
          const cards = await fetchCards();
          const cardsArray = Array.isArray(cards) ? cards : [];
          const trackingLinks = cardsArray.slice(0, 10).map((item, index) => {
            const card = item.card;
            const url = card.link ? card.link.replace(/ref=[^&]+/, `ref=${newAffiliateId}`) : `https://apply.cards/${card.name.toLowerCase().replace(/\s+/g, '-')}?ref=${newAffiliateId}`;
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

    console.log('Starting tracking data sync from Airtable API Output...');

    const baseId = 'apphsOm1RQvOeiAEl';
    const tableName = 'API Output';
    const airtableToken = Deno.env.get('AIRTABLE_API_KEY');

    if (!airtableToken) {
      return c.json({ error: 'Airtable API key not configured' }, 500);
    }

    // Fetch all records from Airtable API Output
    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
    const airtableResponse = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${airtableToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.log('Airtable API error:', errorText);
      return c.json({ error: `Airtable API error: ${airtableResponse.status}` }, 500);
    }

    const airtableData = await airtableResponse.json();
    const records = airtableData.records || [];
    console.log(`Fetched ${records.length} tracking records from Airtable`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Get all users
    const { data: existingUsers } = await supabase.auth.admin.listUsers();

    // Aggregate stats by affiliate ID
    const statsByAffiliate = {};

    for (const record of records) {
      const fields = record.fields;
      const affiliateId = fields['affiliate-id'];
      const cardName = fields['Card Name'];
      const status = fields['Status'];
      const earnings = parseFloat(fields['Total Earnings']) || 0;
      const clicks = parseInt(fields['Clicks']) || 0;
      const applications = parseInt(fields['Applications']) || 0;
      const approvals = parseInt(fields['Approvals']) || 0;

      if (!affiliateId) continue;

      if (!statsByAffiliate[affiliateId]) {
        statsByAffiliate[affiliateId] = {
          totalClicks: 0,
          totalConversions: 0,
          totalCommissions: 0,
          cardStats: {}
        };
      }

      statsByAffiliate[affiliateId].totalClicks += clicks;
      statsByAffiliate[affiliateId].totalConversions += (applications + approvals);
      statsByAffiliate[affiliateId].totalCommissions += earnings;

      // Track per-card stats
      if (cardName) {
        if (!statsByAffiliate[affiliateId].cardStats[cardName]) {
          statsByAffiliate[affiliateId].cardStats[cardName] = {
            clicks: 0,
            conversions: 0,
            commissions: 0
          };
        }
        statsByAffiliate[affiliateId].cardStats[cardName].clicks += clicks;
        statsByAffiliate[affiliateId].cardStats[cardName].conversions += (applications + approvals);
        statsByAffiliate[affiliateId].cardStats[cardName].commissions += earnings;
      }
    }

    console.log('Aggregated stats for', Object.keys(statsByAffiliate).length, 'affiliates');

    // Update user stats in KV store
    let updated = 0;

    // First, build a map of affiliateId -> userId
    const affiliateToUserMap = {};
    for (const user of (existingUsers?.users || [])) {
      const userData = await kv.get(`user:${user.id}`);
      if (userData?.affiliateId) {
        affiliateToUserMap[userData.affiliateId] = user.id;
      }
    }

    // Now update stats for each affiliate
    for (const [affiliateId, stats] of Object.entries(statsByAffiliate)) {
      const userId = affiliateToUserMap[affiliateId];

      if (userId) {
        const userData = await kv.get(`user:${userId}`) || {};
        userData.stats = stats;
        await kv.set(`user:${userId}`, userData);
        updated++;
        console.log(`Updated stats for affiliate ${affiliateId}`);
      }
    }

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

    // Fetch all records from Airtable "All Items 2026" view with pagination
    const viewName = 'All Items 2026';
    console.log('Fetching all records from Airtable view:', viewName);

    let allRecords = [];
    let offset = null;

    // Loop through all pages of results
    do {
      let airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?view=${encodeURIComponent(viewName)}&pageSize=100`;
      if (offset) {
        airtableUrl += `&offset=${offset}`;
      }

      console.log('Fetching page with offset:', offset || 'none');

      const airtableResponse = await fetch(airtableUrl, {
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!airtableResponse.ok) {
        const errorText = await airtableResponse.text();
        console.log('Airtable API error:', errorText);
        return c.json({ error: `Airtable API error: ${airtableResponse.status}` }, 500);
      }

      const airtableData = await airtableResponse.json();
      allRecords = allRecords.concat(airtableData.records || []);
      offset = airtableData.offset || null;

      console.log('Fetched', airtableData.records?.length || 0, 'records. Total so far:', allRecords.length);
    } while (offset);

    console.log('Finished fetching. Total records:', allRecords.length);
    const records = allRecords;

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
      clicks: parseInt(record.fields['Clicks']) || 0,
      applications: parseInt(record.fields['Applications']) || 0,
      approvals: parseInt(record.fields['Approvals']) || 0,
      deviceType: record.fields['Device Type'] || '',
      state: record.fields['State'] || ''
    }));

    return c.json({
      success: true,
      activity,
      total: activity.length
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
      const filterFormula = `{affiliate-id}='${userData.affiliateId}'`;
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(filterFormula)}&pageSize=10`;

      const airtableResponse = await fetch(airtableUrl, {
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (airtableResponse.ok) {
        const airtableData = await airtableResponse.json();
        airtableRecords = airtableData.records || [];
      }
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

        const totalClicks = links.reduce((sum, link) => sum + (link.clicks || 0), 0);
        const totalConversions = links.reduce((sum, link) => sum + (link.conversions || 0), 0);
        const totalCommissions = activity
          .filter(a => a.status === 'approved')
          .reduce((sum, a) => sum + (a.amount || 0), 0);

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
            activeLinks: links.length
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
    const { name, email, phone, address, city, state, zip, country } = await c.req.json();

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
        const url = card.link ? card.link.replace(/ref=[^&]+/, `ref=${kvUserData.affiliateId}`) : `https://apply.cards/${card.name.toLowerCase().replace(/\s+/g, '-')}?ref=${kvUserData.affiliateId}`;
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

// Manager: Create affiliate
app.post("/make-server-8dc4138c/manager/user", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');
    const { email, password, name, commissionRate } = await c.req.json();

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
    const affiliateId = `AF${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
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
      const url = card.link ? card.link.replace(/ref=[^&]+/, `ref=${affiliateId}`) : `https://apply.cards/${card.name.toLowerCase().replace(/\s+/g, '-')}?ref=${affiliateId}`;
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
app.post("/make-server-8dc4138c/manager/import-cpa-data", async (c) => {
  try {
    const sessionToken = c.req.header('X-Manager-Session');

    // Verify manager session
    const session = await kv.get(`manager_session:${sessionToken}`);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { csvData } = await c.req.json();

    if (!csvData) {
      return c.json({ error: 'CSV data is required' }, 400);
    }

    console.log('Importing CPA data from CSV...');

    // Parse CSV data
    const lines = csvData.trim().split('\n');
    const cardCommissions = new Map();
    let imported = 0;
    let skipped = 0;

    // Skip header rows (first 3 lines)
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse CSV line (handle quoted fields)
      const fields = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(f => f.replace(/^"|"$/g, '').trim());

      if (!fields || fields.length < 5) {
        skipped++;
        continue;
      }

      const cardName = fields[2]; // Card Name column
      const currentCPA = parseFloat(fields[4]); // Current Net CPA column

      // Skip if no valid CPA or card name
      if (!cardName || isNaN(currentCPA) || currentCPA <= 0) {
        skipped++;
        continue;
      }

      // Store the commission (use highest value if multiple tiers)
      if (!cardCommissions.has(cardName) || cardCommissions.get(cardName) < currentCPA) {
        cardCommissions.set(cardName, currentCPA);
      }
    }

    console.log(`Parsed ${cardCommissions.size} unique cards from CSV`);

    // Update all users' cards with new commission rates
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.log(`List users error: ${listError.message}`);
      return c.json({ error: 'Failed to fetch users' }, 500);
    }

    let usersUpdated = 0;
    let cardsUpdated = 0;

    for (const user of users || []) {
      const links = await kv.get(`links:${user.id}`) || [];
      let userCardsUpdated = false;

      for (const link of links) {
        // Try to match card name (exact or partial match)
        for (const [csvCardName, commission] of cardCommissions.entries()) {
          if (link.name === csvCardName ||
              link.name.includes(csvCardName) ||
              csvCardName.includes(link.name)) {
            link.commission = commission;
            cardsUpdated++;
            userCardsUpdated = true;
            console.log(`Updated ${link.name} commission to $${commission}`);
            break;
          }
        }
      }

      if (userCardsUpdated) {
        await kv.set(`links:${user.id}`, links);
        usersUpdated++;
      }
    }

    console.log(`Import complete: ${usersUpdated} users updated, ${cardsUpdated} cards updated`);

    return c.json({
      success: true,
      message: `Imported ${cardCommissions.size} card commissions`,
      stats: {
        uniqueCards: cardCommissions.size,
        usersUpdated,
        cardsUpdated,
        skipped
      }
    });
  } catch (error) {
    console.log(`Import CPA data error: ${error.message}`);
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