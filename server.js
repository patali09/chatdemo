const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let connectedUsers = {}; // Store socket.id -> { isReady: false, otherUserId: null }

io.on('connection', (socket) => {
    console.log(`[Server] User connected: ${socket.id}`);
    connectedUsers[socket.id] = { isReady: false, otherUserId: null };
    const userIds = Object.keys(connectedUsers);
    console.log(`[Server] Current users: ${userIds.join(', ')}`);

    socket.on('ready', () => {
        console.log(`[Server] User ready: ${socket.id}`);
        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].isReady = true;
        }

        const readyUserIds = userIds.filter(id => connectedUsers[id] && connectedUsers[id].isReady);
        console.log(`[Server] Ready users: ${readyUserIds.join(', ')}`);

        if (readyUserIds.length === 2) {
            const user1 = readyUserIds[0];
            const user2 = readyUserIds[1];
            
            // Arbitrarily make user1 the offerer to user2
            if (connectedUsers[user1]) connectedUsers[user1].otherUserId = user2;
            if (connectedUsers[user2]) connectedUsers[user2].otherUserId = user1;

            console.log(`[Server] Two users ready. Telling ${user1} to make an offer to ${user2}`);
            io.to(user1).emit('make-offer', user2);
            console.log(`[Server] Telling ${user2} to wait for an offer from ${user1}`);
            io.to(user2).emit('wait-for-offer', user1);
        } else if (readyUserIds.length > 2) {
            console.warn("[Server] More than two users are ready. This simple setup handles only two.");
            // Basic handling: disconnect extra users or implement room logic
        } else {
            console.log('[Server] Waiting for another user to become ready.');
        }
    });

    socket.on('offer', ({ offer, to }) => {
        console.log(`[Server] Relaying offer from ${socket.id} to ${to}`);
        io.to(to).emit('offer-received', { offer: offer, from: socket.id });
    });

    socket.on('answer', ({ answer, to }) => {
        console.log(`[Server] Relaying answer from ${socket.id} to ${to}`);
        io.to(to).emit('answer-received', { answer: answer, from: socket.id });
    });

    socket.on('candidate', ({ candidate, to }) => {
        console.log(`[Server] Relaying ICE candidate from ${socket.id} to ${to}`);
        io.to(to).emit('candidate-received', { candidate: candidate, from: socket.id });
    });

    socket.on('chat-message', (message) => {
        const partnerId = connectedUsers[socket.id]?.otherUserId;
        console.log(`[Server] Chat message from ${socket.id} to ${partnerId}: ${message}`);
        if (partnerId && connectedUsers[partnerId]) {
            io.to(partnerId).emit('chat-message', { message, from: socket.id });
        } else {
            console.warn(`[Server] Cannot relay chat message: partner not found for ${socket.id}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Server] User disconnected: ${socket.id}`);
        const disconnectedUserPartner = connectedUsers[socket.id] ? connectedUsers[socket.id].otherUserId : null;
        delete connectedUsers[socket.id];

        if (disconnectedUserPartner && connectedUsers[disconnectedUserPartner]) {
            console.log(`[Server] Notifying ${disconnectedUserPartner} about ${socket.id}'s disconnection.`);
            io.to(disconnectedUserPartner).emit('user-disconnected', socket.id);
            // Reset partner's otherUserId
            connectedUsers[disconnectedUserPartner].otherUserId = null;
            connectedUsers[disconnectedUserPartner].isReady = false; // Mark as not ready for a new pairing
        }
        console.log(`[Server] Remaining users: ${Object.keys(connectedUsers).join(', ')}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
