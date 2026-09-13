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

process.on('unhandledRejection', (reason) => {
    console.error('[CRITICAL] Unhandled Rejection:', reason);
});


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));


// API KEYS
const RAPID_API_KEY = 'ضع_مفتاحك_هنا';
const YT_MEDIA_DOWNLOADER_KEY = 'ضع_مفتاحك_هنا';


// Guacamole
app.get("/api/config", (req, res) => {
    res.json({
        guacamoleUrl:
        "https://a300-84mq.taile627cc.ts.net/guacamole/"
    });
});


// Chat
const chatHistory = [];
const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;


async function fetchWithFallback(apiList) {

    for (let i = 0; i < apiList.length; i++) {

        try {

            const response = await axios(apiList[i]);

            if (response.data)
                return response.data;

        } catch (error) {

            if (i === apiList.length - 1)
                throw new Error('جميع الـ APIs فشلت في الرد.');

        }
    }
}


// TikTok
const handleTikTokRequest = async (req, res) => {

    let url =
    req.body.url ||
    req.query.url ||
    req.body.link ||
    req.query.link;


    if (Array.isArray(url))
        url = url[0];


    if (!url)
        return res.status(400).json({
            error:'الرجاء توفير رابط صحيح'
        });


    const tiktokApis = [
        {
            method:'GET',
            url:'https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/rich_response/index',
            headers:{
                'X-Rapidapi-Key':RAPID_API_KEY,
                'X-Rapidapi-Host':'tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com'
            },
            params:{url}
        }
    ];


    try {

        const data = await fetchWithFallback(tiktokApis);

        res.json(data);


    } catch(err){

        res.status(500).json({
            error:'TikTok APIs are currently down'
        });

    }

};


app.all('/api/tiktok/info', handleTikTokRequest);
app.all('/api/tiktok', handleTikTokRequest);
app.all('/api/tiktok/play', handleTikTokRequest);
app.all('/api/download', handleTikTokRequest);


const PORT = process.env.PORT || 3000;

console.log("ABOUT TO START SERVER ON PORT:", PORT);

server.listen(PORT, "0.0.0.0", () => {
    console.log("SERVER IS ALIVE ON PORT:", PORT);
});
