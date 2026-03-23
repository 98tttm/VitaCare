/**
 * Đăng nhập Google / Facebook (OAuth2 redirect).
 *
 * Biến môi trường (backend/.env):
 *   FRONTEND_URL=http://localhost:4200
 *   OAUTH_GOOGLE_CLIENT_ID=...
 *   OAUTH_GOOGLE_CLIENT_SECRET=...
 *   OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
 *   OAUTH_FACEBOOK_APP_ID=...
 *   OAUTH_FACEBOOK_APP_SECRET=...
 *   OAUTH_FACEBOOK_REDIRECT_URI=http://localhost:3000/api/auth/facebook/callback
 */
'use strict';

function stripPassword(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const { password: _p, ...rest } = doc;
  return rest;
}

function registerOAuthRoutes(app, { usersCollection, cartsCollection, bcrypt, crypto }) {
  const mongoose = require('mongoose');

  const oauthStates = () => mongoose.connection.db.collection('oauth_login_states');
  const oauthCodes = () => mongoose.connection.db.collection('oauth_login_codes');

  const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
  const PORT = process.env.PORT || 3000;

  const GOOGLE_ID = process.env.OAUTH_GOOGLE_CLIENT_ID || '';
  const GOOGLE_SECRET = process.env.OAUTH_GOOGLE_CLIENT_SECRET || '';
  const GOOGLE_REDIRECT =
    process.env.OAUTH_GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;

  const FB_ID = process.env.OAUTH_FACEBOOK_APP_ID || '';
  const FB_SECRET = process.env.OAUTH_FACEBOOK_APP_SECRET || '';
  const FB_REDIRECT =
    process.env.OAUTH_FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/facebook/callback`;

  function redirectFrontend(res, query) {
    const q = new URLSearchParams(query);
    res.redirect(`${FRONTEND}/?${q.toString()}`);
  }

  function syntheticPhoneFromSeed(seed) {
    const h = crypto.createHash('sha256').update(String(seed)).digest('hex');
    const num = parseInt(h.slice(0, 8), 16) % 100000000;
    const padded = String(num).padStart(8, '0');
    return '08' + padded;
  }

  async function ensureUniqueSyntheticPhone(seed) {
    let suffix = 0;
    for (;;) {
      const base = syntheticPhoneFromSeed(String(seed) + (suffix ? ':' + suffix : ''));
      const exists = await usersCollection().findOne({ phone: base });
      if (!exists) return base;
      suffix += 1;
      if (suffix > 50) return syntheticPhoneFromSeed(seed + ':' + Date.now());
    }
  }

  async function nextCustomerId() {
    const lastUser = await usersCollection().find().sort({ user_id: -1 }).limit(1).toArray();
    let nextNum = 1;
    if (lastUser.length > 0) {
      const m = (lastUser[0].user_id || '').match(/CUS0*(\d+)/i);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    return 'CUS' + String(nextNum).padStart(6, '0');
  }

  async function findOrCreateOAuthUser({
    provider,
    providerUserId,
    email,
    fullName,
    avatar,
  }) {
    const col = usersCollection();
    const pidField = provider === 'google' ? 'oauth_google_id' : 'oauth_facebook_id';

    let user = await col.findOne({ [pidField]: providerUserId });
    if (user) {
      const updates = {};
      if (fullName && String(fullName).trim() && fullName !== user.full_name) updates.full_name = fullName;
      if (avatar && avatar !== user.avatar) updates.avatar = avatar;
      if (email && String(email).trim() && (!user.email || user.email === '')) {
        updates.email = String(email).trim().toLowerCase();
      }
      if (Object.keys(updates).length) {
        await col.updateOne({ _id: user._id }, { $set: updates });
        user = { ...user, ...updates };
      }
      return user;
    }

    const em = (email || '').trim().toLowerCase();
    if (em) {
      user = await col.findOne({ email: em });
      if (user) {
        await col.updateOne(
          { _id: user._id },
          {
            $set: {
              [pidField]: providerUserId,
              oauth_provider: provider,
              ...(avatar && !user.avatar ? { avatar } : {}),
              ...(fullName && !user.full_name ? { full_name: fullName } : {}),
            },
          }
        );
        return col.findOne({ _id: user._id });
      }
    }

    const user_id = await nextCustomerId();
    const randomPw = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const phone = await ensureUniqueSyntheticPhone(`${provider}:${providerUserId}`);

    const newUser = {
      user_id,
      avatar: avatar || null,
      full_name: fullName || '',
      email: em || '',
      password: randomPw,
      phone,
      birthday: null,
      gender: 'Other',
      address: [],
      registerdate: new Date().toISOString(),
      totalspent: 0,
      tiering: 'Đồng',
      oauth_provider: provider,
      [pidField]: providerUserId,
    };

    await col.insertOne(newUser);
    const cartDoc = { user_id, items: [] };
    await cartsCollection().insertOne(cartDoc).catch(() => {});

    return col.findOne({ user_id });
  }

  async function issueOAuthSessionRedirect(res, userDoc) {
    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await oauthCodes().insertOne({
      code,
      expiresAt,
      user_id: userDoc.user_id,
      createdAt: new Date(),
    });
    redirectFrontend(res, { oauth_code: code });
  }

  // —— Google ——
  app.get('/api/auth/google/start', async (req, res) => {
    try {
      if (!GOOGLE_ID || !GOOGLE_SECRET) {
        return redirectFrontend(res, { oauth_error: 'google_not_configured' });
      }
      const state = crypto.randomBytes(16).toString('hex');
      await oauthStates().insertOne({
        state,
        provider: 'google',
        createdAt: new Date(),
      });
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_ID);
      authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'online');
      authUrl.searchParams.set('prompt', 'select_account');
      res.redirect(authUrl.toString());
    } catch (e) {
      console.error('[GET /api/auth/google/start]', e);
      redirectFrontend(res, { oauth_error: 'server' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, state, error, error_description: _ed } = req.query;
      if (error) {
        console.warn('[Google OAuth] error:', error);
        return redirectFrontend(res, { oauth_error: 'google_denied' });
      }
      if (!code || !state) {
        return redirectFrontend(res, { oauth_error: 'google_invalid' });
      }
      const stDoc = await oauthStates().findOne({ state: String(state), provider: 'google' });
      if (!stDoc) {
        return redirectFrontend(res, { oauth_error: 'invalid_state' });
      }
      await oauthStates().deleteOne({ _id: stDoc._id });

      const body = new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_ID,
        client_secret: GOOGLE_SECRET,
        redirect_uri: GOOGLE_REDIRECT,
        grant_type: 'authorization_code',
      });
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.access_token) {
        console.error('[Google OAuth] token error:', tokenJson);
        return redirectFrontend(res, { oauth_error: 'google_token' });
      }

      const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const profile = await uiRes.json();
      if (!uiRes.ok || !profile.id) {
        console.error('[Google OAuth] userinfo error:', profile);
        return redirectFrontend(res, { oauth_error: 'google_profile' });
      }

      const userDoc = await findOrCreateOAuthUser({
        provider: 'google',
        providerUserId: String(profile.id),
        email: profile.email,
        fullName: profile.name || profile.given_name || '',
        avatar: profile.picture || null,
      });
      if (!userDoc) return redirectFrontend(res, { oauth_error: 'google_user' });
      return issueOAuthSessionRedirect(res, userDoc);
    } catch (e) {
      console.error('[GET /api/auth/google/callback]', e);
      redirectFrontend(res, { oauth_error: 'server' });
    }
  });

  // —— Facebook ——
  app.get('/api/auth/facebook/start', async (req, res) => {
    try {
      if (!FB_ID || !FB_SECRET) {
        return redirectFrontend(res, { oauth_error: 'facebook_not_configured' });
      }
      const state = crypto.randomBytes(16).toString('hex');
      await oauthStates().insertOne({
        state,
        provider: 'facebook',
        createdAt: new Date(),
      });
      const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
      authUrl.searchParams.set('client_id', FB_ID);
      authUrl.searchParams.set('redirect_uri', FB_REDIRECT);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('scope', 'email,public_profile');
      res.redirect(authUrl.toString());
    } catch (e) {
      console.error('[GET /api/auth/facebook/start]', e);
      redirectFrontend(res, { oauth_error: 'server' });
    }
  });

  app.get('/api/auth/facebook/callback', async (req, res) => {
    try {
      const { code, state, error: fbErr } = req.query;
      if (fbErr) {
        return redirectFrontend(res, { oauth_error: 'facebook_denied' });
      }
      if (!code || !state) {
        return redirectFrontend(res, { oauth_error: 'facebook_invalid' });
      }
      const deleted = await oauthStates().deleteOne({ state: String(state), provider: 'facebook' });
      if (deleted.deletedCount !== 1) {
        return redirectFrontend(res, { oauth_error: 'invalid_state' });
      }

      const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', FB_ID);
      tokenUrl.searchParams.set('client_secret', FB_SECRET);
      tokenUrl.searchParams.set('redirect_uri', FB_REDIRECT);
      tokenUrl.searchParams.set('code', String(code));

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.access_token) {
        console.error('[Facebook OAuth] token error:', tokenJson);
        return redirectFrontend(res, { oauth_error: 'facebook_token' });
      }

      const meUrl = new URL('https://graph.facebook.com/v18.0/me');
      meUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
      meUrl.searchParams.set('access_token', tokenJson.access_token);

      const meRes = await fetch(meUrl.toString());
      const profile = await meRes.json();
      if (!meRes.ok || !profile.id) {
        console.error('[Facebook OAuth] me error:', profile);
        return redirectFrontend(res, { oauth_error: 'facebook_profile' });
      }

      let avatar = null;
      if (profile.picture && profile.picture.data && profile.picture.data.url) {
        avatar = profile.picture.data.url;
      }

      const userDoc = await findOrCreateOAuthUser({
        provider: 'facebook',
        providerUserId: String(profile.id),
        email: profile.email || '',
        fullName: profile.name || '',
        avatar,
      });
      if (!userDoc) return redirectFrontend(res, { oauth_error: 'facebook_user' });
      return issueOAuthSessionRedirect(res, userDoc);
    } catch (e) {
      console.error('[GET /api/auth/facebook/callback]', e);
      redirectFrontend(res, { oauth_error: 'server' });
    }
  });

  // Đổi mã một lần lấy user (SPA gọi sau khi redirect về FRONTEND_URL ?oauth_code=...)
  app.post('/api/auth/oauth/exchange', async (req, res) => {
    try {
      const code = req.body && req.body.code != null ? String(req.body.code).trim() : '';
      if (!code) {
        return res.status(400).json({ success: false, message: 'Thiếu mã xác thực.' });
      }
      const doc = await oauthCodes().findOne({ code });
      if (!doc || !doc.user_id) {
        return res.status(400).json({ success: false, message: 'Mã không hợp lệ hoặc đã hết hạn.' });
      }
      if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
        await oauthCodes().deleteOne({ _id: doc._id });
        return res.status(400).json({ success: false, message: 'Mã đã hết hạn.' });
      }
      await oauthCodes().deleteOne({ _id: doc._id });
      const user = await usersCollection().findOne({ user_id: doc.user_id });
      if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
      }
      return res.json({ success: true, user: stripPassword(user) });
    } catch (e) {
      console.error('[POST /api/auth/oauth/exchange]', e);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
  });
}

module.exports = registerOAuthRoutes;
