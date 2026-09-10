const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');
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
    
    if (Array.isArray(url)) url = url[0];
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'الرجاء توفير رابط يوتيوب صحيح' });

    let videoId = url;
    try {
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

    // بدلاً من التوقف عند أول API ينجح، نجرب كل الـ APIs ونجمع كل الروابط الصالحة
    // كخيارات احتياطية (fallback) - إذا تعطل أو خُنق الرابط الأول، الواجهة تنتقل تلقائياً للتالي
    const candidates = [];
    let videoTitle = 'YouTube Video';

    const pushCandidate = (streamUrl) => {
        if (streamUrl && typeof streamUrl === 'string' && !candidates.includes(streamUrl)) {
            candidates.push(streamUrl);
        }
    };

    for (const apiConfig of youtubeApis) {
        try {
            const response = await axios(apiConfig);
            const data = response.data;

            if (data.title && videoTitle === 'YouTube Video') {
                videoTitle = data.title;
            }

            if (data.formats && Array.isArray(data.formats)) {
                // أفضل صيغة (فيديو + صوت مدمج) أولاً
                const combinedFormat = data.formats.find(f => f.url && f.hasVideo !== false && f.hasAudio !== false) ||
                                       data.formats.find(f => f.url && f.mimeType && f.mimeType.includes('video/mp4'));
                pushCandidate(combinedFormat?.url);

                // أضف صيغ mp4 إضافية كخيارات احتياطية إن وُجدت
                data.formats
                    .filter(f => f.url && f.mimeType && f.mimeType.includes('video/mp4'))
                    .slice(0, 3)
                    .forEach(f => pushCandidate(f.url));
            }

            if (data.videos && Array.isArray(data.videos.items) && data.videos.items.length > 0) {
                data.videos.items.slice(0, 2).forEach(item => pushCandidate(item?.url || item?.link));
            }

            pushCandidate(data.link || data.url || data.download_url);
        } catch (err) {
            console.error(`[Error] Endpoint failed: ${apiConfig.url}`, err.message);
        }
    }

    if (candidates.length > 0) {
        return res.json({
            success: true,
            url: candidates[0],
            link: candidates[0],
            sources: candidates,
            title: videoTitle
        });
    }

    return res.status(500).json({ success: false, error: 'تعذر استخراج رابط قابل للتشغيل داخل المشغل من أي مصدر.' });
};

app.all('/api/youtube', handleYoutubeRequest);
app.all('/api/youtube/play', handleYoutubeRequest);
app.all('/api/video', handleYoutubeRequest);
app.all('/api/media', handleYoutubeRequest);

// البروكسي الحقيقي لبث الفيديو أجزاءً بأجزاء (Real-time Chunked Streaming)
app.get('/api/stream', (req, res) => {
    let streamUrl = req.query.url;
    
    if (Array.isArray(streamUrl)) streamUrl = streamUrl[0];
    if (!streamUrl || typeof streamUrl !== 'string') {
        return res.status(400).send('No video URL provided');
    }

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                'Referer': 'https://www.youtube.com/'
            }
        };

        if (range) {
            options.headers['Range'] = range;
        }

        // مهلة زمنية لمنع تعليق الطلب إلى الأبد إذا كان رابط الفيديو "مخنوقاً" (throttled) من طرف يوتيوب
        // أو لم يستجب مصدر الفيديو إطلاقاً - بدون هذا، المشغل يبقى فارغاً بدون أي خطأ ظاهر
        const CONNECT_TIMEOUT_MS = 15000; // مهلة الاتصال الأولي والحصول على الهيدرز
        const STALL_TIMEOUT_MS = 20000;   // مهلة إذا توقف تدفق البيانات بعد بدء البث

        let settled = false;
        let stallTimer = null;

        const failOnce = (message, status = 502) => {
            if (settled) return;
            settled = true;
            if (stallTimer) clearTimeout(stallTimer);
            console.error('[Stream Failure]:', message);
            if (!res.headersSent) {
                res.status(status).json({ error: message });
            } else {
                res.destroy();
            }
        };

        const connectTimer = setTimeout(() => {
            proxyReq.destroy();
            failOnce('انتهت مهلة الاتصال بمصدر الفيديو - الرابط قد يكون منتهي الصلاحية أو مخنوقاً (throttled)', 504);
        }, CONNECT_TIMEOUT_MS);

        const armStallTimer = () => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
                proxyReq.destroy();
                failOnce('توقف بث الفيديو فجأة (stalled) - على الأرجح يوتيوب يقوم بخنق الرابط', 504);
            }, STALL_TIMEOUT_MS);
        };

        const proxyReq = client.request(options, (proxyRes) => {
            clearTimeout(connectTimer);
            settled = true; // وصلنا للهيدرز بنجاح، أي فشل بعد هذا سيُعالج عبر pipe error فقط

            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                proxyRes.resume();
                let nextUrl = proxyRes.headers.location;
                if (nextUrl.startsWith('/')) {
                    nextUrl = `${parsedUrl.protocol}//${parsedUrl.host}${nextUrl}`;
                }
                settled = false;
                return doRequest(nextUrl, redirectCount + 1);
            }

            if (proxyRes.statusCode >= 400) {
                proxyRes.resume();
                return failOnce(`مصدر الفيديو رفض الطلب برمز حالة ${proxyRes.statusCode}`, 502);
            }

            const headersToForward = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'transfer-encoding'];
            headersToForward.forEach(h => {
                if (proxyRes.headers[h]) {
                    res.setHeader(h, proxyRes.headers[h]);
                }
            });
            // يضمن أن المشغل نفس الصفحة يستطيع قراءة البث حتى لو تغير الأصل لاحقاً
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (!proxyRes.headers['content-type']) {
                res.setHeader('content-type', 'video/mp4');
            }

            res.status(proxyRes.statusCode);

            // راقب توقف تدفق البيانات (throttling) - كل جزء بيانات يُعيد ضبط المؤقت
            armStallTimer();
            proxyRes.on('data', () => armStallTimer());
            proxyRes.on('end', () => { if (stallTimer) clearTimeout(stallTimer); });

            proxyRes.pipe(res);

            proxyRes.on('error', (err) => {
                if (stallTimer) clearTimeout(stallTimer);
                console.error('[Stream Pipe Error]:', err.message);
                if (!res.headersSent) res.status(500).send('Stream error');
                else res.destroy();
            });
        });

        proxyReq.on('error', (err) => {
            clearTimeout(connectTimer);
            failOnce(`تعذر الاتصال بمصدر الفيديو: ${err.message}`, 502);
        });

        req.on('close', () => {
            clearTimeout(connectTimer);
            if (stallTimer) clearTimeout(stallTimer);
            proxyReq.destroy();
        });

        proxyReq.end();
    }

    doRequest(streamUrl);
});

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
    res.status(404).json({ error: `API endpoint not found: ` + req.originalUrl });
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('[Error] index.html not found:', err.message);
            if (!res.headersSent) {
                res.status(404).send('ملف index.html غير موجود في مجلد public.');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
