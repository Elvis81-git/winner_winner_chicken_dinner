const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameRoom } = require('./game');

const app = express();
const server = http.createServer(app);

// Use socket.io with CORS configurations (if needed in production, but since they are hosted together, simple is fine)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Fallback for SPA or simple index
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Map to store active game rooms: roomId -> GameRoom instance
const rooms = {};

// Helper function to clean up empty rooms
function cleanupRoom(roomId) {
    const room = rooms[roomId];
    if (room && Object.keys(room.players).length === 0) {
        room.stop();
        delete rooms[roomId];
        console.log(`[Room Cleanup] Room ${roomId} was deleted because it is empty.`);
    }
}

io.on('connection', (socket) => {
    console.log(`[Connection] User connected: ${socket.id}`);
    
    socket.roomId = null;

    // Join a room
    socket.on('joinRoom', ({ roomId, name }) => {
        // Clean room ID (trim, uppercase, default to 'LOBBY' if empty)
        let id = (roomId || '').trim().toUpperCase();
        if (!id) id = 'DEFAULT';

        // Leave current room if already in one
        if (socket.roomId) {
            const oldRoomId = socket.roomId;
            if (rooms[oldRoomId]) {
                rooms[oldRoomId].removePlayer(socket.id);
                socket.leave(oldRoomId);
                cleanupRoom(oldRoomId);
            }
        }

        // Initialize room if it doesn't exist
        if (!rooms[id]) {
            rooms[id] = new GameRoom(id, io);
            console.log(`[Room Create] Room ${id} created by ${name || socket.id}`);
        }

        // Setup socket metadata
        socket.roomId = id;
        socket.join(id);

        // Add player to the room
        rooms[id].addPlayer(socket.id, name);
        console.log(`[Room Join] ${name || socket.id} joined Room ${id}`);
    });

    // Start game countdown
    socket.on('startGame', () => {
        const id = socket.roomId;
        if (id && rooms[id]) {
            rooms[id].initGame();
        }
    });

    // Update settings (Bots count & Max players)
    socket.on('updateSettings', (settings) => {
        const id = socket.roomId;
        if (id && rooms[id]) {
            rooms[id].updateSettings(settings);
        }
    });

    // Handle game input
    socket.on('playerInput', (input) => {
        const id = socket.roomId;
        if (id && rooms[id]) {
            rooms[id].updatePlayerInput(socket.id, input);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`[Disconnect] User disconnected: ${socket.id}`);
        const id = socket.roomId;
        if (id && rooms[id]) {
            rooms[id].removePlayer(socket.id);
            cleanupRoom(id);
        }
    });
});

server.listen(PORT, () => {
    console.log(`[Server] Game server running on port ${PORT}`);
});
