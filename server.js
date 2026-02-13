import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Room state: Map<roomId, { players: [{id, color}], chess: Chess, chat: [] }>
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`⚡ Connected: ${socket.id}`);

    // ─── Join Room ───────────────────────────────────────────
    socket.on('join-room', (roomId) => {
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                players: [],
                chess: new Chess(),
                chat: [],
            });
        }

        const room = rooms.get(roomId);

        // Room full check
        if (room.players.length >= 2) {
            socket.emit('room-full');
            return;
        }

        // Assign color: first joiner = white, second = black
        const color = room.players.length === 0 ? 'w' : 'b';
        room.players.push({ id: socket.id, color });

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerColor = color;

        // Send role & current state to the joining player
        socket.emit('role-assigned', {
            color,
            fen: room.chess.fen(),
            chat: room.chat,
        });

        // If both players are in, notify the room that the game can start
        if (room.players.length === 2) {
            io.to(roomId).emit('game-start', {
                fen: room.chess.fen(),
            });
        } else {
            socket.emit('waiting-for-opponent');
        }

        console.log(`🎮 ${socket.id} joined room ${roomId} as ${color === 'w' ? 'White' : 'Black'}`);
    });

    // ─── Move ────────────────────────────────────────────────
    socket.on('move', ({ roomId, from, to, promotion }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const chess = room.chess;

        // Verify it's this player's turn
        const player = room.players.find((p) => p.id === socket.id);
        if (!player || player.color !== chess.turn()) {
            socket.emit('invalid-move', { message: "Not your turn" });
            return;
        }

        // Attempt the move
        const moveResult = chess.move({ from, to, promotion: promotion || 'q' });
        if (!moveResult) {
            socket.emit('invalid-move', { message: 'Illegal move' });
            return;
        }

        // Broadcast updated state to entire room
        const gameState = {
            fen: chess.fen(),
            move: moveResult,
            isCheck: chess.isCheck(),
            isCheckmate: chess.isCheckmate(),
            isStalemate: chess.isStalemate(),
            isDraw: chess.isDraw(),
            isGameOver: chess.isGameOver(),
            turn: chess.turn(),
            history: chess.history(),
        };

        io.to(roomId).emit('move-made', gameState);

        // If game is over, emit game-over event
        if (chess.isGameOver()) {
            let result = 'draw';
            if (chess.isCheckmate()) {
                result = chess.turn() === 'w' ? 'b' : 'w'; // winner is the one who just moved
            }
            io.to(roomId).emit('game-over', {
                result,
                reason: chess.isCheckmate()
                    ? 'checkmate'
                    : chess.isStalemate()
                        ? 'stalemate'
                        : chess.isDraw()
                            ? 'draw'
                            : 'unknown',
            });
        }

        console.log(`♟️  Move in room ${roomId}: ${moveResult.san}`);
    });

    // ─── Chat ────────────────────────────────────────────────
    socket.on('chat-message', ({ roomId, message }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;

        const chatMsg = {
            sender: player.color === 'w' ? 'White' : 'Black',
            color: player.color,
            message,
            timestamp: Date.now(),
        };

        room.chat.push(chatMsg);
        io.to(roomId).emit('chat-message', chatMsg);
    });

    // ─── Disconnect ──────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log(`💀 Disconnected: ${socket.id}`);

        const roomId = socket.roomId;
        if (!roomId || !rooms.has(roomId)) return;

        const room = rooms.get(roomId);

        // Remove the player
        room.players = room.players.filter((p) => p.id !== socket.id);

        // Notify remaining player
        if (room.players.length > 0) {
            io.to(roomId).emit('opponent-disconnected');
        } else {
            // Room is empty, clean up
            rooms.delete(roomId);
            console.log(`🗑️  Room ${roomId} deleted`);
        }
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 Chess server running on http://localhost:${PORT}`);
});
