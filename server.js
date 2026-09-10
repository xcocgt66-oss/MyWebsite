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

// حفظ الشات لمدة 24 ساعة
let chatHistory = [];
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    chatHistory = chatHistory.filter(msg => now - msg.timestamp < TWENTY_FOUR_HOURS);
}, 60 * 60 * 1000);

// TikTok API (Search & Explore)
app.get('/api/tiktok/search', async (req, res) => {
    const query = req.query.q || 'cat';
    try {
        const response = await axios.get(`https://toptik.p.rapidapi.com/search/videos`, {
            params: { query: query, count: 15 },
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'toptik.p.rapidapi.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'فشل البحث في تيك توك' });
    }
});

app.get('/api/tiktok/explore', async (req, res) => {
    try {
        const response = await axios.get(`https://toptik.p.rapidapi.com/feed/explore`, {
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'toptik.p.rapidapi.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'فشل جلب اكسبلور تيك توك' });
    }
});

// Matches API (Free API Live Football Data المضمون 100%)
app.get('/api/matches', async (req, res) => {
    try {
        const response = await axios.get('https://free-api-live-football-data.p.rapidapi.com/schedules-livescores', {
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'free-api-live-football-data.p.rapidapi.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'فشل جلب المباريات من الـ API' });
    }
});

// Socket.io & Chat History
let onlineUsersCount = 0;

io.on('connection', (socket) => {
    onlineUsersCount++;
    io.emit('online-count', onlineUsersCount);

    socket.emit('chat-history', chatHistory);

    socket.on('chat-message', (data) => {
        const messageData = { ...data, timestamp: Date.now() };
        chatHistory.push(messageData);
        io.emit('chat-message', messageData);
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
