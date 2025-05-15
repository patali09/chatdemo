const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Store rooms and connected users
const rooms = {}; // roomCode -> { users: [socketId1, socketId2], isLocked: false }
const users = {}; // socketId -> { roomCode: string }

// Generate a random 6-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar-looking characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    // Create a new room
    socket.on('create-room', () => {
        // Generate a unique room code
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (rooms[roomCode]);

        // Create the room with this user as first participant
        rooms[roomCode] = {
            users: [socket.id],
            isLocked: false
        };

        // Add user to the room
        users[socket.id] = { roomCode };
        
        // Join the socket to the room
        socket.join(roomCode);
        
        // Inform the client about the created room
        socket.emit('room-created', { roomCode });
    });

    // Join an existing room
    socket.on('join-room', ({ roomCode }) => {
        // Check if room exists
        if (!rooms[roomCode]) {
            socket.emit('room-error', { error: 'Room does not exist' });
            return;
        }

        // Check if room is full (max 2 users)
        if (rooms[roomCode].users.length >= 2) {
            socket.emit('room-error', { error: 'Room is full' });
            return;
        }

        // Check if room is locked (in an active call)
        if (rooms[roomCode].isLocked) {
            socket.emit('room-error', { error: 'Room is currently in an active call' });
            return;
        }

        // Add user to room
        rooms[roomCode].users.push(socket.id);
        users[socket.id] = { roomCode };
        
        // Join the socket to the room
        socket.join(roomCode);
        
        console.log(`[Server] User ${socket.id} joined room ${roomCode}`);
        
        // Notify the client they've joined
        socket.emit('room-joined', { roomCode });
        
        // If two users are in the room, lock it and start the call
        if (rooms[roomCode].users.length === 2) {
            rooms[roomCode].isLocked = true;
            
            const user1 = rooms[roomCode].users[0];
            const user2 = rooms[roomCode].users[1];
            
            // Notify all users in the room
            io.to(roomCode).emit('room-ready', { roomCode });
            
            // Designate the first user to initiate the call
            io.to(user1).emit('start-call', { target: user2 });
        }
    });

    // User ready with media
    socket.on('user-ready', () => {
        if (!users[socket.id] || !users[socket.id].roomCode) {
            return;
        }
        
        const roomCode = users[socket.id].roomCode;
        console.log(`[Server] User ${socket.id} is ready in room ${roomCode}`);
        
        // Broadcast to the other user in the room
        socket.to(roomCode).emit('peer-ready', { from: socket.id });
    });

    // WebRTC signaling: offer
    socket.on('offer', ({ offer, to }) => {
        io.to(to).emit('offer', { offer, from: socket.id });
    });

    // WebRTC signaling: answer
    socket.on('answer', ({ answer, to }) => {
        io.to(to).emit('answer', { answer, from: socket.id });
    });

    // WebRTC signaling: ice candidate
    socket.on('ice-candidate', ({ candidate, to }) => {
        io.to(to).emit('ice-candidate', { candidate, from: socket.id });
    });

    // Chat message
    socket.on('chat-message', ({ message, roomCode }) => {
        if (!users[socket.id] || users[socket.id].roomCode !== roomCode) {
            socket.emit('system-message', { message: 'You are not connected to this room' });
            return;
        }
        
        socket.to(roomCode).emit('chat-message', { message, from: socket.id });
    });

    // Leave room
    socket.on('leave-room', () => {
        handleUserLeaving(socket.id);
    });

    // Disconnect
    socket.on('disconnect', () => {
        handleUserLeaving(socket.id);
    });

    // Helper function to handle a user leaving
    function handleUserLeaving(userId) {
        if (!users[userId]) return;
        
        const roomCode = users[userId].roomCode;
        
        if (roomCode && rooms[roomCode]) {
            console.log(`[Server] User ${userId} leaving room ${roomCode}`);
            
            // Remove user from the room
            rooms[roomCode].users = rooms[roomCode].users.filter(id => id !== userId);
            
            // Notify other users in the room
            socket.to(roomCode).emit('peer-left', { peerId: userId });
            
            // If room is empty, delete it
            if (rooms[roomCode].users.length === 0) {
                delete rooms[roomCode];
            } else {
                // Unlock the room so new users can join
                rooms[roomCode].isLocked = false;
            }
            
            // Leave the socket room
            socket.leave(roomCode);
        }
        
        // Remove user from users object
        delete users[userId];
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
