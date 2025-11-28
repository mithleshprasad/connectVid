const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);

// Security middleware with updated CSP for fonts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cors());

// Serve static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: false
}));

// Serve manifest.json with correct MIME type
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// In-memory store for production (consider Redis for scaling)
const rooms = new Map();
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId, userData) => {
    try {
      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }
      
      const room = rooms.get(roomId);
      room.set(socket.id, {
        id: socket.id,
        ...userData,
        joinedAt: new Date()
      });
      
      users.set(socket.id, { roomId, ...userData });
      
      socket.join(roomId);
      
      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        userData,
        participants: Array.from(room.values())
      });
      
      // Send current participants to the new user
      socket.emit('room-joined', {
        roomId,
        participants: Array.from(room.values()),
        yourId: socket.id
      });
      
      console.log(`User ${socket.id} joined room ${roomId}`);
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id,
      userData: users.get(socket.id)
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Chat messages
  socket.on('chat-message', (data) => {
    const user = users.get(socket.id);
    socket.to(data.room).emit('chat-message', {
      message: data.message,
      sender: socket.id,
      userData: user,
      timestamp: new Date().toISOString(),
      type: data.type || 'text'
    });
  });

  // User actions
  socket.on('user-action', (data) => {
    socket.to(data.room).emit('user-action', {
      userId: socket.id,
      action: data.action,
      value: data.value,
      timestamp: new Date().toISOString()
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const user = users.get(socket.id);
    if (user && user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.delete(socket.id);
        
        // Clean up empty rooms
        if (room.size === 0) {
          rooms.delete(user.roomId);
        } else {
          // Notify others about user leaving
          socket.to(user.roomId).emit('user-left', {
            userId: socket.id,
            participants: Array.from(room.values())
          });
        }
      }
    }
    
    users.delete(socket.id);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    rooms: rooms.size,
    users: users.size
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
🚀 ConnectVid Server Running!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
📊 Health Check: http://localhost:${PORT}/health
  `);
});