class ConnectVidApp {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.roomId = null;
        this.userName = 'Guest User';
        this.isCallActive = false;
        this.isScreenSharing = false;
        this.participants = new Map();
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.initializeApp();
    }

    async initializeApp() {
        this.initializeElements();
        this.initializeSocket();
        this.setupEventListeners();
        this.setupMediaDevices();
        
        // Simulate loading
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 2000);
    }

    initializeElements() {
        // Views
        this.loadingScreen = document.getElementById('loadingScreen');
        this.mainApp = document.getElementById('mainApp');
        this.lobbyView = document.getElementById('lobbyView');
        this.callView = document.getElementById('callView');
        this.chatPanel = document.getElementById('chatPanel');
        
        // Video elements
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.videoGrid = document.getElementById('videoGrid');
        
        // Input elements
        this.userNameInput = document.getElementById('userNameInput');
        this.roomIdInput = document.getElementById('roomIdInput');
        this.chatInput = document.getElementById('chatInput');
        
        // Button elements
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.toggleVideoBtn = document.getElementById('toggleVideoBtn');
        this.toggleAudioBtn = document.getElementById('toggleAudioBtn');
        this.screenShareBtn = document.getElementById('screenShareBtn');
        this.endCallBtn = document.getElementById('endCallBtn');
        this.toggleChatBtn = document.getElementById('toggleChatBtn');
        this.closeChatBtn = document.getElementById('closeChatBtn');
        this.sendMessageBtn = document.getElementById('sendMessageBtn');
        
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.participantsList = document.getElementById('participantsList');
        this.participantCount = document.getElementById('participantCount');
        this.chatMessages = document.getElementById('chatMessages');
        
        // User info
        this.userNameDisplay = document.getElementById('userName');
        this.userAvatar = document.getElementById('userAvatar');
    }

    initializeSocket() {
        try {
            this.socket = io({
                timeout: 10000,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                console.log('Connected to server:', this.socket.id);
                this.updateConnectionStatus('connected', 'Connected');
                this.showNotification('Connected to server', 'success');
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected:', reason);
                this.updateConnectionStatus('disconnected', 'Disconnected');
                this.showNotification('Disconnected from server', 'error');
            });

            this.socket.on('reconnect', (attemptNumber) => {
                console.log('Reconnected after', attemptNumber, 'attempts');
                this.showNotification('Reconnected to server', 'success');
            });

            this.socket.on('room-joined', (data) => {
                this.handleRoomJoined(data);
            });

            this.socket.on('user-joined', (data) => {
                this.handleUserJoined(data);
            });

            this.socket.on('user-left', (data) => {
                this.handleUserLeft(data);
            });

            // WebRTC signaling
            this.socket.on('offer', async (data) => {
                await this.handleOffer(data);
            });

            this.socket.on('answer', async (data) => {
                await this.handleAnswer(data);
            });

            this.socket.on('ice-candidate', async (data) => {
                await this.handleIceCandidate(data);
            });

            // Chat messages
            this.socket.on('chat-message', (data) => {
                this.handleChatMessage(data);
            });

            this.socket.on('user-action', (data) => {
                this.handleUserAction(data);
            });

            this.socket.on('error', (error) => {
                console.error('Server error:', error);
                this.showNotification(error.message || 'An error occurred', 'error');
            });

        } catch (error) {
            console.error('Socket initialization failed:', error);
            this.showNotification('Failed to connect to server', 'error');
        }
    }

    setupEventListeners() {
        // Room management
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        
        // Call controls
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.screenShareBtn.addEventListener('click', () => this.toggleScreenShare());
        this.endCallBtn.addEventListener('click', () => this.endCall());
        this.toggleChatBtn.addEventListener('click', () => this.toggleChat());
        this.closeChatBtn.addEventListener('click', () => this.toggleChat());
        
        // Chat
        this.sendMessageBtn.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Input validation
        this.userNameInput.addEventListener('input', () => this.validateInputs());
        this.roomIdInput.addEventListener('input', () => this.validateInputs());
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.handleAppBackground();
            } else {
                this.handleAppForeground();
            }
        });
    }

    async setupMediaDevices() {
        try {
            // Check device permissions and availability
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(device => device.kind === 'videoinput');
            const hasMicrophone = devices.some(device => device.kind === 'audioinput');
            
            if (!hasCamera) {
                this.showNotification('No camera detected', 'warning');
            }
            if (!hasMicrophone) {
                this.showNotification('No microphone detected', 'warning');
            }
            
        } catch (error) {
            console.error('Error checking media devices:', error);
        }
    }

    validateInputs() {
        const userName = this.userNameInput.value.trim();
        const roomId = this.roomIdInput.value.trim();
        const isValid = userName.length > 0 && roomId.length > 0;
        
        this.joinRoomBtn.disabled = !isValid;
        return isValid;
    }

    async joinRoom() {
        if (!this.validateInputs()) return;
        
        try {
            this.userName = this.userNameInput.value.trim();
            this.roomId = this.roomIdInput.value.trim();
            
            // Update UI
            this.userNameDisplay.textContent = this.userName;
            this.userAvatar.textContent = this.userName.charAt(0).toUpperCase();
            
            // Join room via socket
            this.socket.emit('join-room', this.roomId, {
                name: this.userName,
                avatar: this.userName.charAt(0).toUpperCase(),
                joinedAt: new Date().toISOString()
            });
            
            this.showNotification(`Joining room: ${this.roomId}`, 'success');
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room', 'error');
        }
    }

    handleRoomJoined(data) {
        this.showLobby(false);
        this.showCallView(true);
        
        // Update participants list
        data.participants.forEach(participant => {
            this.addParticipant(participant);
        });
        
        this.showNotification(`Successfully joined room: ${this.roomId}`, 'success');
        
        // Auto-start call if there are other participants
        if (data.participants.length > 1) {
            setTimeout(() => {
                this.startCall();
            }, 1000);
        }
    }

    handleUserJoined(data) {
        this.addParticipant(data.userData);
        this.showNotification(`${data.userData.name} joined the room`, 'success');
        
        // If we're already in a call, offer connection to new user
        if (this.isCallActive) {
            setTimeout(() => {
                this.createAndSendOffer();
            }, 1000);
        }
    }

    handleUserLeft(data) {
        this.removeParticipant(data.userId);
        this.showNotification('A participant left the room', 'warning');
        
        // Update remote video if the leaving user was our peer
        if (this.remoteVideo.srcObject) {
            this.remoteVideo.srcObject = null;
        }
    }

    addParticipant(participant) {
        this.participants.set(participant.id, participant);
        this.updateParticipantsUI();
    }

    removeParticipant(userId) {
        this.participants.delete(userId);
        this.updateParticipantsUI();
    }

    updateParticipantsUI() {
        this.participantCount.textContent = this.participants.size;
        
        this.participantsList.innerHTML = '';
        this.participants.forEach(participant => {
            const participantElement = document.createElement('div');
            participantElement.className = 'participant-item';
            participantElement.innerHTML = `
                <div class="participant-avatar">${participant.avatar}</div>
                <div class="participant-info">
                    <div class="participant-name">${participant.name}</div>
                    <div class="participant-status">
                        <div class="status-indicator connected"></div>
                        <span>Online</span>
                    </div>
                </div>
            `;
            this.participantsList.appendChild(participantElement);
        });
    }

    async startCall() {
        try {
            // Get user media with optimal settings
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            this.localVideo.srcObject = this.localStream;
            this.createPeerConnection();
            
            // Add tracks to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Create and send offer to all participants
            this.createAndSendOffer();
            
            this.isCallActive = true;
            this.updateCallControls();
            this.showNotification('Call started', 'success');
            
        } catch (error) {
            console.error('Error starting call:', error);
            this.showNotification('Failed to start call: ' + error.message, 'error');
            
            if (error.name === 'NotAllowedError') {
                this.showNotification('Please allow camera and microphone access', 'error');
            }
        }
    }

    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                offer: offer,
                target: this.roomId
            });
            
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(data) {
        try {
            if (!this.localStream) {
                await this.startCall();
            }
            
            await this.peerConnection.setRemoteDescription(data.offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                answer: answer,
                target: data.sender
            });
            
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(data.answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(data) {
        try {
            if (data.candidate) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);
        
        // Handle incoming stream
        this.peerConnection.ontrack = (event) => {
            console.log('Received remote stream');
            this.remoteStream = event.streams[0];
            this.remoteVideo.srcObject = this.remoteStream;
        };
        
        // ICE candidate handling
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.socket.connected) {
                this.socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    target: this.roomId
                });
            }
        };
        
        // Connection state monitoring
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    this.updateConnectionStatus('connected', 'Call Connected');
                    this.showNotification('Call connected', 'success');
                    break;
                case 'disconnected':
                    this.updateConnectionStatus('disconnected', 'Call Disconnected');
                    this.showNotification('Call disconnected', 'warning');
                    break;
                case 'failed':
                    this.updateConnectionStatus('disconnected', 'Call Failed');
                    this.showNotification('Call failed', 'error');
                    break;
            }
        };
        
        // ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
        };
    }

    async toggleVideo() {
        if (!this.localStream) return;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            
            const isVideoActive = videoTrack.enabled;
            this.toggleVideoBtn.classList.toggle('video-active', isVideoActive);
            this.toggleVideoBtn.querySelector('.control-icon').textContent = 
                isVideoActive ? '🎥' : '📷❌';
            
            this.showNotification(
                isVideoActive ? 'Video enabled' : 'Video disabled',
                isVideoActive ? 'success' : 'warning'
            );
        }
    }

    async toggleAudio() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            
            const isAudioActive = audioTrack.enabled;
            this.toggleAudioBtn.classList.toggle('audio-active', isAudioActive);
            this.toggleAudioBtn.querySelector('.control-icon').textContent = 
                isAudioActive ? '🎤' : '🎤❌';
            
            this.showNotification(
                isAudioActive ? 'Audio enabled' : 'Audio muted',
                isAudioActive ? 'success' : 'warning'
            );
        }
    }

    async toggleScreenShare() {
        try {
            if (!this.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                
                // Replace video track
                const videoTrack = screenStream.getVideoTracks()[0];
                const sender = this.peerConnection.getSenders().find(
                    s => s.track && s.track.kind === 'video'
                );
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
                
                videoTrack.onended = () => {
                    this.toggleScreenShare();
                };
                
                this.localVideo.srcObject = screenStream;
                this.isScreenSharing = true;
                this.screenShareBtn.classList.add('sharing-active');
                this.showNotification('Screen sharing started', 'success');
                
            } else {
                // Switch back to camera
                const cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
                
                const videoTrack = cameraStream.getVideoTracks()[0];
                const sender = this.peerConnection.getSenders().find(
                    s => s.track && s.track.kind === 'video'
                );
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
                
                this.localVideo.srcObject = cameraStream;
                this.isScreenSharing = false;
                this.screenShareBtn.classList.remove('sharing-active');
                this.showNotification('Screen sharing stopped', 'success');
            }
            
        } catch (error) {
            console.error('Error toggling screen share:', error);
            if (error.name !== 'NotAllowedError') {
                this.showNotification('Failed to share screen', 'error');
            }
        }
    }

    endCall() {
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Reset UI
        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;
        this.isCallActive = false;
        this.isScreenSharing = false;
        
        this.updateCallControls();
        this.showCallView(false);
        this.showLobby(true);
        
        this.showNotification('Call ended', 'info');
    }

    toggleChat() {
        this.chatPanel.classList.toggle('hidden');
    }

    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || !this.socket.connected) return;
        
        this.socket.emit('chat-message', {
            message: message,
            room: this.roomId,
            type: 'text'
        });
        
        // Add to local chat
        this.addChatMessage('You', message, true);
        this.chatInput.value = '';
    }

    handleChatMessage(data) {
        this.addChatMessage(data.userData.name, data.message, false, data.timestamp);
    }

    addChatMessage(sender, message, isOwn = false, timestamp = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isOwn ? 'own' : ''}`;
        
        const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-sender">${sender}</div>
            <div class="message-content">${this.escapeHtml(message)}</div>
            <div class="message-time">${time}</div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    handleUserAction(data) {
        // Handle user actions like mute/unmute, video on/off
        console.log('User action:', data);
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    updateConnectionStatus(status, message) {
        const indicator = this.connectionStatus.querySelector('.status-indicator');
        const text = this.connectionStatus.querySelector('span');
        
        indicator.className = 'status-indicator ' + status;
        text.textContent = message;
    }

    updateCallControls() {
        const isActive = this.isCallActive;
        
        this.toggleVideoBtn.disabled = !isActive;
        this.toggleAudioBtn.disabled = !isActive;
        this.screenShareBtn.disabled = !isActive;
        this.endCallBtn.disabled = !isActive;
        this.toggleChatBtn.disabled = !isActive;
    }

    showLobby(show) {
        if (show) {
            this.lobbyView.classList.remove('hidden');
            this.callView.classList.add('hidden');
        } else {
            this.lobbyView.classList.add('hidden');
            this.callView.classList.remove('hidden');
        }
    }

    showCallView(show) {
        this.callView.classList.toggle('hidden', !show);
    }

    hideLoadingScreen() {
        this.loadingScreen.classList.add('hidden');
        this.mainApp.classList.remove('hidden');
        this.mainApp.classList.add('fade-in');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const container = document.getElementById('notifications');
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    handleAppBackground() {
        // Reduce bandwidth when app is in background
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = false;
            }
        }
    }

    handleAppForeground() {
        // Restore video when app comes to foreground
        if (this.localStream && this.isCallActive) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = true;
            }
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConnectVidApp();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    // Clean up resources
    if (window.connectVidApp) {
        window.connectVidApp.endCall();
    }
});