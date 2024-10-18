const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');

const saltRounds = 10;

async function doesUserExist(username) {
  const users = await db.get('users');
  return users ? users.some(user => user.username === username) : false;
}

async function doesEmailExist(email) {
  const users = await db.get('users');
  return users ? users.some(user => user.email === email) : false;
}

router.get('/admin/users', isAdmin, async (req, res) => {
  res.render('admin/users', {
    req,
    user: req.user,
    users: await db.get('users') || []
  });
});

router.post('/users/create', isAdmin, async (req, res) => {
  const { username, email, password, admin, verified } = req.body;

  if (!username || !email || !password) {
    return res.status(400).send('Username, email, and password are required.');
  }

  if (typeof admin !== 'boolean') {
    return res.status(400).send('Admin field must be true or false.');
  }

  const userExists = await doesUserExist(username);
  if (userExists) {
    return res.status(400).send('User already exists.');
  }

  const emailExists = await doesEmailExist(email);
  if (emailExists) {
    return res.status(400).send('Email already exists.');
  }

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const newUser = {
    userId,
    username,
    email,
    password: hashedPassword,
    accessTo: [],
    admin,
    verified: verified || false,
  };

  let users = await db.get('users') || [];
  users.push(newUser);
  await db.set('users', users);

  logAudit(req.user.userId, req.user.username, 'user:create', req.ip);

  res.status(201).send(newUser);
});

router.delete('/user/delete', isAdmin, async (req, res) => {
  const userId = req.body.userId;
  const users = await db.get('users') || [];

  const userIndex = users.findIndex(user => user.userId === userId);

  if (userIndex === -1) {
    return res.status(400).send('The specified user does not exist');
  }

  users.splice(userIndex, 1);
  await db.set('users', users);
  logAudit(req.user.userId, req.user.username, 'user:delete', req.ip);
  res.status(204).send();
});

router.get('/admin/users/edit/:userId', isAdmin, async (req, res) => {
  const userId = req.params.userId;
  const users = await db.get('users') || [];
  const user = users.find(user => user.userId === userId);

  if (!user) {
    return res.status(404).send('User not found');
  }

  res.render('admin/edit-user', {
    req,
    user: req.user,
    editUser: user,
  });
});

router.post('/admin/users/edit/:userId', isAdmin, async (req, res, next) => {
  const userId = req.params.userId;
  const { username, email, password, admin, verified } = req.body;

  if (!username || !email) {
    return res.status(400).send('Username and email are required.');
  }

  const users = await db.get('users') || [];
  const userIndex = users.findIndex(user => user.userId === userId);

  if (userIndex === -1) {
    return res.status(404).send('User not found');
  }

  const userExists = users.some(user => user.username === username && user.userId !== userId);
  const emailExists = users.some(user => user.email === email && user.userId !== userId);

  if (userExists) {
    return res.status(400).send('Username already exists.');
  }

  if (emailExists) {
    return res.status(400).send('Email already exists.');
  }

  users[userIndex].username = username;
  users[userIndex].email = email;
  users[userIndex].admin = admin === 'true';
  users[userIndex].verified = verified === 'true';

  if (password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    users[userIndex].password = hashedPassword;
  }

  await db.set('users', users);

  logAudit(req.user.userId, req.user.username, 'user:edit', req.ip);

  if (req.user.userId === userId) {
    return req.logout(err => {
      if (err) return next(err);
      res.redirect('/login?err=UpdatedCredentials');
    });
  }

  res.redirect('/admin/users');
});

module.exports = router;