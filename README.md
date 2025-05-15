# WebRTC Chat App

A simple web application that allows two users to engage in a video chat and text messaging session without requiring a database or user logins. It uses WebRTC for peer-to-peer video/audio streaming and Socket.io for signaling and text chat.

## Features

- Real-time video and audio chat between two users.
- Real-time text messaging.
- No database required.
- No user authentication (anonymous users).

## Directory Structure

```
webrtc-chat-app/
├── public/
│   ├── css/
│   │   └── style.css     # Styles for the application
│   ├── js/
│   │   └── main.js       # Client-side JavaScript for WebRTC and Socket.io
│   └── index.html        # Main HTML page for the chat interface
├── server.js             # Node.js server with Express and Socket.io for signaling
├── package.json          # Project metadata and dependencies
└── README.md             # This file
```

## Prerequisites

- Node.js and npm (or yarn) installed.

## Setup and Running

1.  **Clone the repository (or create the files as described):**
    ```bash
    # If you were cloning:
    # git clone <repository-url>
    # cd webrtc-chat-app
    ```

2.  **Install dependencies:**
    Open your terminal in the `webrtc-chat-app` directory and run:
    ```bash
    npm install
    ```

3.  **Start the server:**
    ```bash
    npm start
    ```
    This will typically start the server on `http://localhost:3000`.

4.  **Open the application in two browser tabs or on two different devices on the same network:**
    Navigate to `http://localhost:3000` in two separate browser windows/tabs.

5.  **Usage:**
    -   Once two users have opened the page, the video connection should attempt to establish automatically.
    -   You should see your local video feed and, once connected, the remote user's video feed.
    -   Use the chatbox at the bottom to send and receive text messages.

## How it Works

-   **Signaling:** The `server.js` file uses Express to serve the static files (HTML, CSS, JS) and Socket.io to manage signaling between the two clients. Signaling is necessary for WebRTC to exchange metadata like session control messages, network configurations (ICE candidates), and media capabilities (SDP offers/answers).
-   **WebRTC:** The client-side `main.js` handles the WebRTC logic. It captures the user's camera and microphone, establishes a peer-to-peer connection (`RTCPeerConnection`) with the other user, and streams video/audio.
-   **Chat:** Text messages are also relayed through the Socket.io server.

## Important Notes & Limitations

-   **STUN Server:** The example uses a public Google STUN server (`stun:stun.l.google.com:19302`). STUN servers are used to discover the public IP address and port of a client behind a NAT.
-   **TURN Server:** For more robust connections, especially across complex NATs and firewalls, a TURN server would be required. This example does not include TURN server configuration for simplicity.
-   **Two Users Only:** This implementation is designed for a simple two-user chat. Scaling to multiple users (e.g., group chat) would require more complex room management logic on the server and client-side.
-   **Error Handling:** Basic error handling is in place, but a production application would need more comprehensive error management.
-   **Security:** This is a basic example. For production, consider aspects like HTTPS, secure signaling, and input validation.
-   **Browser Compatibility:** WebRTC is widely supported, but ensure you are using modern browsers (Chrome, Firefox, Safari, Edge).

# chatdemo
