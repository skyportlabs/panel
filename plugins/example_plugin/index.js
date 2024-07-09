const express = require('express');
const router = require('./router');

function register(addonManager) {
    console.log('Interactive Desktop Loaded!');
}

module.exports = {
    register,
    router
};
