const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let chatHistory = [];
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    chatHistory = chatHistory.filter(msg => now - msg.timestamp < TWENTY_FOUR_HOURS);
}, 60 * 60 * 1000);

let onlineUsersCount = 0;

io.on('connection', (socket) => {
    onlineUsersCount++;
    io.emit('online-count', onlineUsersCount);

    socket.emit('chat-history', chatHistory);

    socket.on('chat-message', (data) => {
        const messageData = { ...data, timestamp: Date.now() };
        chatHistory.push(messageData);
        io.emit('chat-message', messageData);
    });

    socket.on('disconnect', () => {
        onlineUsersCount = Math.max(0, onlineUsersCount - 1);
        io.emit('online-count', onlineUsersCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
