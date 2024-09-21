const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // UUID for unique room IDs

// Initialize the app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Serve static files from the "public" directory
app.use(express.static('public'));

// Use CORS to allow access from any origin
app.use(cors());

// MySQL connection pool
const db = mysql.createPool({
    host: 'localhost', 
    user: 'root', 
    password: 'root', 
    database: 'anon_messaging' 
});

// Fetch messages from a room
function getMessagesFromRoom(roomId, callback) {
    db.query('SELECT * FROM messages WHERE roomId = ? ORDER BY createdAt ASC', [roomId], (err, results) => {
        if (err) {
            return callback(err, null);
        }
        callback(null, results);
    });
}

// Save a new message to the room
function saveMessageToRoom(roomId, text) {
    db.query('INSERT INTO messages (roomId, text) VALUES (?, ?)', [roomId, text], (err, result) => {
        if (err) throw err;
        console.log('Message saved to room:', roomId);
    });
}

// Route to create a new room
app.get('/new-room', (req, res) => {
    const newRoomId = uuidv4(); // Generate a unique room ID
    res.redirect(`/room/${newRoomId}`); // Redirect the user to the new room
});

// Route to serve the room page
app.get('/room/:roomId', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); // Serve the HTML for the chat
});

// When a client connects
io.on('connection', (socket) => {
    console.log('New client connected');

    // Join a room
    socket.on('joinRoom', (roomId) => {
        socket.join(roomId); // Join the specific room

        // Send all previous messages from the room to the new client
        getMessagesFromRoom(roomId, (err, messages) => {
            if (err) {
                console.error('Error fetching messages:', err);
                return;
            }
            socket.emit('loadMessages', messages);
        });

        // Listen for new messages from this client
        socket.on('newMessage', (messageData) => {
            const { roomId, text } = messageData;

            // Save the new message to the MySQL database
            saveMessageToRoom(roomId, text);

            // Broadcast the message to everyone in the room, including the sender
            io.to(roomId).emit('message', messageData);
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
