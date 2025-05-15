/**
 * Audio utilities for WebRTC chat
 */

// This function can be used to check if audio is actually flowing
function checkAudioLevels(stream) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
        
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        
        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        javascriptNode.onaudioprocess = function() {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let values = 0;
            
            const length = array.length;
            for (let i = 0; i < length; i++) {
                values += (array[i]);
            }
            
            const average = values / length;
            
            // Clean up after a few seconds to avoid memory leaks
            setTimeout(() => {
                javascriptNode.disconnect();
                analyser.disconnect();
                microphone.disconnect();
            }, 5000);
        };
        
        return {
            stop: function() {
                javascriptNode.disconnect();
                analyser.disconnect();
                microphone.disconnect();
            }
        };
    } catch (e) {
        return { stop: function() {} };
    }
}

// Helper to ensure audio is enabled for a stream
function ensureAudioEnabled(stream) {
    if (!stream) return false;
    
    let audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
        if (!audioTrack.enabled) {
            audioTrack.enabled = true;
        }
        return true;
    }
    return false;
}

// Debug function to log info about media streams
function logStreamInfo(stream, label) {
    if (!stream) {
        return;
    }
    
    // Simply return stream info without logging
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    return {
        id: stream.id,
        active: stream.active,
        videoTracks: videoTracks.length,
        audioTracks: audioTracks.length
    };
}
