const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesDiv = document.getElementById('messages');

const socket = io();
let localStream;
let peerConnection;

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' } // Example STUN server
    ]
};

// Get local media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
        socket.emit('ready');
    })
    .catch(error => console.error('Error accessing media devices.', error));

socket.on('ready', () => {
    if (localStream) {
        console.log('Socket ready, creating peer connection');
        createPeerConnection();
        // Send offer if this client is the initiator
        // This logic might need adjustment based on how you determine the initiator
        // For simplicity, let's assume the first one to connect is the initiator
        // A more robust solution would involve signaling for this.
        socket.on('user-connected', () => {
             console.log('Another user connected, creating offer');
             peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.emit('offer', peerConnection.localDescription);
                })
                .catch(e => console.error('Error creating offer', e));
        });
    }
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate);
        }
    };
}

socket.on('offer', offer => {
    if (!peerConnection) {
        createPeerConnection();
    }
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            socket.emit('answer', peerConnection.localDescription);
        })
        .catch(e => console.error('Error handling offer', e));
});

socket.on('answer', answer => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
        .catch(e => console.error('Error handling answer', e));
});

socket.on('candidate', candidate => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(e => console.error('Error adding ICE candidate', e));
});

// Chat functionality
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value;
    if (message.trim() !== '') {
        appendMessage('You: ' + message);
        socket.emit('chat-message', message);
        messageInput.value = '';
    }
}

socket.on('chat-message', message => {
    appendMessage('Remote: ' + message);
});

function appendMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.innerText = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the bottom
}

// Handle user disconnection (simplified)
socket.on('user-disconnected', () => {
    appendMessage('Remote user disconnected.');
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    }
    remoteVideo.srcObject = null;
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null; // Reset for potential new connection
    }
});
