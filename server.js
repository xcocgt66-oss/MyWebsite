const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// إعدادات البادي وخدمة ملفات المجلد العام public
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPID_API_KEY = '515f7a3162mshb63efcc57b50884p106404jsn51481b32a788';

// ==========================================
// 1. نظام التبديل التلقائي (Fallback Logic)
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
// 2. Football APIs
// ==========================================
app.get('/api/football/:endpoint', async (req, res) => {
    const { endpoint } = req.params;
    const query = req.query;

    const footballApis = [
        {
            method: 'GET',
            url: `https://v3.football.api-sports.io/${endpoint}`,
            headers: { 'x-apisports-key': 'a0094f3392b248423f5ffb12191f90c0' },
            params: query
        },
        {
            method: 'GET',
            url: `https://free-api-live-football-data.p.rapidapi.com/${endpoint}`,
            headers: {
                'X-Rapidapi-Key': RAPID_API_KEY,
                'X-Rapidapi-Host': 'free-api-live-football-data.p.rapidapi.com'
            },
            params: query
        }
    ];

    try {
        const data = await fetchWithFallback(footballApis);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Football APIs are currently down' });
    }
});

// ==========================================
// 3. TikTok APIs
// ==========================================
app.get('/api/tiktok/info', async (req, res) => {
    const { url } = req.query;

    const tiktokApis = [
        {
            method: 'GET',
            url: `https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/rich_response/index`,
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com' },
            params: { url }
        },
        {
            method: 'GET',
            url: `https://tiktok-full-info-without-watermark.p.rapidapi.com/index`,
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'tiktok-full-info-without-watermark.p.rapidapi.com' },
            params: { url }
        },
        {
            method: 'GET',
            url: `https://tiktok-downloader-simple.p.rapidapi.com/tiksnapsave/`,
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'tiktok-downloader-simple.p.rapidapi.com' },
            params: { link: url }
        }
    ];

    try {
        const data = await fetchWithFallback(tiktokApis);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'TikTok APIs are currently down' });
    }
});

// ==========================================
// 4. Live Streams APIs
// ==========================================
app.get('/api/livestream', async (req, res) => {
    const streamApis = [
        {
            method: 'GET',
            url: `https://all-sport-live-stream.p.rapidapi.com/esid`,
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'all-sport-live-stream.p.rapidapi.com' }
        }
    ];

    try {
        const data = await fetchWithFallback(streamApis);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Live Stream API is currently down' });
    }
});

// ==========================================
// 5. YouTube: التحميل في السيرفر والحذف عند الخروج
// ==========================================
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    const userVideoPath = path.join(DOWNLOAD_DIR, `${socket.id}.mp4`);

    socket.on('request_video', async (youtubeUrl) => {
        try {
            const videoStream = ytdl(youtubeUrl, { quality: 'lowest' });
            const writeStream = fs.createWriteStream(userVideoPath);

            videoStream.pipe(writeStream);

            writeStream.on('finish', () => {
                socket.emit('video_ready', `/stream/${socket.id}`);
            });

        } catch (error) {
            socket.emit('video_error', 'حدث خطأ أثناء تحميل الفيديو.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (fs.existsSync(userVideoPath)) {
            fs.unlinkSync(userVideoPath);
            console.log(`Video deleted for user: ${socket.id}`);
        }
    });
});

app.get('/stream/:id', (req, res) => {
    const videoPath = path.join(DOWNLOAD_DIR, `${req.params.id}.mp4`);
    if (fs.existsSync(videoPath)) {
        res.sendFile(videoPath);
    } else {
        res.status(404).send('Video not found or already deleted.');
    }
});

// ضمان توجيه كافة المسارات غير المعرفة إلى index.html لعمل الواجهة
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
