const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const RAPID_API_KEY = '515f7a3162mshb63efcc57b50884p106404jsn51481b32a788';

async function fetchWithFallback(apiList) {
    for (let i = 0; i < apiList.length; i++) {
        try {
            const response = await axios(apiList[i]);
            return response.data;
        } catch (error) {
            if (i === apiList.length - 1) throw new Error('All APIs failed to respond.');
        }
    }
}

// ==========================================
// 1. مسارات التيك توك وتحميل الفيديوهات
// ==========================================
const handleTikTokRequest = async (req, res) => {
    const url = req.body.url || req.query.url || req.body.link || req.query.link;
    if (!url) return res.status(400).json({ error: 'الرجاء توفير الرابط' });

    const tiktokApis = [
        { method: 'GET', url: `https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/rich_response/index`, headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com' }, params: { url } },
        { method: 'GET', url: `https://tiktok-full-info-without-watermark.p.rapidapi.com/index`, headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'tiktok-full-info-without-watermark.p.rapidapi.com' }, params: { url } }
    ];

    try {
        const data = await fetchWithFallback(tiktokApis);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'TikTok APIs are currently down' });
    }
};

app.all('/api/tiktok/info', handleTikTokRequest);
app.all('/api/tiktok', handleTikTokRequest);
app.all('/api/tiktok/play', handleTikTokRequest);
app.all('/api/download', handleTikTokRequest);

// مسار بحث تيك توك الشامل (يدعم تحديد النوع: user, video, live, general, photo, others)
app.all('/api/tiktok/search', async (req, res) => {
    const keyword = req.query.keyword || req.body.keyword;
    const searchType = req.query.type || req.body.type || 'general'; // نوع البحث الافتراضي
    
    if (!keyword) return res.status(400).json({ error: 'الرجاء إدخال الكلمة المفتاحية للبحث' });

    // مطابقة تامة لمسارات api23 الصحيحة
    let endpoint = 'search-general';
    if (searchType === 'user' || searchType === 'account') endpoint = 'search-user';
    else if (searchType === 'video') endpoint = 'search-video';
    else if (searchType === 'live') endpoint = 'search-live';
    else if (searchType === 'photo') endpoint = 'search-photo';
    else if (searchType === 'others') endpoint = 'others-searched-for';

    try {
        const response = await axios({
            method: 'GET',
            url: `https://tiktok-api23.p.rapidapi.com/api/search/${endpoint}`,
            headers: {
                'X-Rapidapi-Key': RAPID_API_KEY,
                'X-Rapidapi-Host': 'tiktok-api23.p.rapidapi.com'
            },
            params: { keyword, count: 20 }
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'فشل تنفيذ البحث، تأكد من صحة الكلمة أو نوع البحث.' });
    }
});

// ==========================================
// 2. مسارات اليوتيوب والفيديو (جودة عالية 720p+)
// ==========================================
const handleYoutubeRequest = async (req, res) => {
    const url = req.body.url || req.query.url;
    if (!url) return res.status(400).json({ error: 'الرجاء توفير رابط يوتيوب' });

    const youtubeApis = [
        {
            method: 'GET',
            url: 'https://youtube-media-downloader.p.rapidapi.com/v2/video/details',
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'youtube-media-downloader.p.rapidapi.com' },
            params: { url: url }
        },
        {
            method: 'GET',
            url: 'https://yt-api.p.rapidapi.com/dl',
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'yt-api.p.rapidapi.com' },
            params: { id: url.includes('shorts/') ? url.split('shorts/')[1].split('?')[0] : url.split('v=')[1]?.split('&')[0] }
        }
    ];

    try {
        const data = await fetchWithFallback(youtubeApis);
        let mediaUrl = '';
        if (data.formats && Array.isArray(data.formats)) {
            const hdFormat = data.formats.find(f => f.quality === '720p' || f.height >= 720) || data.formats[0];
            mediaUrl = hdFormat?.url || '';
        }
        if (!mediaUrl) {
            mediaUrl = data.link || data.url || data.videos?.items?.[0]?.url || data.audio?.[0]?.url || '';
        }
        
        res.json({
            success: true,
            url: mediaUrl,
            link: mediaUrl,
            stream_url: mediaUrl,
            file: mediaUrl,
            quality: '720p+',
            title: data.title || 'YouTube Video',
            data: data
        });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الفيديو بجودة عالية.' });
    }
};

app.all('/api/youtube', handleYoutubeRequest);
app.all('/api/youtube/play', handleYoutubeRequest);
app.all('/api/video', handleYoutubeRequest);
app.all('/api/media', handleYoutubeRequest);

// ==========================================
// 3. مسارات كرة القدم
// ==========================================
app.all('/api/football/:endpoint', async (req, res) => {
    const { endpoint } = req.params;
    const query = req.method === 'POST' ? req.body : req.query;

    const footballApis = [
        { method: 'GET', url: `https://v3.football.api-sports.io/${endpoint}`, headers: { 'x-apisports-key': 'a0094f3392b248423f5ffb12191f90c0' }, params: query },
        { method: 'GET', url: `https://free-api-live-football-data.p.rapidapi.com/${endpoint}`, headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'free-api-live-football-data.p.rapidapi.com' }, params: query }
    ];

    try {
        const data = await fetchWithFallback(footballApis);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Football APIs are currently down' });
    }
});

// ==========================================
// 4. نظام الشات الذكي (إصلاح المتصلين و منع undefined)
// ==========================================
const connectedUsers = {};

io.on('connection', (socket) => {
    // تسجيل المستخدم تلقائياً فور دخوله لتجنب 0 متصلين وتجنب undefined
    const defaultName = `User_${socket.id.substring(0, 4)}`;
    connectedUsers[socket.id] = { id: socket.id, name: defaultName };

    // تحديث قائمة المتصلين للجميع فوراً
    io.emit('online_users', Object.values(connectedUsers));
    io.emit('update_online_users', Object.values(connectedUsers));

    // استقبال وتحديث الاسم الحقيقي إذا أرسلته الواجهة
    socket.on('set_username', (name) => {
        if (name && name !== 'undefined' && name.trim() !== '') {
            connectedUsers[socket.id].name = name.trim();
            io.emit('online_users', Object.values(connectedUsers));
            io.emit('update_online_users', Object.values(connectedUsers));
        }
    });

    // معالجة الرسائل ومنع ظهور undefined في اسم المرسل
    const processMessage = (data) => {
        let msgObj = {};
        if (typeof data === 'object' && data !== null) {
            msgObj = { ...data };
            if (!msgObj.user || msgObj.user === 'undefined') msgObj.user = connectedUsers[socket.id]?.name || defaultName;
            if (!msgObj.username || msgObj.username === 'undefined') msgObj.username = msgObj.user;
        } else {
            msgObj = {
                user: connectedUsers[socket.id]?.name || defaultName,
                username: connectedUsers[socket.id]?.name || defaultName,
                message: String(data),
                text: String(data),
                time: new Date().toLocaleTimeString()
            };
        }
        io.emit('chat_message', msgObj);
        io.emit('receive_message', msgObj);
    };

    socket.on('chat_message', processMessage);
    socket.on('send_message', processMessage);

    socket.on('disconnect', () => {
        delete connectedUsers[socket.id];
        io.emit('online_users', Object.values(connectedUsers));
        io.emit('update_online_users', Object.values(connectedUsers));
    });
});

// ==========================================
// 5. الحماية والتوجيه
// ==========================================
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
