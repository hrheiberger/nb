const axios = require('axios');
const donenv = require('dotenv');

donenv.config();

// List of Canvas-enabled universities
// NOTE: This is a static list and should be updated as needed
const canvasUniversities = [
  {
      name: "Massachusetts Institute of Technology", // Name shown on CanvasSplitButton Dropdown
      short_name: "MIT", // Name shown when university selected
      canvas_url: "canvas.mit.edu", // Canvas URL for the university
  },
];

// List of client secrets for Canvas-enabled universities
// NOTE: This is a static list and should be updated as needed
const canvasSecret = {
  "canvas.mit.edu": process.env.MIT_CLIENT_SECRET,
};

async function getCanvasAccessToken(user) {
  if (!user?.canvas_refresh_token) {
    return null;
  }

  const client_id = process.env.VUE_APP_CLIENT_ID;
  const client_secret = process.env.MIT_CLIENT_SECRET;
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

module.exports = { refreshCanvasAccessToken,  canvasUniversities, canvasSecret};
