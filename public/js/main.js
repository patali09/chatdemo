// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesDiv = document.getElementById('messages');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomButton = document.getElementById('joinRoomButton');
const createRoomButton = document.getElementById('createRoomButton');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomInfo = document.getElementById('roomInfo');
const roomConnection = document.getElementById('room-connection');
const container = document.getElementById('container');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const roomLabel = document.getElementById('roomLabel');

// Global variables
const socket = io();
let localStream;
let peerConnection;
let currentRoomCode = null;
let currentPeerId = null;

// ICE Servers (STUN/TURN)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ===== ROOM MANAGEMENT =====

// Create a new room
createRoomButton.addEventListener('click', () => {
    appendMessage('System: Creating a new room...');
    socket.emit('create-room');
});

// Join an existing room
joinRoomButton.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (roomCode.length >= 4) {
        appendMessage(`System: Joining room ${roomCode}...`);
        socket.emit('join-room', { roomCode });
    } else {
        appendMessage('System: Please enter a valid room code.');
    }
});

// Leave current room
leaveRoomButton.addEventListener('click', () => {
    leaveRoom();
});

// Function to leave the current room
function leaveRoom() {
    if (currentRoomCode) {
        socket.emit('leave-room');
        stopMediaAndResetConnection();
        showRoomInterface();
        appendMessage('System: You have left the room.');
        currentRoomCode = null;
        currentPeerId = null;
    }
}

// Function to show the chat and video interface
function showChatInterface() {
    roomConnection.classList.add('hidden');
    container.classList.remove('hidden');
}

// Function to show the room connection interface
function showRoomInterface() {
    roomConnection.classList.remove('hidden');
    container.classList.add('hidden');
}

// ===== SOCKET EVENT HANDLERS =====

// Room created successfully
socket.on('room-created', ({ roomCode }) => {
    currentRoomCode = roomCode;
    roomCodeDisplay.textContent = roomCode;
    roomInfo.classList.remove('hidden');
    appendMessage(`System: Room created! Your room code is ${roomCode}`);
    appendMessage('System: Waiting for someone to join...');
    
    // Setup for when the peer connects
    roomLabel.textContent = `(Room: ${roomCode})`;
    
    // Set up the local media
    setupLocalMedia();
});

// Room joined successfully
socket.on('room-joined', ({ roomCode }) => {
    currentRoomCode = roomCode;
    appendMessage(`System: Joined room ${roomCode}`);
    roomLabel.textContent = `(Room: ${roomCode})`;
    
    // Show the chat interface
    showChatInterface();
    
    // Set up the local media
    setupLocalMedia();
});

// Error joining a room
socket.on('room-error', ({ error }) => {
    appendMessage(`System Error: ${error}`);
});

// Room is ready (two users are connected)
socket.on('room-ready', ({ roomCode }) => {
    appendMessage('System: Another user has joined the room.');
    // The room is ready for the call, but wait for start-call or peer-ready
});

// Start a call (initiator)
socket.on('start-call', ({ target }) => {
    appendMessage('System: Initiating call...');
    currentPeerId = target;
    
    // Create the peer connection and send an offer
    createPeerConnection(target);
});

// Peer is ready with media
socket.on('peer-ready', ({ from }) => {
    appendMessage('System: Peer is ready with media.');
    currentPeerId = from;
    
    // If we're the initiator, createPeerConnection was already called
    // from the start-call event. Otherwise, it's done when we receive an offer.
});

// WebRTC Offer received
socket.on('offer', ({ offer, from }) => {
    appendMessage('System: Received call offer.');
    currentPeerId = from;
    
    // Create peer connection if it doesn't exist
    if (!peerConnection) {
        createPeerConnection(from);
    }
    
    // Set the remote description and create an answer
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => {
            return peerConnection.createAnswer();
        })
        .then(answer => {
            return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
            socket.emit('answer', { 
                answer: peerConnection.localDescription, 
                to: from 
            });
        })
        .catch(error => {
            appendMessage('System: Error establishing connection. Please refresh and try again.');
        });
});

// WebRTC Answer received
socket.on('answer', ({ answer, from }) => {
    if (peerConnection && currentPeerId === from) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .catch(error => {
                appendMessage('System: Error establishing connection.');
            });
    }
});

// WebRTC ICE Candidate received
socket.on('ice-candidate', ({ candidate, from }) => {
    if (peerConnection && currentPeerId === from) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => {
                appendMessage('System: Error with connection setup.');
            });
    }
});

// Chat message received
socket.on('chat-message', ({ message, from }) => {
    appendMessage(`Peer: ${message}`);
});

// System message received
socket.on('system-message', ({ message }) => {
    appendMessage(`System: ${message}`);
});

// Peer left the room
socket.on('peer-left', ({ peerId }) => {
    appendMessage('System: The other user has left the room.');
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    currentPeerId = null;
});

// ===== WEBRTC FUNCTIONS =====

// Setup local media
function setupLocalMedia() {
    if (localStream) {
        // If we already have a stream, use it
        showChatInterface();
        socket.emit('user-ready');
        return;
    }
    
    appendMessage('System: Requesting camera and microphone access...');
    
    navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } 
    })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        
        showChatInterface();
        
        // Notify the server that we're ready with media
        socket.emit('user-ready');
    })
    .catch(error => {
        appendMessage('System: Could not access camera or microphone. Chat will still work.');
        
        // Still show the chat interface, but without media
        showChatInterface();
        
        // Let the server know we're ready, even without media
        socket.emit('user-ready');
    });
}

// Create a peer connection
function createPeerConnection(peerId) {
    if (peerConnection) {
        peerConnection.close();
    }
    
    peerConnection = new RTCPeerConnection(iceServers);
    
    // Add local stream tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // Handle incoming streams
    peerConnection.ontrack = event => {
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = new MediaStream();
        }
        remoteVideo.srcObject.addTrack(event.track);
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: peerId
            });
        }
    };
    
    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            appendMessage('System: Connected to peer!');
        } else if (peerConnection.connectionState === 'disconnected' || 
                  peerConnection.connectionState === 'failed' ||
                  peerConnection.connectionState === 'closed') {
            appendMessage('System: Peer connection lost.');
        }
    };
    
    // ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' ||
            peerConnection.iceConnectionState === 'failed') {
            appendMessage('System: Connection to peer lost. You can wait for them to rejoin or leave the room.');
        }
    };
    
    // If we're the initiator, create and send an offer
    if (peerId === currentPeerId) {
        peerConnection.createOffer()
            .then(offer => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                socket.emit('offer', {
                    offer: peerConnection.localDescription,
                    to: peerId
                });
            })
            .catch(error => {
                appendMessage('System: Error establishing connection. Please refresh and try again.');
            });
    }
    
    return peerConnection;
}

// Stop media and reset connection
function stopMediaAndResetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
    }
}

// ===== CHAT FUNCTIONS =====

// Send a chat message
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '' && currentRoomCode) {
        appendMessage(`You: ${message}`);
        socket.emit('chat-message', { 
            message,
            roomCode: currentRoomCode
        });
        messageInput.value = '';
    }
}

// Append a message to the chat
function appendMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Initialize the app
appendMessage('System: Welcome to WebRTC Chat!');
appendMessage('System: Create a new room or join an existing one to start.');
