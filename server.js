const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
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

const handleYoutubeRequest = async (req, res) => {
    const url = req.body.url || req.query.url;
    const quality = req.body.quality || req.query.quality || '480';

    if (!url) return res.status(400).json({ error: 'الرجاء توفير رابط يوتيوب' });

    // استخراج Video ID من الرابط
    let videoId = url;
    if (url.includes('v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    } else if (url.includes('shorts/')) {
        videoId = url.split('shorts/')[1]?.split('?')[0];
    }

    // 1. استخدام API الرئيسي المحدد
    try {
        console.log(`[YouTube API] Fetching video ID: ${videoId} with quality: ${quality}`);
        const response = await axios.get(
            `https://youtube-video-fast-downloader-24-7.p.rapidapi.com/download_audio/${videoId}`,
            {
                params: { quality: quality },
                headers: {
                    'X-Rapidapi-Key': RAPID_API_KEY,
                    'X-Rapidapi-Host': 'youtube-video-fast-downloader-24-7.p.rapidapi.com',
                    'Content-Type': 'application/json'
                },
                timeout: 1500000
            }
        );

        const data = response.data;
        const mediaUrl = data.link || data.url || data.download_url || data.stream_url;

        if (mediaUrl) {
            console.log(`[Success] Retrieved direct stream with requested quality (${quality}p)`);
            return res.json({
                success: true,
                url: mediaUrl,
                link: mediaUrl,
                stream_url: mediaUrl,
                file: mediaUrl,
                title: data.title || `YouTube Video (${quality}p)`
            });
        }
    } catch (err) {
        console.error('[Error] Main Fast Downloader API failed:', err.message);
    }

    // 2. المحاولة الاحتياطية في حال تعثر الـ API الرئيسي
    console.log('[Info] Falling back to secondary RapidAPI endpoints...');
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
            params: { id: videoId }
        }
    ];

    try {
        const data = await fetchWithFallback(youtubeApis);
        let fallbackUrl = '';

        if (Array.isArray(data.formats) && data.formats.length > 0) {
            const playable = data.formats.filter(f => f.url && f.hasAudio !== false);
            if (playable.length > 0) fallbackUrl = playable[0].url;
        }

        if (!fallbackUrl) {
            fallbackUrl = data.link || data.url;
        }

        if (!fallbackUrl) {
            return res.json({ success: false, error: 'لم نجد رابط لمشاهدة هذا الفيديو.' });
        }

        res.json({
            success: true,
            url: fallbackUrl,
            link: fallbackUrl,
            stream_url: fallbackUrl,
            file: fallbackUrl,
            title: data.title || 'YouTube Video'
        });
    } catch (error) {
        console.error("Youtube API Error:", error.message);
        res.status(500).json({ error: 'حدث خطأ أثناء الاتصال بالـ API.' });
    }
};

app.all('/api/youtube', handleYoutubeRequest);
app.all('/api/youtube/play', handleYoutubeRequest);
app.all('/api/video', handleYoutubeRequest);
app.all('/api/media', handleYoutubeRequest);

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

io.on('connection', (socket) => {
    socket.on('send_message', (messageData) => {
        io.emit('receive_message', messageData);
    });

    socket.on('chat_message', (msg) => {
        io.emit('chat_message', msg);
    });
});

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
