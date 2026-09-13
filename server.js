const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// منع السيرفر من الانهيار
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection:', reason);
});


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));


// APIs من Railway Variables
const RAPID_API_KEY = process.env.RAPID_API_KEY;
const YT_MEDIA_DOWNLOADER_KEY = process.env.YT_MEDIA_DOWNLOADER_KEY;


// Guacamole config
app.get("/api/config", (req, res) => {
    res.json({
        guacamoleUrl: process.env.GUACAMOLE_URL || ""
    });
});


// --- نظام الشات ---
const chatHistory = [];
const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;


async function fetchWithFallback(apiList) {

    for (let i = 0; i < apiList.length; i++) {

        try {

            const response = await axios(apiList[i]);

            if (response.data)
                return response.data;

        } catch (error) {

            if (i === apiList.length - 1)
                throw new Error('جميع الـ APIs فشلت في الرد.');

        }
    }
}
