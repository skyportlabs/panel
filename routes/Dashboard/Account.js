/**
 * @fileoverview This module sets up administrative routes for managing and monitoring server nodes
 * within the network. It provides functionality to create, delete, and debug nodes, as well as check
 * their current status. User authentication and admin role verification are enforced for access to
 * these routes.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const saltRounds = process.env.SALT_ROUNDS || 10;
const log = new (require('cat-loggr'))();
const { isAuthenticated } = require('../../handlers/auth.js');

async function doesUserExist(username) {
    const users = await db.get('users');
    if (users) {
        return users.some(user => user.username === username);
    } else {
        return false; // If no users found, return false
    }
  }

router.get('/account', async (req, res) => {
  res.render('account', {
    req,
    user: req.user,
    users: await db.get('users') || [], 

    
  });
});

router.get('/accounts', async (req, res) => {
    let users = await db.get('users') || [];
  
    res.send(users);
  });

  router.get('/check-username', async (req, res) => {
    const username = req.query.username;

    if (!username) {
        return res.status(400).send('Username parameter is required.');
    }

    const userExists = await doesUserExist(username);

    res.json({ exists: userExists });
});

router.post('/update-username', isAuthenticated, async (req, res) => {
    const { currentUsername, newUsername } = req.body;

    if (!currentUsername || !newUsername) {
        return res.status(400).send('Current and new username parameters are required.');
    }

    try {
        // Logout the user
        req.logout(async (err) => {
            if (err) {
                //log.error('Error logging out user:', err);
                //return res.status(500).send('Error logging out user.');
                next(err);
            }

            // Now that the user is logged out, proceed with the username update

            // Check if the current username exists
            const userExists = await doesUserExist(currentUsername);
            if (!userExists) {
                return res.status(404).send('Current username does not exist.');
            }

            // Check if the new username already exists
            const newUsernameExists = await doesUserExist(newUsername);
            if (newUsernameExists) {
                return res.status(409).send('New username is already taken.');
            }

            // Update the username in the database
            const users = await db.get('users');
            const updatedUsers = users.map(user => {
                if (user.username === currentUsername) {
                    return { ...user, username: newUsername };
                } else {
                    return user;
                }
            });
            await db.set('users', updatedUsers);

            // Send updated user data back to the client
            res.status(200).json({ success: true, username: newUsername });
        });
    } catch (error) {
        log.error('Error updating username:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/enable-2fa', isAuthenticated, async (req, res) => {
    try {
        const users = await db.get('users');
        const currentUser = users.find(user => user.username === req.user.username);
        const secret = speakeasy.generateSecret({
            length: 20,
            name: `Skyport (${currentUser.username})`,
            issuer: 'Skyport'
        });


        const updatedUsers = users.map(user => {
            if (user.username === req.user.username) {
                return { ...user, twoFASecret: secret.base32, twoFAEnabled: false };
            } else {
                return user;
            }
        });
        await db.set('users', updatedUsers);

        qrcode.toDataURL(secret.otpauth_url, async (err, data_url) => {
            if (err) return res.status(500).send('Error generating QR Code');
            res.render('enable-2fa', {
                req,
                user: req.user,
                users, name: await db.get('name') || 'Skyport',

                qrCode: data_url
            });
        });
    } catch (error) {
        log.error('Error enabling 2FA:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/verify-2fa', isAuthenticated, async (req, res) => {
    try {
        const { token } = req.body;
        const users = await db.get('users');
        const currentUser = users.find(user => user.username === req.user.username);

        const verified = speakeasy.totp.verify({
            secret: currentUser.twoFASecret,
            encoding: 'base32',
            token
        });

        if (verified) {
            const updatedUsers = users.map(user => {
                if (user.username === req.user.username) {
                    return { ...user, twoFAEnabled: true };
                } else {
                    return user;
                }
            });
            await db.set('users', updatedUsers);

            res.redirect('/account?msg=2FAEnabled');
        } else {
            res.status(400).send('Invalid token');
        }
    } catch (error) {
        log.error('Error verifying 2FA:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.post('/disable-2fa', isAuthenticated, async (req, res) => {
    try {
        const users = await db.get('users');

        const updatedUsers = users.map(user => {
            if (user.username === req.user.username) {
                return { ...user, twoFAEnabled: false, twoFASecret: null };
            } else {
                return user;
            }
        });
        await db.set('users', updatedUsers);

        res.redirect('/account');
    } catch (error) {
        log.error('Error disabling 2FA:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.post('/change-password', isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).send('Current and new password parameters are required.');
    }

    try {
        // Get the user's information from the database
        const users = await db.get('users');
        const currentUser = users.find(user => user.username === req.user.username);

        // Check if the current password matches the user's password in the database
        const passwordMatch = await bcrypt.compare(currentPassword, currentUser.password);
        if (!passwordMatch) {
            return res.status(401).send('Current password is incorrect.');
        }

        // Hash the new password
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update the user's password in the database
        const updatedUsers = users.map(user => {
            if (user.username === req.user.username) {
                return { ...user, password: hashedNewPassword };
            } else {
                return user;
            }
        });
        await db.set('users', updatedUsers);
        
        // Log the user out
        req.logout(async (err) => {
            if (err) {
                //log.error('Error logging out user:', err);
                //return res.status(500).send('Error logging out user.');
                next(err);
            }
        });

        // Redirect the user to the login page with a success message
        res.status(200).redirect('/login?err=UpdatedCredentials');
    } catch (error) {
        log.error('Error changing password:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.post('/validate-password', isAuthenticated, async (req, res) => {
    try {
        // Retrieve the password from the request body
        const { currentPassword } = req.body;

        // Get the user's information from the database
        const users = await db.get('users');
        const currentUser = users.find(user => user.username === req.user.username);

        // Check if currentUser exists and contains the hashed password
        if (currentUser && currentUser.password) {
            // Hash the current password using the same salt as the stored password
            const isPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);

            if (isPasswordValid) {
                res.status(200).json({ valid: true });
            } else {
                res.status(200).json({ valid: false });
            }
        } else {
            res.status(404).json({ message: 'User not found or password not available.' });
        }
    } catch (error) {
        log.error('Error validating password:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


module.exports = router;