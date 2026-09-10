const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors'); // مهم جداً لمنع مشاكل الاتصال

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// إعدادات البادي للسماح بقراءة الـ JSON والـ Form Data
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const RAPID_API_KEY = '515f7a3162mshb63efcc57b50884p106404jsn51481b32a788';

// ==========================================
// 1. نظام التبديل التلقائي للـ APIs
// ==========================================
async function fetchWithFallback(apiList) {
    for (let i = 0; i < apiList.length; i++) {
        try {
            console.log(`Trying API ${i + 1}...`);
            const response = await axios(apiList[i]);
            return response.data;
        } catch (error) {
            console.error(`API ${i + 1} Failed: ${error.message}`);
            if (i === apiList.length - 1) throw new Error('All APIs failed to respond.');
        }
    }
}

// ==========================================
// 2. Football APIs (يدعم GET و POST)
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
// 3. TikTok APIs (يدعم GET و POST)
// ==========================================
app.all('/api/tiktok/info', async (req, res) => {
    const url = req.body.url || req.query.url;
    if (!url) return res.status(400).json({ error: 'الرجاء توفير رابط تيك توك' });

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
});

// ==========================================
// 4. YouTube API (لجلب رابط الـ MP4 المباشر للتشغيل)
// ==========================================
app.all('/api/youtube', async (req, res) => {
    const url = req.body.url || req.query.url;
    if (!url) return res.status(400).json({ error: 'الرجاء توفير رابط يوتيوب' });

    try {
        const info = await ytdl.getInfo(url);
        // نختار أفضل جودة متوفرة بصيغة mp4 للتشغيل المباشر
        const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
        
        if (format && format.url) {
            res.json({ success: true, stream_url: format.url, title: info.videoDetails.title });
        } else {
            res.status(404).json({ error: 'لم يتم العثور على صيغة مناسبة للفيديو.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الفيديو من يوتيوب.' });
    }
});

// ==========================================
// 5. Chat & Socket.io Logic
// ==========================================
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // نظام الشات (استلام رسالة وإعادة إرسالها للجميع)
    socket.on('send_message', (messageData) => {
        io.emit('receive_message', messageData);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// ==========================================
// 6. حماية مسارات الـ API من إرجاع HTML
// (هذا هو الحل الجذري لمشكلة الصورة!)
// ==========================================
app.all('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'المسار المطلوب غير موجود في السيرفر. تأكد من الرابط أو طريقة الطلب (GET/POST).' 
    });
});

// ==========================================
// 7. توجيه باقي المسارات لملف الواجهة HTML
// ==========================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
