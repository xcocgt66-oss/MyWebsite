const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPID_API_KEY = '515f7a3162mshb63efcc57b50884p106404jsn51481b32a788';

// 1. YouTube / Custom API endpoint
app.get('/api/youtube', (req, res) => {
    // يمكنك جلب الفيديوهات المضافة أو تخزينها هنا
    res.json([]);
});

// 2. TikTok API endpoint (using toptik.p.rapidapi.com)
app.get('/api/tiktok', async (req, res) => {
    const userId = req.query.userId || 'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM';
    try {
        const response = await axios.get(`https://toptik.p.rapidapi.com/v1/users/${userId}/videos`, {
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'toptik.p.rapidapi.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'فشل جلب بيانات تيك توك' });
    }
});

// 3. Matches API endpoint (Betfair / Diamond Sports)
app.get('/api/matches', async (req, res) => {
    try {
        // مثال لاستخدام جلب الأحداث من Betfair API
        const response = await axios.get('https://betfair-sports-casino-live-tv-result-odds.p.rapidapi.com/allSportsId', {
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'betfair-sports-casino-live-tv-result-odds.p.rapidapi.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'فشل جلب بيانات المباريات' });
    }
});

// إدارة الـ Socket وعداد المتصلين
let onlineUsersCount = 0;

io.on('connection', (socket) => {
    onlineUsersCount++;
    io.emit('online-count', onlineUsersCount);

    socket.on('chat-message', (data) => {
        io.emit('chat-message', data);
    });

    socket.on('disconnect', () => {
        onlineUsersCount = Math.max(0, onlineUsersCount - 1);
        io.emit('online-count', onlineUsersCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
