import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess, Square } from 'chess.js';
import { io, Socket } from 'socket.io-client';
import { Crown, Swords, Send, MessageCircle, LogIn, Wifi, WifiOff, RotateCcw, Copy, Check } from 'lucide-react';
import { PIECE_SVGS } from './constants';
import { PieceType, Color as PieceColor } from './types';

// ─── Types ──────────────────────────────────────────────────
interface ChatMessage {
  sender: string;
  color: string;
  message: string;
  timestamp: number;
}

// ─── Socket singleton ───────────────────────────────────────
const socket: Socket = io('/', {
  transports: ['websocket', 'polling'],
  autoConnect: true,
});

// ─── Helpers ────────────────────────────────────────────────
function squareToRowCol(sq: string, flipped: boolean): { row: number; col: number } {
  const col = sq.charCodeAt(0) - 97; // a=0 .. h=7
  const row = 8 - parseInt(sq[1]);   // 1->7 .. 8->0
  if (flipped) return { row: 7 - row, col: 7 - col };
  return { row, col };
}

function rowColToSquare(row: number, col: number, flipped: boolean): string {
  const r = flipped ? 7 - row : row;
  const c = flipped ? 7 - col : col;
  return String.fromCharCode(97 + c) + (8 - r);
}

function getPieceAt(chess: Chess, sq: string): { type: PieceType; color: PieceColor } | null {
  const p = chess.get(sq as Square);
  if (!p) return null;
  return { type: p.type as PieceType, color: p.color as PieceColor };
}

// ─── Component ──────────────────────────────────────────────
export default function App() {
  // Connection & Room state
  const [screen, setScreen] = useState<'lobby' | 'game'>('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [copied, setCopied] = useState(false);

  // Game state
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  // Game over state
  const [gameOver, setGameOver] = useState<{ result: string; reason: string } | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);

  // Refs
  const historyEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const flipped = playerColor === 'b';

  // ─── Socket listeners ─────────────────────────────────────
  useEffect(() => {
    socket.on('role-assigned', ({ color, fen: initialFen, chat }) => {
      setPlayerColor(color);
      chess.load(initialFen);
      setFen(initialFen);
      setMoveHistory(chess.history());
      setChatMessages(chat || []);
      setScreen('game');
    });

    socket.on('waiting-for-opponent', () => {
      setWaiting(true);
    });

    socket.on('game-start', ({ fen: startFen }) => {
      setWaiting(false);
      chess.load(startFen);
      setFen(startFen);
    });

    socket.on('room-full', () => {
      setRoomFull(true);
      setTimeout(() => setRoomFull(false), 3000);
    });

    socket.on('move-made', ({ fen: newFen, move, history }) => {
      chess.load(newFen);
      setFen(newFen);
      setMoveHistory(history);
      setLastMove({ from: move.from, to: move.to });
      setSelectedSquare(null);
      setLegalMoves([]);
    });

    socket.on('game-over', ({ result, reason }) => {
      setGameOver({ result, reason });
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on('opponent-disconnected', () => {
      setOpponentDisconnected(true);
    });

    socket.on('invalid-move', ({ message }) => {
      console.warn('Invalid move:', message);
    });

    return () => {
      socket.off('role-assigned');
      socket.off('waiting-for-opponent');
      socket.off('game-start');
      socket.off('room-full');
      socket.off('move-made');
      socket.off('game-over');
      socket.off('chat-message');
      socket.off('opponent-disconnected');
      socket.off('invalid-move');
    };
  }, [chess]);

  // Scroll history + chat to bottom
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moveHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ─── Handlers ─────────────────────────────────────────────
  const joinRoom = useCallback(() => {
    const id = roomId.trim();
    if (!id) return;
    setRoomFull(false);
    setOpponentDisconnected(false);
    setGameOver(null);
    socket.emit('join-room', id);
  }, [roomId]);

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  const handleSquareClick = useCallback(
    (square: string) => {
      if (gameOver || waiting || opponentDisconnected) return;

      // Turn enforcement
      if (chess.turn() !== playerColor) return;

      const piece = chess.get(square as Square);

      // If we have a selected piece and click a legal move target
      if (selectedSquare && legalMoves.includes(square)) {
        // Check for promotion
        const movingPiece = chess.get(selectedSquare as Square);
        if (
          movingPiece?.type === 'p' &&
          ((movingPiece.color === 'w' && square[1] === '8') ||
            (movingPiece.color === 'b' && square[1] === '1'))
        ) {
          setPromotionPending({ from: selectedSquare, to: square });
          return;
        }

        // Regular move
        socket.emit('move', {
          roomId,
          from: selectedSquare,
          to: square,
        });
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      // Select own piece
      if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        const moves = chess.moves({ square: square as Square, verbose: true });
        setLegalMoves(moves.map((m) => m.to));
        return;
      }

      // Deselect
      setSelectedSquare(null);
      setLegalMoves([]);
    },
    [chess, gameOver, waiting, opponentDisconnected, playerColor, selectedSquare, legalMoves, roomId]
  );

  const handlePromotion = useCallback(
    (promotionPiece: string) => {
      if (!promotionPending) return;
      socket.emit('move', {
        roomId,
        from: promotionPending.from,
        to: promotionPending.to,
        promotion: promotionPiece,
      });
      setPromotionPending(null);
      setSelectedSquare(null);
      setLegalMoves([]);
    },
    [promotionPending, roomId]
  );

  const sendChat = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg) return;
    socket.emit('chat-message', { roomId, message: msg });
    setChatInput('');
  }, [chatInput, roomId]);

  // ─── Status text ──────────────────────────────────────────
  const getStatusText = () => {
    if (gameOver) {
      if (gameOver.reason === 'checkmate') {
        const winner = gameOver.result === 'w' ? 'White' : 'Black';
        return `🏆 Checkmate! ${winner} wins!`;
      }
      if (gameOver.reason === 'stalemate') return '🤝 Stalemate — Draw';
      return '🤝 Game drawn';
    }
    if (opponentDisconnected) return '⚠️ Opponent disconnected';
    if (waiting) return '⏳ Waiting for opponent...';
    if (chess.isCheck()) return '⚠️ Check!';
    if (chess.turn() === playerColor) return '🟢 Your turn';
    return "🔴 Opponent's turn";
  };

  const getStatusColor = () => {
    if (gameOver) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (opponentDisconnected) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (chess.isCheck()) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (chess.turn() === playerColor) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    return 'bg-slate-700/50 text-slate-300 border-slate-600';
  };

  // ═══════════════════════════════════════════════════════════
  //  LOBBY SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 mb-5">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-purple-300">
              Chess Arena
            </h1>
            <p className="text-slate-400 text-sm mt-2 flex items-center justify-center gap-1.5">
              <Swords className="w-4 h-4" />
              Real-time Multiplayer PvP
            </p>
          </div>

          {/* Join Card */}
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
            <label className="block text-sm font-semibold text-slate-300 mb-2">Room ID</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              placeholder="Enter a room ID to join..."
              className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-lg tracking-wide"
            />

            {roomFull && (
              <div className="mt-3 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                Room is full! Try a different Room ID.
              </div>
            )}

            <button
              onClick={joinRoom}
              disabled={!roomId.trim()}
              className="w-full mt-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 active:scale-[0.98]"
            >
              <LogIn className="w-5 h-5" />
              Join Room
            </button>

            <p className="text-slate-500 text-xs text-center mt-4">
              Share the same Room ID with a friend to play together
            </p>
          </div>

          {/* Connection status */}
          <div className="flex items-center justify-center gap-2 mt-6 text-xs">
            {socket.connected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Connected to server</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400">Connecting...</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  GAME SCREEN
  // ═══════════════════════════════════════════════════════════
  const RANKS = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  const FILES = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-4 lg:p-6">
      {/* Promotion Modal */}
      {promotionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4 text-center">Promote Pawn</h3>
            <div className="flex gap-3">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => handlePromotion(t)}
                  className="w-16 h-16 bg-slate-700 hover:bg-indigo-600 rounded-xl transition-all duration-150 flex items-center justify-center p-2 border border-slate-600 hover:border-indigo-400 hover:scale-110"
                >
                  {PIECE_SVGS[playerColor as PieceColor][t]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="w-full max-w-6xl flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white hidden sm:block">Chess Arena</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs">
            <span className="text-slate-400">Room:</span>
            <span className="text-indigo-300 font-mono font-bold">{roomId}</span>
            <button onClick={copyRoomId} className="text-slate-400 hover:text-white transition-colors ml-1">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className={`px-3 py-1.5 text-xs font-bold rounded-lg ${playerColor === 'w' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-slate-600'}`}>
            {playerColor === 'w' ? '♔ White' : '♚ Black'}
          </div>
        </div>
      </div>

      {/* Main Grid: Board + Sidebar */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 lg:gap-6">
        {/* Board Column */}
        <div className="flex flex-col items-center gap-3">
          {/* Opponent Bar */}
          <div className="w-full max-w-[600px] flex items-center gap-3 bg-slate-800/60 backdrop-blur border border-slate-700/50 px-4 py-2.5 rounded-xl">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${playerColor === 'b' ? 'bg-white text-black' : 'bg-slate-900 text-white border border-slate-600'}`}>
              {playerColor === 'b' ? '♔' : '♚'}
            </div>
            <span className="text-slate-200 font-medium text-sm">
              Opponent ({playerColor === 'b' ? 'White' : 'Black'})
            </span>
            {opponentDisconnected && (
              <span className="ml-auto text-xs text-red-400 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Left
              </span>
            )}
          </div>

          {/* Status Bar */}
          <div className={`w-full max-w-[600px] text-center text-sm font-semibold py-2 rounded-lg border ${getStatusColor()}`}>
            {getStatusText()}
          </div>

          {/* Chess Board */}
          <div className="relative w-full max-w-[600px] aspect-square bg-slate-800/40 backdrop-blur rounded-xl shadow-2xl p-1.5 border border-slate-700/50">
            <div className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-lg overflow-hidden">
              {RANKS.map((visualRow) =>
                FILES.map((visualCol) => {
                  const square = rowColToSquare(visualRow, visualCol, flipped);
                  const piece = getPieceAt(chess, square);
                  const actualRow = flipped ? 7 - visualRow : visualRow;
                  const actualCol = flipped ? 7 - visualCol : visualCol;
                  const isBlack = (actualRow + actualCol) % 2 === 1;
                  const isSelected = selectedSquare === square;
                  const isLegal = legalMoves.includes(square);
                  const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
                  const isCheckSquare =
                    chess.isCheck() &&
                    piece?.type === 'k' &&
                    piece?.color === chess.turn();

                  // Determine square color
                  let bgColor = isBlack ? 'bg-[#779556]' : 'bg-[#ebecd0]';
                  if (isSelected) bgColor = '!bg-[#baca44]';
                  else if (isLast) bgColor = isBlack ? '!bg-[#b9ca43]' : '!bg-[#f5f682]';
                  if (isCheckSquare) bgColor = '!bg-red-500/80';

                  return (
                    <div
                      key={square}
                      onClick={() => handleSquareClick(square)}
                      className={`relative flex items-center justify-center cursor-pointer select-none transition-colors duration-75 ${bgColor}`}
                    >
                      {/* Rank labels */}
                      {visualCol === 0 && (
                        <span className={`absolute left-0.5 top-0.5 text-[10px] md:text-xs font-bold pointer-events-none ${isBlack ? 'text-[#ebecd0]' : 'text-[#779556]'}`}>
                          {square[1]}
                        </span>
                      )}
                      {/* File labels */}
                      {visualRow === 7 && (
                        <span className={`absolute right-0.5 bottom-0 text-[10px] md:text-xs font-bold pointer-events-none ${isBlack ? 'text-[#ebecd0]' : 'text-[#779556]'}`}>
                          {square[0]}
                        </span>
                      )}

                      {/* Piece */}
                      {piece && (
                        <div className="w-[85%] h-[85%] transition-transform duration-150">
                          {PIECE_SVGS[piece.color][piece.type]}
                        </div>
                      )}

                      {/* Legal move indicator: dot for empty, ring for capture */}
                      {isLegal && !piece && (
                        <div className="absolute w-3 h-3 md:w-4 md:h-4 bg-black/25 rounded-full" />
                      )}
                      {isLegal && piece && (
                        <div className="absolute inset-0 border-[5px] md:border-[6px] border-black/20 rounded-full pointer-events-none" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Waiting Overlay */}
            {waiting && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
                <div className="text-center px-8 py-6 bg-slate-800/90 rounded-2xl border border-slate-600">
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="text-white font-semibold text-lg">Waiting for opponent...</p>
                  <p className="text-slate-400 text-sm mt-1">Share Room ID: <span className="text-indigo-300 font-mono font-bold">{roomId}</span></p>
                </div>
              </div>
            )}

            {/* Game Over Overlay */}
            {gameOver && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-xl">
                <div className="bg-slate-800 border border-slate-600 p-8 rounded-2xl shadow-2xl text-center max-w-xs">
                  <div className="text-5xl mb-3">
                    {gameOver.reason === 'checkmate' ? '🏆' : '🤝'}
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    {gameOver.reason === 'checkmate' ? 'Checkmate!' : gameOver.reason === 'stalemate' ? 'Stalemate!' : 'Draw!'}
                  </h2>
                  <p className="text-slate-300 text-sm mb-5">
                    {gameOver.reason === 'checkmate'
                      ? gameOver.result === playerColor
                        ? '🎉 You won!'
                        : 'You lost. Better luck next time!'
                      : 'The game is a draw.'}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 mx-auto shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4" />
                    New Game
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Player Bar */}
          <div className="w-full max-w-[600px] flex items-center gap-3 bg-slate-800/60 backdrop-blur border border-slate-700/50 px-4 py-2.5 rounded-xl">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${playerColor === 'w' ? 'bg-white text-black' : 'bg-slate-900 text-white border border-slate-600'}`}>
              {playerColor === 'w' ? '♔' : '♚'}
            </div>
            <span className="text-slate-200 font-medium text-sm">
              You ({playerColor === 'w' ? 'White' : 'Black'})
            </span>
          </div>
        </div>

        {/* Sidebar: Move History + Chat */}
        <div className="flex flex-col gap-4 h-full lg:max-h-[700px]">
          {/* Move History */}
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-xl flex flex-col flex-1 min-h-0">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <span className="text-base">📜</span>
              <h2 className="text-sm font-bold text-white">Move History</h2>
              <span className="ml-auto text-xs text-slate-500">{moveHistory.length} moves</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-slate-500 text-xs font-medium w-10">#</th>
                    <th className="px-2 py-1.5 text-slate-500 text-xs font-medium">White</th>
                    <th className="px-2 py-1.5 text-slate-500 text-xs font-medium">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
                    const whiteMove = moveHistory[i * 2];
                    const blackMove = moveHistory[i * 2 + 1];
                    return (
                      <tr key={i} className="even:bg-slate-700/20 hover:bg-slate-700/40 transition-colors">
                        <td className="px-2 py-1.5 text-slate-500 font-mono text-xs">{i + 1}.</td>
                        <td className="px-2 py-1.5 font-medium text-slate-200 text-sm">{whiteMove}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-200 text-sm">{blackMove}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {moveHistory.length === 0 && (
                <div className="text-center text-slate-500 mt-8 text-sm italic">
                  {waiting ? 'Waiting for opponent...' : 'Game started. White to move.'}
                </div>
              )}
              <div ref={historyEndRef} />
            </div>
          </div>

          {/* Chat Panel */}
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-xl flex flex-col flex-1 min-h-0">
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2 hover:bg-slate-700/30 transition-colors rounded-t-xl"
            >
              <MessageCircle className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">Chat</h2>
              <span className="ml-auto text-xs text-slate-500">
                {chatMessages.length > 0 ? `${chatMessages.length} msgs` : ''}
              </span>
            </button>
            {chatOpen && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-[120px]">
                  {chatMessages.length === 0 && (
                    <div className="text-center text-slate-500 text-xs italic mt-4">
                      No messages yet. Say hi! 👋
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${msg.color === playerColor ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`px-3 py-1.5 rounded-xl text-sm max-w-[85%] ${msg.color === playerColor
                            ? 'bg-indigo-600/80 text-white rounded-br-sm'
                            : 'bg-slate-700/80 text-slate-200 rounded-bl-sm'
                          }`}
                      >
                        {msg.message}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 px-1">
                        {msg.sender}
                      </span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-2 border-t border-slate-700/50">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 bg-slate-900/60 border border-slate-600/50 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                    <button
                      onClick={sendChat}
                      disabled={!chatInput.trim()}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}