const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let users = []; // Keep track of connected users (simple version)

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    users.push(socket.id);

    // Notify other users (if any) that a new user has connected
    // This is a simplified way to trigger offer creation on the client side.
    // A more robust solution would involve specific room logic.
    if (users.length > 1) {
        // Notify the new user about existing users (or one specific user for a 1-to-1 call)
        // And notify existing users about the new user.
        // For simplicity, we'll just emit 'user-connected' to all other users.
        socket.broadcast.emit('user-connected', socket.id);
        // And to the current user if there are others
        users.forEach(userId => {
            if (userId !== socket.id) {
                io.to(socket.id).emit('user-connected', userId);
            }
        });
    }

    socket.on('ready', () => {
        console.log('User ready:', socket.id);
        // If there's another user, tell them this one is ready
        // This helps in initiating the WebRTC handshake
        socket.broadcast.emit('user-ready', socket.id);
    });

    socket.on('offer', (offer) => {
        console.log('Offer from:', socket.id);
        // Broadcast the offer to other users (excluding the sender)
        socket.broadcast.emit('offer', offer);
    });

    socket.on('answer', (answer) => {
        console.log('Answer from:', socket.id);
        // Broadcast the answer to other users (excluding the sender)
        socket.broadcast.emit('answer', answer);
    });

    socket.on('candidate', (candidate) => {
        console.log('Candidate from:', socket.id);
        // Broadcast the ICE candidate to other users (excluding the sender)
        socket.broadcast.emit('candidate', candidate);
    });

    socket.on('chat-message', (message) => {
        console.log('Message from ' + socket.id + ': ' + message);
        // Broadcast the message to other users
        socket.broadcast.emit('chat-message', message);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        users = users.filter(id => id !== socket.id);
        // Notify other users
        socket.broadcast.emit('user-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
