const axios = require('axios');

async function getCanvasAccessToken(user) {
  if (!user?.canvas_refresh_token) {
    return null;
  }

  const client_id = process.env.VUE_APP_CLIENT_ID;
  const client_secret = process.env.CLIENT_SECRET;
  try { 
    const refresh_response = await axios.post(
      'https://canvas.mit.edu/login/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: client_id,
        client_secret: client_secret,
        refresh_token: user.canvas_refresh_token,
        expires_in: 3600,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return refresh_response.data.access_token;
  } catch (err) {
    throw new Error("Failed to refresh Canvas access token");
  }
}

async function refreshCanvasAccessToken(user, res) {
    const canvas_access_token = await getCanvasAccessToken(user);
    if (!canvas_access_token) {
        throw new Error("Failed to refresh Canvas access token");
    }
    res.cookie('canvas_access_token', canvas_access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    res.cookie('is_canvas_user', true, {
      httpOnly: false,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    return canvas_access_token;
}

module.exports = { refreshCanvasAccessToken };
