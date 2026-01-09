const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Limit to 3 users only
const MAX_USERS = 3;
let connectedUsers = [];
let messages = []; // Store chat history

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// API to get connected users count
app.get('/api/users-count', (req, res) => {
  res.json({ count: connectedUsers.length, max: MAX_USERS });
});

// API to get chat history
app.get('/api/messages', (req, res) => {
  res.json(messages.slice(-50)); // Last 50 messages
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: req.file.originalname,
      type: req.file.mimetype.split('/')[0] // 'image' or 'video'
    });
  } else {
    res.json({ success: false, error: 'No file uploaded' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New user trying to connect...');
  
  // Check if room is full
  if (connectedUsers.length >= MAX_USERS) {
    socket.emit('room_full', { message: 'Chat room is full (3/3 users)' });
    socket.disconnect();
    return;
  }
  
  // Assign a temporary username
  const userNumber = connectedUsers.length + 1;
  const username = `Friend ${userNumber}`;
  
  connectedUsers.push({
    id: socket.id,
    username: username
  });
  
  console.log(`${username} connected. Total: ${connectedUsers.length}/${MAX_USERS}`);
  
  // Send welcome message with user list
  socket.emit('welcome', {
    username: username,
    users: connectedUsers.map(u => u.username),
    message: `Welcome ${username}! There are ${connectedUsers.length}/3 users online.`
  });
  
  // Notify others about new user
  socket.broadcast.emit('user_joined', {
    username: username,
    message: `${username} joined the chat`
  });
  
  // Send last messages to new user
  socket.emit('message_history', messages.slice(-20));
  
  // Handle incoming messages
  socket.on('send_message', (data) => {
    const user = connectedUsers.find(u => u.id === socket.id);
    if (!user) return;
    
    const messageData = {
      id: Date.now(),
      username: user.username,
      text: data.text,
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    
    // Add to messages array
    messages.push(messageData);
    
    // Broadcast to all users
    io.emit('receive_message', messageData);
  });
  
  // Handle file messages
  socket.on('send_file', (fileData) => {
    const user = connectedUsers.find(u => u.id === socket.id);
    if (!user) return;
    
    const messageData = {
      id: Date.now(),
      username: user.username,
      type: fileData.type,
      url: fileData.url,
      filename: fileData.filename,
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    
    messages.push(messageData);
    io.emit('receive_file', messageData);
  });
  
  // Handle user typing
  socket.on('typing', () => {
    const user = connectedUsers.find(u => u.id === socket.id);
    if (user) {
      socket.broadcast.emit('user_typing', user.username);
    }
  });
  
  // Handle user stopped typing
  socket.on('stop_typing', () => {
    socket.broadcast.emit('user_stopped_typing', '');
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    const index = connectedUsers.findIndex(u => u.id === socket.id);
    if (index !== -1) {
      const username = connectedUsers[index].username;
      connectedUsers.splice(index, 1);
      
      console.log(`${username} disconnected. Total: ${connectedUsers.length}/${MAX_USERS}`);
      
      // Notify others
      io.emit('user_left', {
        username: username,
        message: `${username} left the chat`,
        users: connectedUsers.map(u => u.username)
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Share this link: http://localhost:${PORT} (or your public IP)`);
  console.log(`👥 Max users: ${MAX_USERS}`);
});