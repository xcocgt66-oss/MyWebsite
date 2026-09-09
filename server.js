const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// CONFIG
// ======================================================
const PORT = process.env.PORT || 3000;
const MEDIA_DIR = path.join(__dirname, "temp_media");

// ======================================================
// RAPIDAPI
// ======================================================
const RAPIDAPI_KEY = "515f7a3162mshb63efcc57b50884p106404jsn51481b32a788";
const YOUTUBE_HOST = "youtube-media-downloader.p.rapidapi.com";
const YOUTUBE_SEARCH_HOST = "youtube-v2.p.rapidapi.com";
const TIKTOK_SEARCH_HOST = "tiktok-api6.p.rapidapi.com";

// ======================================================
// TEMP DIRECTORY
// ======================================================
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// ======================================================
// TEMP FILE CLEANUP
// ======================================================
const MAX_FILE_AGE = 10 * 60 * 1000;

function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(MEDIA_DIR);
        for (const file of files) {
            const filePath = path.join(MEDIA_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (Date.now() - stat.mtimeMs > MAX_FILE_AGE) {
                    fs.unlinkSync(filePath);
                    console.log("🗑️ Deleted old file:", file);
                }
            } catch (err) {}
        }
    } catch (err) {
        console.error("Cleanup error:", err.message);
    }
}
setInterval(cleanupOldFiles, 60 * 1000);

// ======================================================
// HELPERS
// ======================================================
function createFileName() {
    return crypto.randomBytes(20).toString("hex") + ".mp4";
}

function getSafeFileName(file) {
    return path.basename(file);
}

function getYouTubeVideoId(input) {
    try {
        const url = new URL(input);
        if (url.hostname.includes("youtube.com")) {
            const videoId = url.searchParams.get("v");
            if (videoId) return videoId;
            const shorts = url.pathname.match(/\/shorts\/([^/?]+)/);
            if (shorts) return shorts[1];
            const embed = url.pathname.match(/\/embed\/([^/?]+)/);
            if (embed) return embed[1];
        }
        if (url.hostname === "youtu.be") {
            return url.pathname.replace("/", "").split("?")[0];
        }
    } catch (err) {
        // If it's just an ID
        if (input && !input.includes("/") && !input.includes(" ")) return input;
    }
    return null;
}

// ======================================================
// DOWNLOAD URL TO SERVER
// ======================================================
async function downloadVideo(url) {
    const fileName = createFileName();
    const filePath = path.join(MEDIA_DIR, fileName);

    console.log("⬇️ Downloading video... URL:", url.substring(0, 150));

    const response = await axios({
        method: "GET",
        url: url,
        responseType: "stream",
        timeout: 180000,
        maxRedirects: 10,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
            "Accept": "*/*"
        }
    });

    const writer = fs.createWriteStream(filePath);

    try {
        await new Promise((resolve, reject) => {
            response.data.pipe(writer);
            writer.on("finish", resolve);
            writer.on("error", reject);
            response.data.on("error", reject);
        });
    } catch (err) {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
        throw err;
    }

    const stat = fs.statSync(filePath);
    console.log("✅ Video saved:", fileName, "| 📦 Size:", (stat.size / 1024 / 1024).toFixed(2), "MB");
    return fileName;
}

// ======================================================
// FIND MEDIA OBJECTS
// ======================================================
function collectMediaObjects(value, output = []) {
    if (!value) return output;
    if (Array.isArray(value)) {
        for (const item of value) collectMediaObjects(item, output);
        return output;
    }
    if (typeof value !== "object") return output;

    const url = value.url || value.downloadUrl || value.download_url || value.videoUrl || value.video_url || value.streamUrl || value.stream_url || value.playUrl || value.play_url;
    
    if (typeof url === "string" && url.startsWith("http")) {
        output.push({
            url: url,
            quality: value.quality || value.qualityLabel || value.resolution || "",
            mimeType: value.mimeType || value.mime || value.type || "",
            width: Number(value.width || 0),
            height: Number(value.height || 0),
            hasAudio: value.hasAudio !== undefined ? Boolean(value.hasAudio) : true
        });
    }

    for (const key of Object.keys(value)) {
        collectMediaObjects(value[key], output);
    }
    return output;
}

function chooseVideo(data) {
    const media = collectMediaObjects(data);
    const unique = Array.from(new Map(media.map(item => [item.url, item])).values());
    console.log("🎬 Found media:", unique.length);

    const mp4 = unique.filter(item => {
        const url = item.url.toLowerCase();
        const mime = String(item.mimeType).toLowerCase();
        return url.includes(".mp4") || mime.includes("video/mp4");
    });

    const candidates = mp4.length ? mp4 : unique;

    candidates.sort((a, b) => {
        const audioA = a.hasAudio ? 1 : 0;
        const audioB = b.hasAudio ? 1 : 0;
        if (audioA !== audioB) return audioB - audioA;
        return (b.height || 0) - (a.height || 0);
    });

    return candidates[0]?.url || null;
}

// ======================================================
// EXTRACT TIKTOK SEARCH DATA
// ======================================================
function extractTikTokSearch(data, output = []) {
    if (!data) return output;
    if (Array.isArray(data)) {
        for (const item of data) extractTikTokSearch(item, output);
        return output;
    }
    if (typeof data === 'object') {
        if (data.aweme_info && data.aweme_info.video && data.aweme_info.video.play_addr) {
            const playUrl = data.aweme_info.video.play_addr.url_list?.[0];
            if (playUrl) {
                output.push({
                    title: data.aweme_info.desc || "بدون عنوان",
                    play: playUrl,
                    cover: data.aweme_info.video.cover?.url_list?.[0] || ""
                });
            }
        } else {
            for (const key of Object.keys(data)) extractTikTokSearch(data[key], output);
        }
    }
    return output;
}

// ======================================================
// CHAT
// ======================================================
let onlineUsers = {};

io.on("connection", socket => {
    socket.on("user_join", username => {
        onlineUsers[socket.id] = String(username || "مجهول");
        io.emit("update_users", Object.values(onlineUsers));
    });

    socket.on("send_message", data => {
        const sender = onlineUsers[socket.id] || "مجهول";
        const text = String(data?.text || "");
        io.emit("receive_message", {
            user: sender,
            text: text,
            timestamp: new Date().toLocaleTimeString()
        });

        const mentioned = Object.keys(onlineUsers).find(id => text.includes(`@${onlineUsers[id]}`));
        if (mentioned) {
            io.to(mentioned).emit("ping_notification", { from: sender });
        }
    });

    socket.on("disconnect", () => {
        delete onlineUsers[socket.id];
        io.emit("update_users", Object.values(onlineUsers));
    });
});

// ======================================================
// YOUTUBE SEARCH API
// ======================================================
app.get("/api/youtube/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: "أدخل كلمة البحث" });

        const response = await axios.get(`https://${YOUTUBE_SEARCH_HOST}/search/`, {
            params: { query: query },
            headers: {
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": YOUTUBE_SEARCH_HOST
            }
        });
        
        return res.json(response.data);
    } catch (error) {
        console.error("YouTube Search Error:", error.message);
        return res.status(500).json({ error: "فشل البحث في يوتيوب" });
    }
});

// ======================================================
// YOUTUBE API (PLAY)
// ======================================================
app.get("/api/youtube/play", async (req, res) => {
    try {
        const youtubeUrl = String(req.query.url || "").trim();
        if (!youtubeUrl) return res.status(400).json({ success: false, error: "أدخل رابط YouTube" });

        const videoId = getYouTubeVideoId(youtubeUrl);
        if (!videoId) return res.status(400).json({ success: false, error: "رابط YouTube غير صحيح" });

        const endpoint = `https://${YOUTUBE_HOST}/v2/video/details`;
        const response = await axios.get(endpoint, {
            params: { videoId: videoId, videos: "auto", audios: "auto" },
            headers: {
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": YOUTUBE_HOST,
                "Content-Type": "application/json"
            },
            timeout: 60000
        });

        const directUrl = chooseVideo(response.data);
        if (!directUrl) return res.status(422).json({ success: false, error: "API لم يرجع رابط فيديو", videoId, apiResponse: response.data });

        const fileName = await downloadVideo(directUrl);

        return res.json({
            success: true,
            videoId: videoId,
            file: fileName,
            url: `/api/media/${encodeURIComponent(fileName)}`
        });

    } catch (error) {
        console.error("❌ YouTube Error", error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: "فشل تحميل فيديو YouTube",
            details: error.response?.data || error.message
        });
    }
});

// ======================================================
// MEDIA STREAM
// ======================================================
app.get("/api/media/:file", (req, res) => {
    const file = getSafeFileName(req.params.file);
    const filePath = path.join(MEDIA_DIR, file);

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "الفيديو غير موجود" });

    const stat = fs.statSync(filePath);
    const size = stat.size;
    const range = req.headers.range;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");

    if (!range) {
        res.setHeader("Content-Length", size);
        return fs.createReadStream(filePath).pipe(res);
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

    if (Number.isNaN(start) || start >= size) {
        return res.status(416).set("Content-Range", `bytes */${size}`).end();
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", chunkSize);
    fs.createReadStream(filePath, { start, end }).pipe(res);
});

app.delete("/api/media/:file", (req, res) => {
    const file = getSafeFileName(req.params.file);
    const filePath = path.join(MEDIA_DIR, file);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log("🗑️ Deleted:", file);
        } catch (error) {
            return res.status(500).json({ success: false, error: "تعذر حذف الملف" });
        }
    }
    return res.json({ success: true });
});

// ======================================================
// TIKTOK FEED
// ======================================================
app.get("/api/tiktok/feed", async (req, res) => {
    try {
        const response = await axios.get("https://www.tikwm.com/api/feed", {
            timeout: 30000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const data = response.data;
        if (data && Array.isArray(data.data)) {
            const videos = data.data.map(video => ({
                title: video.title || "",
                play: video.play || video.wmplay || null
            })).filter(video => Boolean(video.play));
            return res.json(videos);
        }
        return res.status(404).json({ error: "لا توجد مقاطع TikTok" });
    } catch (error) {
        return res.status(500).json({ error: "فشل جلب TikTok" });
    }
});

// ======================================================
// TIKTOK SEARCH API
// ======================================================
app.post("/api/tiktok/search", async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "أدخل كلمة البحث" });

        const response = await axios.post(`https://${TIKTOK_SEARCH_HOST}/search/general/query`, {
            query: query,
            cursor: 0,
            sort_type: "0"
        }, {
            headers: {
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": TIKTOK_SEARCH_HOST,
                "Content-Type": "application/json"
            }
        });

        const extractedVideos = extractTikTokSearch(response.data);
        return res.json(extractedVideos);
    } catch (error) {
        console.error("TikTok Search Error:", error.message);
        return res.status(500).json({ error: "فشل البحث في تيك توك" });
    }
});

// ======================================================
// TIKTOK DOWNLOAD
// ======================================================
app.get("/api/tiktok/download", async (req, res) => {
    try {
        const url = String(req.query.url || "").trim();
        if (!url) return res.status(400).json({ error: "رابط الفيديو غير موجود" });

        const fileName = await downloadVideo(url);
        return res.json({
            success: true,
            file: fileName,
            url: `/api/media/${encodeURIComponent(fileName)}`
        });
    } catch (error) {
        console.error("TikTok download error:", error.message);
        return res.status(500).json({ error: "فشل تحميل TikTok" });
    }
});

// ======================================================
// FOOTBALL SERVER 1
// ======================================================
app.get("/api/football/server1", async (req, res) => {
    try {
        const response = await axios.get("https://football-live-stream-api.p.rapidapi.com/all-match", {
            headers: {
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com"
            }
        });
        return res.json(response.data);
    } catch (error) {
        return res.status(500).json({ error: "سيرفر 1 معطل حالياً" });
    }
});

// ======================================================
// FOOTBALL SERVER 2
// ======================================================
app.get("/api/football/server2", async (req, res) => {
    try {
        const response = await axios.get("https://all-sport-live-stream.p.rapidapi.com/esid", {
            headers: {
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": "all-sport-live-stream.p.rapidapi.com"
            }
        });
        return res.json(response.data);
    } catch (error) {
        return res.status(500).json({ error: "سيرفر 2 معطل حالياً" });
    }
});

// ======================================================
// START
// ======================================================
server.listen(PORT, () => {
    console.log("🚀 السيرفر شغال على http://localhost:" + PORT);
});