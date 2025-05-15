const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesDiv = document.getElementById('messages');

const socket = io();
let localStream;
let peerConnection;
let otherUserId; // To store the ID of the other user in the chat

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' } // Example STUN server
    ]
};

// Add a status message to show we're starting
appendMessage('System: Starting connection...');

// Function to signal that this client is ready to connect
function signalReady() {
    socket.emit('ready');
    console.log('[Client] Emitted \'ready\' to server');
    appendMessage('System: Waiting for another user...');
}

// Get local media
navigator.mediaDevices.getUserMedia({ 
    video: true, 
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    } 
})
.then(stream => {
    console.log('[Client] Media stream obtained');
    localVideo.srcObject = stream;
    localStream = stream;
    
    // Log info about the stream we got
    if (typeof logStreamInfo === 'function') {
        logStreamInfo(stream, 'Local stream');
    }
    
    // Make sure audio is enabled
    if (typeof ensureAudioEnabled === 'function') {
        ensureAudioEnabled(stream);
    }
    
    // Signal ready after successful media acquisition
    signalReady();
})
.catch(error => {
    console.error('[Client] Error accessing media devices:', error);
    appendMessage('System: Could not access camera or microphone. Chat will work, but not video/audio.');
    
    // Even if media access fails, still signal ready for chat-only mode
    signalReady();
});

function createPeerConnection(targetUserId) {
    console.log(`[Client] Creating new PeerConnection for target ${targetUserId}`);
    if (peerConnection) {
        console.log('[Client] Closing existing peer connection before creating a new one.');
        peerConnection.close();
    }
    
    try {
        peerConnection = new RTCPeerConnection(servers);
        otherUserId = targetUserId; // Store the ID of the user we are connecting to

        // Add local media tracks if we have them
        if (localStream) {
            localStream.getTracks().forEach(track => {
                try {
                    console.log('[Client] Adding local track to PeerConnection:', track.kind);
                    peerConnection.addTrack(track, localStream);
                } catch (e) {
                    console.error('[Client] Error adding track to peer connection:', e);
                }
            });
        } else {
            console.warn('[Client] No local stream available, creating connection without media');
            // We can still create a data channel for text chat
            try {
                const dataChannel = peerConnection.createDataChannel('chat');
                console.log('[Client] Created data channel for chat (fallback)');
            } catch (e) {
                console.error('[Client] Error creating data channel:', e);
            }
        }

        peerConnection.ontrack = event => {
            console.log('[Client] Remote track received:', event.track.kind);
            
            try {
                // Make sure we have a remote stream to add tracks to
                if (!remoteVideo.srcObject) {
                    console.log('[Client] Creating new MediaStream for remote tracks');
                    remoteVideo.srcObject = new MediaStream();
                }
                
                // Add this track to the remote stream
                console.log(`[Client] Adding ${event.track.kind} track to remote stream`);
                remoteVideo.srcObject.addTrack(event.track);
                
                // For audio tracks, make sure they're enabled
                if (event.track.kind === 'audio') {
                    event.track.enabled = true;
                    console.log('[Client] Audio track enabled');
                }
            } catch (e) {
                console.error('[Client] Error handling remote track:', e);
            }
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log(`[Client] Sending ICE candidate to ${otherUserId}:`, event.candidate);
                socket.emit('candidate', { candidate: event.candidate, to: otherUserId });
            } else {
                console.log('[Client] All ICE candidates have been sent.');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log(`[Client] ICE connection state changed: ${peerConnection.iceConnectionState}`);
            if (peerConnection.iceConnectionState === 'failed' ||
                peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'closed') {
                console.error('[Client] ICE connection failed or disconnected.');
                appendMessage('System: Connection issue detected. Try refreshing the page.');
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log(`[Client] Peer connection state changed: ${peerConnection.connectionState}`);
            if (peerConnection.connectionState === 'connected') {
                console.log('[Client] Peers connected!');
                appendMessage('System: Connection established.');
                
                // After connection is established, log remote stream info
                if (remoteVideo.srcObject && typeof logStreamInfo === 'function') {
                    logStreamInfo(remoteVideo.srcObject, 'Remote stream');
                    
                    // Double-check audio track is enabled on the remote stream
                    const audioTracks = remoteVideo.srcObject.getAudioTracks();
                    if (audioTracks.length > 0) {
                        audioTracks.forEach(track => {
                            track.enabled = true;
                            console.log('[Client] Ensuring remote audio track is enabled:', track.id);
                        });
                    }
                }
            } else if (peerConnection.connectionState === 'failed') {
                console.error('[Client] Peer connection failed.');
                appendMessage('System: Connection failed.');
            }
        };
        
        return peerConnection;
    } catch (e) {
        console.error('[Client] Error creating peer connection:', e);
        appendMessage('System: Failed to establish connection. Please refresh and try again.');
        return null;
    }
}

socket.on('make-offer', (targetUserId) => {
    console.log(`[Client] Received 'make-offer' from server for user ${targetUserId}. Creating offer.`);
    const pc = createPeerConnection(targetUserId);
    if (!pc) return;
    
    pc.createOffer()
        .then(offer => {
            console.log('[Client] Offer created, setting local description.');
            return pc.setLocalDescription(offer);
        })
        .then(() => {
            console.log(`[Client] Local description set. Sending offer to ${targetUserId}.`);
            socket.emit('offer', { offer: pc.localDescription, to: targetUserId });
        })
        .catch(e => {
            console.error('[Client] Error creating or sending offer:', e);
            appendMessage('System: Could not create connection offer. Try refreshing.');
        });
});

socket.on('wait-for-offer', (sourceUserId) => {
    console.log(`[Client] Received 'wait-for-offer' from server. Will wait for offer from ${sourceUserId}.`);
    otherUserId = sourceUserId;
    appendMessage('System: Connecting to the other user...');
});

socket.on('offer-received', ({ offer, from }) => {
    console.log(`[Client] Offer received from ${from}.`);
    if (!peerConnection || otherUserId !== from) {
        // Ensure peerConnection is created for the correct user if not already
        const pc = createPeerConnection(from);
        if (!pc) return;
    }
    
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => {
            console.log('[Client] Remote description (offer) set. Creating answer.');
            return peerConnection.createAnswer();
        })
        .then(answer => {
            console.log('[Client] Answer created, setting local description.');
            return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
            console.log(`[Client] Local description (answer) set. Sending answer to ${from}.`);
            socket.emit('answer', { answer: peerConnection.localDescription, to: from });
        })
        .catch(e => {
            console.error('[Client] Error handling offer or creating answer:', e);
            appendMessage('System: Connection issue. Try refreshing the page.');
        });
});

socket.on('answer-received', ({ answer, from }) => {
    console.log(`[Client] Answer received from ${from}.`);
    if (peerConnection && otherUserId === from) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => console.log('[Client] Remote description (answer) set.'))
            .catch(e => console.error('[Client] Error setting remote description (answer):', e));
    } else {
        console.warn('[Client] Received answer but peerConnection is not set up for this user or does not exist.');
    }
});

socket.on('candidate-received', ({ candidate, from }) => {
    console.log(`[Client] ICE candidate received from ${from}.`);
    if (peerConnection && otherUserId === from) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .then(() => console.log('[Client] Added received ICE candidate.'))
            .catch(e => console.error('[Client] Error adding received ICE candidate:', e));
    } else {
        console.warn('[Client] Received ICE candidate but peerConnection is not set up for this user or does not exist.');
    }
});

// Chat functionality
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '') {
        console.log(`[Client] Sending message: ${message}`);
        appendMessage(`You: ${message}`);
        socket.emit('chat-message', message);
        messageInput.value = '';
    }
}

socket.on('chat-message', ({ message, from }) => {
    console.log(`[Client] Received chat message from ${from}: ${message}`);
    appendMessage(`Remote: ${message}`);
});

function appendMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message; // Use textContent for security
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the bottom
}

// Handle user disconnection
socket.on('user-disconnected', (userId) => {
    console.log(`[Client] User ${userId} disconnected.`);
    appendMessage(`System: The other user disconnected.`);
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    }
    remoteVideo.srcObject = null;
    if (peerConnection && otherUserId === userId) {
        console.log('[Client] Closing peer connection due to user disconnection.');
        peerConnection.close();
        peerConnection = null;
        otherUserId = null;
        appendMessage('System: Ready for a new connection. Refresh if needed.');
    }
});
