const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// منع السيرفر من الانهيار (Crash) عند حدوث أخطاء غير متوقعة
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
    
    // حماية السيرفر من القيم غير النصية
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
    
    // حماية السيرفر من القيم المزدوجة (Arrays) أو الفارغة
    if (Array.isArray(url)) url = url[0];
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'الرجاء توفير رابط يوتيوب صحيح' });

    let videoId = url;
    try {
        // حماية الـ Index عند قص الرابط (تجنب Crash السيرفر)
        if (url.includes('v=')) {
            const splitV = url.split('v=');
            if (splitV.length > 1) {
                videoId = splitV[1].split('&')[0];
            }
        } else if (url.includes('youtu.be/')) {
            const splitBe = url.split('youtu.be/');
            if (splitBe.length > 1) {
                videoId = splitBe[1].split('?')[0];
            }
        } else if (url.includes('shorts/')) {
            const splitShorts = url.split('shorts/');
            if (splitShorts.length > 1) {
                videoId = splitShorts[1].split('?')[0];
            }
        }
    } catch (err) {
        console.error('[Regex/Index Error]', err.message);
    }

    const youtubeApis = [
        {
            method: 'GET',
            url: 'https://yt-api.p.rapidapi.com/dl',
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'yt-api.p.rapidapi.com' },
            params: { id: videoId }
        },
        {
            method: 'GET',
            url: 'https://youtube-media-downloader.p.rapidapi.com/v2/video/details',
            headers: { 'X-Rapidapi-Key': RAPID_API_KEY, 'X-Rapidapi-Host': 'youtube-media-downloader.p.rapidapi.com' },
            params: { url: `https://www.youtube.com/watch?v=${videoId}` }
        }
    ];

    for (const apiConfig of youtubeApis) {
        try {
            const response = await axios(apiConfig);
            const data = response.data;
            let streamUrl = '';
            let videoTitle = data.title || 'YouTube Video';

            if (data.formats && Array.isArray(data.formats)) {
                const combinedFormat = data.formats.find(f => f.url && f.hasVideo !== false && f.hasAudio !== false) ||
                                       data.formats.find(f => f.url && f.mimeType && f.mimeType.includes('video/mp4'));
                if (combinedFormat) {
                    streamUrl = combinedFormat.url;
                }
            }

            if (!streamUrl && data.videos && Array.isArray(data.videos.items) && data.videos.items.length > 0) {
                const item = data.videos.items[0];
                streamUrl = item?.url || item?.link;
            }

            if (!streamUrl) {
                streamUrl = data.link || data.url || data.download_url;
            }

            if (streamUrl) {
                return res.json({
                    success: true,
                    url: streamUrl,
                    link: streamUrl,
                    title: videoTitle
                });
            }
        } catch (err) {
            console.error(`[Error] Endpoint failed: ${apiConfig.url}`, err.message);
        }
    }

    return res.status(500).json({ success: false, error: 'تعذر استخراج رابط قابل للتشغيل داخل المشغل.' });
};

app.all('/api/youtube', handleYoutubeRequest);
app.all('/api/youtube/play', handleYoutubeRequest);
app.all('/api/video', handleYoutubeRequest);
app.all('/api/media', handleYoutubeRequest);

// البروكسي الخاص بتخطي حماية يوتيوب (مؤمن)
app.get('/api/stream', async (req, res) => {
    let streamUrl = req.query.url;
    
    if (Array.isArray(streamUrl)) streamUrl = streamUrl[0];
    if (!streamUrl || typeof streamUrl !== 'string') return res.status(400).send('No video URL provided');

    try {
        const range = req.headers.range;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com/'
        };

        if (range) {
            headers['Range'] = range;
        }

        const response = await axios({
            method: 'GET',
            url: streamUrl,
            responseType: 'stream',
            headers: headers,
            validateStatus: status => status >= 200 && status < 400
        });

        const headersToForward = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
        headersToForward.forEach(h => {
            if (response.headers[h]) {
                res.setHeader(h, response.headers[h]);
            }
        });
        res.status(response.status);

        response.data.pipe(res);

        req.on('close', () => {
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });

    } catch (error) {
        console.error('[Stream Proxy Error]', error.message);
        if (!res.headersSent) res.status(500).send('Streaming error');
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

// حماية مسار الـ index.html من التسبب في Crash
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('[Error] index.html not found:', err.message);
            if (!res.headersSent) {
                res.status(404).send('ملف index.html غير موجود في مجلد public، يرجى التأكد من رفع الملفات بشكل صحيح.');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
