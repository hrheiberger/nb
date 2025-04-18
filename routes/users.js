const express = require('express');
const axios = require('axios');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models').User;
const router = express.Router();
const transporter = require('../email-config');
const { v4: uuidv4 } = require('uuid');
const donenv = require('dotenv');
const { Op } = require("sequelize");
const { refreshCanvasAccessToken } = require("./utils");

donenv.config();

/**
 * Get active user based on the id given in the request
 * @name POST/api/users/getuser
 */
router.post('/getuser', (req, res) => {
  if (!req.body.id) {
    res.status(200).json(null);
    return null;
  }
  User.findOne({ where: { reset_password_id: req.body.id }, include: [{ association: 'Consents' }, { association: 'Dissents' }] })
    .then(function (user) {
      if (!user) {
        res.status(200).json(null);
        return null;
      } else {
        const token = jwt.sign({ user: user}, process.env.JWT_SECRET);
        res.status(200).json({ token });
      }
    });
})

/**
 * Get user
 * @name GET/api/users/user/:id
 */
router.get('/user/:id', (req, res) => {
  User.findOne({ where: { id: req.params.id }})
    .then(function (user) {
      if (!user) {
        res.status(200).json(null);
        return null;
      } else {
        res.status(200).json(user);
      }
    });
})

/**
 * Get all users.
 * @name POST/api/users/all
 */
router.get('/all', passport.authenticate('jwt', { session: false }), (req, res) => {
  User.findAll({ attributes: ['id', 'username', 'name', 'email'] }).then((users) => {
    res.status(200).json(users);
  });
});

/**
 * Set username of active user.
 * @name POST/api/users/login
 */
router.post('/login', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  const user = await User.findOne({ where: { username: { [Op.iLike]: username } }, include: [{ association: 'Consents' }, { association: 'Dissents' }] })

  if (!user) {
    res.status(401).json({ msg: "No user with username " + username });
  } else if (!user.validPassword(password)) {
    res.status(401).json({ msg: "Incorrect password" });
  } else {
    const token = jwt.sign({ user: user}, process.env.JWT_SECRET);
    res.status(200).json({ token });
  }
});

/**
 * Set username of active user through Canvas sign-in
 * @name POST/api/users/login-canvas
 */
router.post('/login-canvas', async (req, res) => {
  const client_id = process.env.VUE_APP_CLIENT_ID;
  const client_secret = process.env.CLIENT_SECRET;
  const redirect_uri = process.env.VUE_APP_CANVAS_REDIRECT_URI;

  // Verify OAuth Code
  let canvas_access_token;
  let canvas_refresh_token;
  try {
    const response = await axios.post(
      'https://canvas.mit.edu/login/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        redirect_uri,
        expires_in: 3600,
        code: req.body.code
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    canvas_access_token = response.data.access_token;
    canvas_refresh_token = response.data.refresh_token;
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
  } catch (err) {
    console.log("error:" + err);
    res.status(400).json({ msg: err.response?.data?.error_description || "OAuth failed"  })
    return;
  }

  // Get Canvas Profile
  let canvas_profile;
  try {
    const response = await axios.get('https://canvas.mit.edu/api/v1/users/self/profile', {
      headers: {
        Authorization: `Bearer ${canvas_access_token}`
      }
    });
    canvas_profile = response.data;
  } catch (err) {
    console.log("error:" + err);
    res.status(400).json({ msg: err.response?.data?.error_description || "OAuth failed"  })
    return;
  }

  const user = await User.findOne({ where: { username: { [Op.iLike]: canvas_profile.login_id.split('@')[0] } }, include: [{ association: 'Consents' }, { association: 'Dissents' }] })
  if (!user) {
    res.status(401).json({ msg: "No user with username " + canvas_profile.login_id.split('@')[0] });
  } else if (false && !user.isCanvas()) { // TODO: Enabling this doesn't allow user's with passwords to login with Canvas.  Do we want?
    res.status(401).json({ msg: "Not canvas user" });
  } else {
    await user.update({ canvas_refresh_token: canvas_refresh_token });
    const token = jwt.sign({ user: user}, process.env.JWT_SECRET);
    res.status(200).json({ token });
  }
});

router.post('/register', (req, res) => {
  User.create({
    username: req.body.username,
    first_name: req.body.first,
    last_name: req.body.last,
    email: req.body.email.toLowerCase(),
    password: req.body.password
  }).then(() => {
    res.status(200).json({ msg: "registered" });
  }).catch((err) => {
    console.log("error:" + err);
    res.status(400).json({ msg: err.errors[0].message })
  })
});

router.post('/register-canvas', async (req, res) => {
  const client_id = process.env.VUE_APP_CLIENT_ID;
  const client_secret = process.env.CLIENT_SECRET;
  const redirect_uri = process.env.VUE_APP_CANVAS_REDIRECT_URI;

  // Verify OAuth Code
  let canvas_access_token;
  let canvas_refresh_token;
  try {
    const response = await axios.post(
      'https://canvas.mit.edu/login/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        redirect_uri,
        expires_in: 3600,
        code: req.body.code
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    canvas_access_token = response.data.access_token;
    canvas_refresh_token = response.data.refresh_token;    
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
  } catch (err) {
    console.log("error:" + err);
    res.status(400).json({ msg: err.response?.data?.error_description || "OAuth failed"  })
    return;
  }

  // Get Canvas Profile
  let canvas_profile;
  try {
    const response = await axios.get('https://canvas.mit.edu/api/v1/users/self/profile', {
      headers: {
        Authorization: `Bearer ${canvas_access_token}`
      }
    });
    canvas_profile = response.data;
  } catch (err) {
    console.log("error:" + err);
    res.status(400).json({ msg: err.response?.data?.error_description || "OAuth failed"  })
    return;
  }

  // Create user
  try {
    await User.create({
      username: canvas_profile.login_id.split('@')[0],
      first_name: canvas_profile.sortable_name.split(', ')[1],
      last_name: canvas_profile.sortable_name.split(', ')[0],
      email: canvas_profile.primary_email.toLowerCase(),
      password: "",
      canvas_refresh_token: canvas_refresh_token,
    });
  }
  catch (err) {
    console.log("error:" + err);
    console.log(err.errors[0].message);
    res.status(400).json({ msg: err.errors[0].message })
    return;
  }
 
  // Return NB user
  const user = await User.findOne({ where: { username: { [Op.iLike]: canvas_profile.login_id.split('@')[0] } }, include: [{ association: 'Consents' }, { association: 'Dissents' }] })
  if (!user) {
    res.status(500).json({ msg: "Couldn't create user"});
  }  else {
    const token = jwt.sign({ user: user}, process.env.JWT_SECRET);
    res.status(200).json({ token });
    return;
  }
});

router.get('/refresh-canvas', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ msg: "Cannot find user"});
    }
    await refreshCanvasAccessToken(user, res);
    res.status(200).json({ msg: "Canvas access token refreshed"});
  } catch (err) {
    res.status(500).json({ msg: "Error refreshing Canvas acess token"});
  }
});

router.post('/forgotpassword', (req, res) => {
  var reset_password_id = uuidv4();
  var link = req.headers.origin + "/reset?id=" + reset_password_id;

  User.findOne({ where: { email: { [Op.iLike]: req.body.email } } }).then(function (user) {
    if (!user) {
      res.status(401).json({ msg: "No user with email " + req.body.email });
      return;
    } else if (false && user.isCanvas()) { // TODO: Enabling this doesn't allow Canvas user's to set passwords to their acount.  Do we want?
      res.status(401).json({ msg: "Please use Canvas login" });
      return;
    } else {
      user.update({
        reset_password_id: reset_password_id
      })
      console.log(`Reset passowrd for ${user.username} with link ${link}`);
      var mailOptions = {
        from: 'nb2.mailer@csail.mit.edu',
        to: req.body.email.toLowerCase(),
        subject: 'NB V2 - Forgot Your Password',
        text: 'Hello ' + user.username + '!\n\nYou indicated that you have forgotten your password for NB V2.' +
          '\n\nPlease click on this link to reset your password: \n' + link +
          '\n\nIf you believe that this is a mistake, please contact us or change your password on your user settings page.'
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log("Error sending mail: " + error);
          res.status(400).json({ msg: "Error sending email" })
        } else {
          console.log('Email sent: ' + info.response);
          res.status(200).json({ email: req.body.email });
        }
      });
    }
  });
});

router.put('/editPersonal', passport.authenticate('jwt', { session: false }), (req, res) => {
  // find the current user first
  if (!req.user.id) {
    res.status(200).json(null);
    return null;
  }
  User.findByPk(req.user.id, { attributes: ['id', 'username', 'name'], include: [{ association: 'Consents' }, { association: 'Dissents' }] }).then((user) => {
    if (!user) {
      res.status(401).json({ msg: "Cannot find user " })
    } else {
      user.update({
        first_name: req.body.first,
        last_name: req.body.last,
        email: req.body.email.toLowerCase(),
        username: req.body.username,
      }).then((updatedUser) => {
        const token = jwt.sign({ user: updatedUser }, process.env.JWT_SECRET);
        res.status(200).json({ token });
      }).catch((err) => {
        console.log("error: " + err);
        res.status(400).json({ msg: "Username or email already taken. Please provide another one." })
      })
    }
  });
});

router.put('/editAuth', passport.authenticate('jwt', { session: false }), (req, res) => {
  // find the current user first
  if (!req.user.id) {
    res.status(200).json(null);
    return null;
  }
  User.findByPk(req.user.id, { attributes: ['id', 'username', 'name'] }).then((user) => {
    if (!user) {
      res.status(401).json({ msg: "Cannot find user " })
    } else {
      user.update({
        password: req.body.newpassword,
        reset_password_id: null,
      }).then(() => {
        res.status(200).json({ msg: "editted auth password" })
      }).catch((err) => {
        console.log("error:" + err);
        res.status(400).json({ msg: "Error editting password" })
      })
    }
  });
});

router.post('/logout', passport.authenticate('jwt', { session: false }), (req, res) => {
  try {
    res.clearCookie('canvas_access_token');
    res.clearCookie('is_canvas_user');
    res.status(200).json({ msg: "signed out" }).end();
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error logging out"});
  }
});

module.exports = router;
