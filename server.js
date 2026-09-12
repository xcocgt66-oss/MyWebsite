const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const RAPID_API_KEY = '515f7a3162mshb63efcc57b50884p106404jsn51481b32a788';
const YT_MEDIA_DOWNLOADER_KEY = '29d69a66b8mshfb03616392e2290p1d3431jsn75b74534c75b';

// --- نظام الشات (حفظ لمدة 24 ساعة) ---
const chatHistory = [];
const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 ساعة

async function fetchWithFallback(apiList) {
    for (let i = 0; i < apiList.length; i++) {
        try {
            const response = await axios(apiList[i]);
            if (response.data) return response.data;
        } catch (error) {
            if (i === apiList.length - 1) throw new Error('جميع الـ APIs فشلت في الرد.');
        }
    }
}

const handleTikTokRequest = async (req, res) => {
    let url = req.body.url || req.query.url || req.body.link || req.query.link;
    if (Array.isArray(url)) url = url[0]; 
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'الرجاء توفير رابط صحيح' });

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
    let url = req.body.url || req.query.url;
    let requestedQuality = req.body.quality || req.query.quality || '1080';
    
    if (Array.isArray(url)) url = url[0];
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'الرجاء توفير رابط يوتيوب صحيح' });

    let videoId = url;
    try {
        if (url.includes('v=')) {
            videoId = url.split('v=')[1].split('&')[0];
        } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
        } else if (url.includes('shorts/')) {
            videoId = url.split('shorts/')[1].split('?')[0];
        }
    } catch (err) {
        console.error('[Regex/Index Error]', err.message);
    }

    const candidates = [];
    let videoTitle = 'YouTube Video';

    const pushCandidate = (streamUrl) => {
        if (streamUrl && typeof streamUrl === 'string' && !candidates.includes(streamUrl)) {
            candidates.push(streamUrl);
        }
    };

    // 1. استخدام مسار API الجديد (get_available_quality ثم download_video)
    try {
        // ملاحظة: الرابط هنا افتراضي، إذا كان الـ API الجديد له دومين مختلف، عدله في السطرين تحت
        const qualityRes = await axios.get('https://youtube-media-downloader.p.rapidapi.com/v2/video/details', {
            headers: { 'X-Rapidapi-Key': YT_MEDIA_DOWNLOADER_KEY, 'X-Rapidapi-Host': 'youtube-media-downloader.p.rapidapi.com' },
            params: { videoId: videoId }
        });

        if (qualityRes.data && qualityRes.data.title) videoTitle = qualityRes.data.title;

        // استخراج quality id الخاص بـ 1080p
        if (qualityRes.data && qualityRes.data.formats) {
            let formats = qualityRes.data.formats;
            
            // محاولة العثور على 1080p
            let selectedFormat = formats.find(f => f.quality === '1080p' || f.height == 1080) 
                              || formats.find(f => f.quality === `${requestedQuality}p` || f.height == requestedQuality)
                              || formats.find(f => f.hasVideo && f.hasAudio);

            if (selectedFormat && selectedFormat.url) {
                // إذا كان الـ API يرجع الرابط مباشرة
                pushCandidate(selectedFormat.url);
            } else if (selectedFormat && selectedFormat.id) {
                // إذا كان يحتاج خطوة download_video (نفذها هنا)
                /* 
                const downloadRes = await axios.get('YOUR_DOWNLOAD_VIDEO_API_URL', {
                    headers: { 'X-Rapidapi-Key': RAPID_API_KEY },
                    params: { videoId: videoId, quality_id: selectedFormat.id }
                });
                if (downloadRes.data && downloadRes.data.url) pushCandidate(downloadRes.data.url);
                */
            }
        }
    } catch (err) {
        console.error('[New API Flow Failed, fallback to old APIs]', err.message);
    }

    // 2. الفولباك للـ APIs القديمة في حال فشل الجديد أو لم يستخرج رابط
    const youtubeApis = [
        {
            method: 'GET',
            url: 'https://youtube-media-downloader.p.rapidapi.com/v2/video/details',
            headers: { 'Content-Type': 'application/json', 'x-rapidapi-key': YT_MEDIA_DOWNLOADER_KEY, 'x-rapidapi-host': 'youtube-media-downloader.p.rapidapi.com' },
            params: { videoId: videoId }
        },
        {
            method: 'GET',
            url: 'https://yt-api.p.rapidapi.com/dl',
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'yt-api.p.rapidapi.com' },
            params: { id: videoId }
        }
    ];

    for (const apiConfig of youtubeApis) {
        try {
            const response = await axios(apiConfig);
            const data = response.data;
            if (data.title && videoTitle === 'YouTube Video') videoTitle = data.title;

            if (data.formats && Array.isArray(data.formats)) {
                // فلترة للبحث عن الجودة الأقرب للـ 1080p
                const targetFmt = data.formats.find(f => f.height == 1080 && f.hasAudio !== false) || 
                                  data.formats.find(f => f.hasVideo !== false && f.hasAudio !== false);
                pushCandidate(targetFmt?.url);

                data.formats.filter(f => f.url && f.mimeType && f.mimeType.includes('video/mp4')).slice(0, 3).forEach(f => pushCandidate(f.url));
            }
            if (data.videos && Array.isArray(data.videos.items)) {
                data.videos.items.slice(0, 2).forEach(item => pushCandidate(item?.url || item?.link));
            }
            pushCandidate(data.link || data.url || data.download_url);
        } catch (err) {}
    }

    if (candidates.length > 0) {
        return res.json({ success: true, url: candidates[0], link: candidates[0], sources: candidates, title: videoTitle });
    }
    return res.status(500).json({ success: false, error: 'تعذر استخراج رابط من أي مصدر.' });
};

app.all('/api/youtube', handleYoutubeRequest);
app.all('/api/youtube/play', handleYoutubeRequest);
app.all('/api/video', handleYoutubeRequest);
app.all('/api/media', handleYoutubeRequest);

// --- إزالة الـ Timeout وحل مشكلة Aborted ---
app.get('/api/stream', (req, res) => {
    let streamUrl = req.query.url;
    if (Array.isArray(streamUrl)) streamUrl = streamUrl[0];
    if (!streamUrl || typeof streamUrl !== 'string') return res.status(400).send('No URL provided');

    const range = req.headers.range;

    function doRequest(targetUrl, redirectCount = 0) {
        if (redirectCount > 5) {
            if (!res.headersSent) res.status(500).send('Too many redirects');
            return;
        }

        const client = targetUrl.startsWith('https') ? https : http;
        const parsedUrl = new URL(targetUrl);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (targetUrl.startsWith('https') ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'Referer': 'https://www.youtube.com/'
            }
        };

        if (range) options.headers['Range'] = range;

        const proxyReq = client.request(options, (proxyRes) => {
            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                proxyRes.resume();
                let nextUrl = proxyRes.headers.location;
                if (nextUrl.startsWith('/')) nextUrl = `${parsedUrl.protocol}//${parsedUrl.host}${nextUrl}`;
                return doRequest(nextUrl, redirectCount + 1);
            }

            if (proxyRes.statusCode >= 400) {
                proxyRes.resume();
                if (!res.headersSent) res.status(proxyRes.statusCode).send('Upstream error');
                return;
            }

            const headersToForward = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
            headersToForward.forEach(h => { if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]); });
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            res.status(proxyRes.statusCode);
            proxyRes.pipe(res);

            proxyRes.on('error', (err) => {
                // إغلاق هادئ بدون انهيار
                if (!res.headersSent) res.status(500).end();
                else res.end();
            });
        });

        proxyReq.on('error', (err) => {
            if (!res.headersSent) res.status(502).end();
        });

        // حل مشكلة Aborted: عند إغلاق المتصفح نقطع الاتصال بهدوء
        req.on('close', () => {
            proxyReq.destroy();
        });
        
        req.on('error', () => {
            proxyReq.destroy();
        });

        proxyReq.end();
    }

    doRequest(streamUrl);
});

io.on('connection', (socket) => {
    // إرسال السجل القديم للمتصل الجديد
    socket.emit('chat_history', chatHistory);

    socket.on('chat_message', (msg) => {
        msg.timestamp = Date.now();
        chatHistory.push(msg);

        // مسح الرسائل التي مر عليها 24 ساعة
        const now = Date.now();
        while (chatHistory.length > 0 && (now - chatHistory[0].timestamp) > CHAT_RETENTION_MS) {
            chatHistory.shift(); // يحذف أقدم رسالة
        }

        io.emit('chat_message', msg);
    });
});

app.all('/api/*', (req, res) => res.status(404).json({ error: `Not found` }));

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) res.status(404).send('index.html not found');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
