const socket = io();
let username = '';
let uploadInProgress = false;

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const fileUpload = document.getElementById('file-upload');
const usersList = document.getElementById('users-list');
const onlineCount = document.getElementById('online-count');
const typingIndicator = document.getElementById('typing-indicator');
const welcomeModal = document.getElementById('welcome-modal');
const welcomeMessage = document.getElementById('welcome-message');
const closeModalBtn = document.getElementById('close-modal');

// Show welcome modal initially
welcomeModal.style.display = 'flex';

// Close modal
closeModalBtn.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    messageInput.focus();
});

// Socket event handlers
socket.on('welcome', (data) => {
    username = data.username;
    welcomeMessage.textContent = data.message;
    updateUsersList(data.users);
    onlineCount.textContent = `${data.users.length}/3`;
});

socket.on('room_full', (data) => {
    welcomeMessage.innerHTML = `
        <p style="color: red; font-weight: bold;">${data.message}</p>
        <p>This chat room is only for 3 people.</p>
        <p>Please try again later or create a new room.</p>
    `;
    closeModalBtn.style.display = 'none';
});

socket.on('user_joined', (data) => {
    addSystemMessage(data.message);
});

socket.on('user_left', (data) => {
    addSystemMessage(data.message);
    updateUsersList(data.users);
    onlineCount.textContent = `${data.users.length}/3`;
});

socket.on('message_history', (messages) => {
    messages.forEach(msg => {
        if (msg.type) {
            addFileMessage(msg);
        } else {
            addMessage(msg, false);
        }
    });
    scrollToBottom();
});

socket.on('receive_message', (data) => {
    const isOwnMessage = data.username === username;
    addMessage(data, isOwnMessage);
});

socket.on('receive_file', (data) => {
    const isOwnMessage = data.username === username;
    addFileMessage(data, isOwnMessage);
});

socket.on('user_typing', (username) => {
    typingIndicator.textContent = `${username} is typing...`;
});

socket.on('user_stopped_typing', () => {
    typingIndicator.textContent = '';
});

// Send message
function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        socket.emit('send_message', { text: text });
        messageInput.value = '';
        socket.emit('stop_typing');
    }
}

// Send message on Enter key
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !uploadInProgress) {
        sendMessage();
    }
});

// Typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    socket.emit('typing');
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing');
    }, 1000);
});

// Send button click
sendBtn.addEventListener('click', sendMessage);

// File upload handler
fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        alert('File is too large! Maximum size is 10MB.');
        return;
    }
    
    uploadInProgress = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            socket.emit('send_file', {
                type: result.type,
                url: result.url,
                filename: result.filename
            });
        } else {
            alert('Failed to upload file: ' + result.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload file. Please try again.');
    } finally {
        uploadInProgress = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
        fileUpload.value = '';
    }
});

// Helper functions
function addMessage(data, isOwnMessage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'sent' : 'received'}`;
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-header">
                <span class="username">${data.username}</span>
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="message-text">${escapeHtml(data.text)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function addFileMessage(data, isOwnMessage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'sent' : 'received'}`;
    
    let mediaElement = '';
    if (data.type === 'image') {
        mediaElement = `<img src="${data.url}" alt="${data.filename}" onload="scrollToBottom()">`;
    } else if (data.type === 'video') {
        mediaElement = `
            <video controls onloadeddata="scrollToBottom()">
                <source src="${data.url}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
        `;
    } else {
        mediaElement = `<p><a href="${data.url}" target="_blank">Download ${data.filename}</a></p>`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-header">
                <span class="username">${data.username}</span>
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="file-message">
                <div class="file-info">
                    <i class="fas fa-file"></i> ${data.filename}
                </div>
                <div class="file-preview">
                    ${mediaElement}
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function addSystemMessage(text) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'system-message';
    systemDiv.style.textAlign = 'center';
    systemDiv.style.margin = '10px 0';
    systemDiv.style.color = '#666';
    systemDiv.style.fontStyle = 'italic';
    systemDiv.textContent = text;
    
    messagesContainer.appendChild(systemDiv);
    scrollToBottom();
}

function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fas fa-user-circle"></i> ${user}`;
        usersList.appendChild(li);
    });
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh if disconnected
socket.on('disconnect', () => {
    setTimeout(() => {
        window.location.reload();
    }, 3000);
});

// Initialize
window.addEventListener('load', () => {
    fetch('/api/users-count')
        .then(res => res.json())
        .then(data => {
            onlineCount.textContent = `${data.count}/${data.max}`;
        });
});