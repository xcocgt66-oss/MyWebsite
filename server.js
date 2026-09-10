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

// تخزين رسائل الشات لمدة 24 ساعة
let chatHistory = [];
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    chatHistory = chatHistory.filter(msg => now - msg.timestamp < TWENTY_FOUR_HOURS);
}, 60 * 60 * 1000); // تنظيف كل ساعة

// TikTok API (Search & Explore Feed)
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

// Matches API (Betfair & Diamond Sports Integration)
app.get('/api/matches', async (req, res) => {
    try {
        // جلب الأحداث الرياضية الحية والمستقبلية والمنتهية عبر Betfair API
        const response = await axios.get('https://betfair-sports-casino-live-tv-result-odds.p.rapidapi.com/allSportsId', {
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'betfair-sports-casino-live-tv-result-odds.p.rapidapi.com'
            }
        });
        res.json(response.data);
    } catch (error) {
        // بيانات تجريبية احترافية في حال فشل الـ API لتوضيح الواجهة (منتهية، قادمة، Live)
        res.json([
            { id: 1, name: 'ريال مدريد vs برشلونة', status: 'LIVE', time: 'الدقيقة 74', league: 'الدوري الإسباني', isLive: true },
            { id: 2, name: 'مانشستر سيتي vs ليفربول', status: 'UPCOMING', time: 'تبدأ بعد ساعتين', league: 'الدوري الإنجليزي', isLive: false },
            { id: 3, name: 'بايرن ميونخ vs دورتموند', status: 'FINISHED', time: 'انتهت (2 - 1)', league: 'الدوري الألماني', isLive: false }
        ]);
    }
});

// Socket.io & Chat History
let onlineUsersCount = 0;

io.on('connection', (socket) => {
    onlineUsersCount++;
    io.emit('online-count', onlineUsersCount);

    // إرسال تاريخ الشات للمستخدم الجديد
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
