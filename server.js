const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[CRITICAL] Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. نظام تخطي الحظر لـ Guacamole (التحكم عن بعد)
// ==========================================
app.use('/guacamole', createProxyMiddleware({
    target: 'https://a300-84mq.taile627cc.ts.net',
    changeOrigin: true,
    ws: true, // ضروري جداً لبث الشاشة (WebSockets)
    secure: false,
    logLevel: 'error'
}));

// تقديم ملفات الموقع (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// مفاتيح الـ API
const RAPID_API_KEY = 'ضع_مفتاحك_هنا';
const YT_MEDIA_DOWNLOADER_KEY = 'ضع_مفتاحك_هنا';

// إعدادات Guacamole للواجهة
app.get("/api/config", (req, res) => {
    // الواجهة ستتصل بالبروكسي الداخلي الآن لتفادي الحظر
    res.json({ guacamoleUrl: "/guacamole/" });
});

// ==========================================
// 2. نظام الشات المباشر (Socket.io)
// ==========================================
const chatHistory = [];
const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 ساعة

io.on('connection', (socket) => {
    console.log('مستخدم جديد متصل بالشات:', socket.id);
    
    // إرسال السجل القديم للمتصل الجديد
    socket.emit('chat_history', chatHistory);

    // استقبال رسالة جديدة
    socket.on('chat_message', (data) => {
        if (!data || !data.text) return;
        
        const message = {
            user: data.user || 'زائر',
            text: data.text,
            timestamp: Date.now()
        };
        
        chatHistory.push(message);

        // تنظيف الرسائل الأقدم من 24 ساعة
        const now = Date.now();
        while (chatHistory.length > 0 && (now - chatHistory[0].timestamp > CHAT_RETENTION_MS)) {
            chatHistory.shift();
        }

        // إرسال الرسالة للجميع
        io.emit('chat_message', message);
    });
});

// ==========================================
// 3. نظام اليوتيوب (جلب الفيديوهات والبث)
// ==========================================
app.post('/api/youtube', async (req, res) => {
    const { url, quality } = req.body;
    
    if (!url) return res.status(400).json({ success: false, error: 'الرابط مفقود' });

    try {
        // [تنبيه] هذا مثال لاستخدام RapidAPI لجلب روابط يوتيوب
        // ستحتاج لتعديل الرابط (URL) والـ Host حسب الـ API الذي تستخدمه فعلياً في حسابك
        const options = {
            method: 'GET',
            url: 'https://youtube-media-downloader.p.rapidapi.com/v2/video/details', 
            params: { videoId: extractVideoId(url) }, // دالة لاستخراج الآيدي
            headers: {
                'X-RapidAPI-Key': YT_MEDIA_DOWNLOADER_KEY,
                'X-RapidAPI-Host': 'youtube-media-downloader.p.rapidapi.com'
            }
        };

        const response = await axios.request(options);
        
        // استخراج الرابط المباشر للمقطع حسب الجودة المطلوبة (كمثال)
        const directUrl = response.data?.videos?.items[0]?.url || null;

        if (directUrl) {
            res.json({ success: true, title: response.data.title || 'فيديو يوتيوب', sources: [directUrl] });
        } else {
            res.json({ success: false, error: 'لم يتم العثور على روابط تشغيل' });
        }
    } catch (error) {
        console.error('خطأ في API يوتيوب:', error.message);
        res.status(500).json({ success: false, error: 'فشل الاتصال بخادم يوتيوب' });
    }
});

// بروكسي لتشغيل الفيديوهات مباشرة بدون مشاكل Cross-Origin
app.get('/api/stream', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send('رابط مفقود');

    https.get(videoUrl, (stream) => {
        // تمرير الـ Headers الخاصة بحجم الملف والنوع لدعم التقديم والتأخير (Seeking)
        res.set(stream.headers);
        stream.pipe(res);
    }).on('error', (e) => {
        res.status(500).send(e.message);
    });
});

// دالة مساعدة لاستخراج Video ID من روابط يوتيوب
function extractVideoId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=))([^"&?\/\s]{11})/);
    return match ? match[1] : null;
}

// ==========================================
// 4. نظام تيك توك القديم
// ==========================================
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

    if (!url) return res.status(400).json({ error: 'الرجاء توفير رابط صحيح' });

    const tiktokApis = [
        {
            method: 'GET',
            url: 'https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/rich_response/index',
            headers: {
                'X-Rapidapi-Key': RAPID_API_KEY,
                'X-Rapidapi-Host': 'tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com'
            },
            params: { url }
        }
    ];

    try {
        const data = await fetchWithFallback(tiktokApis);
        res.json(data);
    } catch(err) {
        res.status(500).json({ error: 'TikTok APIs are currently down' });
    }
};

app.all('/api/tiktok/info', handleTikTokRequest);
app.all('/api/tiktok', handleTikTokRequest);
app.all('/api/tiktok/play', handleTikTokRequest);
app.all('/api/download', handleTikTokRequest);

// ==========================================
// تشغيل السيرفر
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("SERVER IS ALIVE ON PORT:", PORT);
});
