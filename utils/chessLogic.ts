import { GameState, Position, Piece, Color, Move, PieceType } from '../types';

export const INITIAL_BOARD: (Piece | null)[][] = [
  [{ type: 'r', color: 'b' }, { type: 'n', color: 'b' }, { type: 'b', color: 'b' }, { type: 'q', color: 'b' }, { type: 'k', color: 'b' }, { type: 'b', color: 'b' }, { type: 'n', color: 'b' }, { type: 'r', color: 'b' }],
  [{ type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }],
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  [{ type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }],
  [{ type: 'r', color: 'w' }, { type: 'n', color: 'w' }, { type: 'b', color: 'w' }, { type: 'q', color: 'w' }, { type: 'k', color: 'w' }, { type: 'b', color: 'w' }, { type: 'n', color: 'w' }, { type: 'r', color: 'w' }],
];

export const createInitialState = (): GameState => ({
  board: JSON.parse(JSON.stringify(INITIAL_BOARD)), // Deep copy
  turn: 'w',
  castlingRights: {
    w: { kingSide: true, queenSide: true },
    b: { kingSide: true, queenSide: true },
  },
  enPassantTarget: null,
  halfMoveClock: 0,
  fullMoveNumber: 1,
  history: [],
  isCheck: false,
  isCheckmate: false,
  isStalemate: false,
  capturedPieces: { w: [], b: [] },
});

// Utility to check if a square is on board
export const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

// Utility to deep copy board
export const copyBoard = (board: (Piece | null)[][]) => board.map(row => row.map(cell => (cell ? { ...cell } : null)));

// Get all pseudo-legal moves for a piece (without king safety checks)
const getPseudoLegalMoves = (
  board: (Piece | null)[][],
  pos: Position,
  castlingRights: GameState['castlingRights'],
  enPassantTarget: Position | null
): Move[] => {
  const { row, col } = pos;
  const piece = board[row][col];
  if (!piece) return [];
  
  const moves: Move[] = [];
  const directions: Record<string, [number, number][]> = {
    n: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
    b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
    k: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
  };

  const addMove = (r: number, c: number, special?: Partial<Move>) => {
    moves.push({
      from: pos,
      to: { row: r, col: c },
      piece,
      captured: board[r][c] || undefined,
      ...special
    });
  };

  if (piece.type === 'p') {
    const direction = piece.color === 'w' ? -1 : 1;
    const startRow = piece.color === 'w' ? 6 : 1;
    
    // Forward 1
    if (onBoard(row + direction, col) && !board[row + direction][col]) {
      // Check promotion
      if (row + direction === 0 || row + direction === 7) {
        addMove(row + direction, col, { promotion: 'q' }); // Default auto-queen for now in generation
      } else {
        addMove(row + direction, col);
      }
      
      // Forward 2
      if (row === startRow && onBoard(row + 2 * direction, col) && !board[row + 2 * direction][col]) {
        addMove(row + 2 * direction, col);
      }
    }

    // Capture Diagonals
    [[direction, -1], [direction, 1]].forEach(([dr, dc]) => {
      const nr = row + dr;
      const nc = col + dc;
      if (onBoard(nr, nc)) {
        if (board[nr][nc] && board[nr][nc]!.color !== piece.color) {
          if (nr === 0 || nr === 7) {
             addMove(nr, nc, { promotion: 'q' });
          } else {
             addMove(nr, nc);
          }
        } else if (enPassantTarget && nr === enPassantTarget.row && nc === enPassantTarget.col) {
          // En Passant
           addMove(nr, nc, { isEnPassant: true, captured: { type: 'p', color: piece.color === 'w' ? 'b' : 'w'} });
        }
      }
    });
  } else if (piece.type === 'n' || piece.type === 'k') {
    const dirs = directions[piece.type];
    dirs.forEach(([dr, dc]) => {
      const nr = row + dr;
      const nc = col + dc;
      if (onBoard(nr, nc)) {
        const target = board[nr][nc];
        if (!target || target.color !== piece.color) {
          addMove(nr, nc);
        }
      }
    });

    // Castling Logic
    if (piece.type === 'k') {
      const rights = piece.color === 'w' ? castlingRights.w : castlingRights.b;
      const rowIdx = piece.color === 'w' ? 7 : 0;
      if (row === rowIdx && col === 4) {
        // King Side
        if (rights.kingSide && !board[rowIdx][5] && !board[rowIdx][6] && 
            board[rowIdx][7]?.type === 'r' && board[rowIdx][7]?.color === piece.color) {
           addMove(rowIdx, 6, { isCastling: true });
        }
        // Queen Side
        if (rights.queenSide && !board[rowIdx][3] && !board[rowIdx][2] && !board[rowIdx][1] &&
             board[rowIdx][0]?.type === 'r' && board[rowIdx][0]?.color === piece.color) {
           addMove(rowIdx, 2, { isCastling: true });
        }
      }
    }

  } else {
    // Sliding pieces (b, r, q)
    const dirs = directions[piece.type];
    dirs.forEach(([dr, dc]) => {
      let nr = row + dr;
      let nc = col + dc;
      while (onBoard(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          addMove(nr, nc);
        } else {
          if (target.color !== piece.color) {
            addMove(nr, nc);
          }
          break; // Blocked
        }
        nr += dr;
        nc += dc;
      }
    });
  }

  return moves;
};

// Check if a square is attacked by opponent
export const isSquareAttacked = (board: (Piece | null)[][], pos: Position, attackerColor: Color): boolean => {
  // Simplistic approach: Generate all pseudo moves for attackerColor and see if 'pos' is in them.
  // Optimization: Reverse logic (can a Knight at 'pos' attack an enemy knight? etc.)
  
  // Checking pawn attacks (reverse of pawn movement)
  const pawnDir = attackerColor === 'w' ? -1 : 1; // Attack comes from this direction
  // If we are checking if white attacks us, white pawns are "below" coming up (-1).
  // Actually, simpler: Iterate all pieces of attackerColor.
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === attackerColor) {
        const moves = getPseudoLegalMoves(board, {row:r, col:c}, {w:{kingSide:false,queenSide:false}, b:{kingSide:false,queenSide:false}}, null);
        if (moves.some(m => m.to.row === pos.row && m.to.col === pos.col)) {
          return true;
        }
      }
    }
  }
  return false;
};

// Check if King is in check
export const isKingInCheck = (board: (Piece | null)[][], color: Color): boolean => {
  let kingPos: Position | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) {
        kingPos = { row: r, col: c };
        break;
      }
    }
  }
  if (!kingPos) return true; // Should not happen
  return isSquareAttacked(board, kingPos, color === 'w' ? 'b' : 'w');
};

// Get Full Legal Moves (filtering out moves that leave king in check)
export const getLegalMoves = (gameState: GameState, pos: Position): Move[] => {
  const pseudoMoves = getPseudoLegalMoves(gameState.board, pos, gameState.castlingRights, gameState.enPassantTarget);
  const legalMoves: Move[] = [];

  for (const move of pseudoMoves) {
    // Simulate move
    const tempBoard = copyBoard(gameState.board);
    
    // Execute move on temp board
    tempBoard[move.to.row][move.to.col] = move.piece;
    tempBoard[move.from.row][move.from.col] = null;
    
    // Handle En Passant capture removal
    if (move.isEnPassant) {
       const captureRow = move.from.row; 
       const captureCol = move.to.col;
       tempBoard[captureRow][captureCol] = null;
    }
    
    // Check if King is in check
    if (!isKingInCheck(tempBoard, gameState.turn)) {
      // Special Castling checks:
      // 1. King cannot be in check currently.
      // 2. Square crossed cannot be attacked.
      if (move.isCastling) {
        if (isKingInCheck(gameState.board, gameState.turn)) continue;
        
        const row = move.from.row;
        // Middle square
        const midCol = (move.from.col + move.to.col) / 2;
        if (isSquareAttacked(gameState.board, { row, col: midCol }, gameState.turn === 'w' ? 'b' : 'w')) {
          continue;
        }
      }
      legalMoves.push(move);
    }
  }
  return legalMoves;
};

// Convert move to SAN (Simplistic)
const getSan = (move: Move, board: (Piece | null)[][], check: boolean, mate: boolean): string => {
  if (move.isCastling) {
    return move.to.col > move.from.col ? "O-O" : "O-O-O";
  }
  let san = "";
  if (move.piece.type !== 'p') san += move.piece.type.toUpperCase();
  
  if (move.captured || move.isEnPassant) {
    if (move.piece.type === 'p') san += String.fromCharCode(97 + move.from.col);
    san += "x";
  }
  
  san += String.fromCharCode(97 + move.to.col) + (8 - move.to.row);
  
  if (move.promotion) {
    san += "=" + move.promotion.toUpperCase();
  }
  
  if (mate) san += "#";
  else if (check) san += "+";
  
  return san;
};


export const executeMove = (prevState: GameState, move: Move, promotionOverride?: PieceType): GameState => {
  const nextState = { ...prevState };
  const board = copyBoard(prevState.board);
  const piece = { ...move.piece };

  // Handle promotion
  if (move.promotion || promotionOverride) {
    piece.type = promotionOverride || move.promotion || 'q';
  }

  // Execute on board
  board[move.to.row][move.to.col] = piece;
  board[move.from.row][move.from.col] = null;

  // Handle Capture
  let capturedPiece = move.captured;
  if (move.isEnPassant) {
     const capRow = move.from.row;
     const capCol = move.to.col;
     capturedPiece = board[capRow][capCol]!;
     board[capRow][capCol] = null;
  }
  
  if (capturedPiece) {
    if (capturedPiece.color === 'w') nextState.capturedPieces.w = [...nextState.capturedPieces.w, capturedPiece.type];
    else nextState.capturedPieces.b = [...nextState.capturedPieces.b, capturedPiece.type];
  }

  // Handle Castling Rook Move
  if (move.isCastling) {
    const row = move.from.row;
    if (move.to.col === 6) { // King Side
      board[row][5] = board[row][7];
      board[row][7] = null;
    } else { // Queen Side
      board[row][3] = board[row][0];
      board[row][0] = null;
    }
  }

  // Update Castling Rights
  const rights = JSON.parse(JSON.stringify(nextState.castlingRights));
  if (piece.type === 'k') {
    if (piece.color === 'w') { rights.w.kingSide = false; rights.w.queenSide = false; }
    else { rights.b.kingSide = false; rights.b.queenSide = false; }
  }
  if (piece.type === 'r') {
    if (move.from.row === 7 && move.from.col === 0) rights.w.queenSide = false;
    if (move.from.row === 7 && move.from.col === 7) rights.w.kingSide = false;
    if (move.from.row === 0 && move.from.col === 0) rights.b.queenSide = false;
    if (move.from.row === 0 && move.from.col === 7) rights.b.kingSide = false;
  }
  // If rook is captured
  if (capturedPiece && capturedPiece.type === 'r') {
     if (move.to.row === 7 && move.to.col === 0) rights.w.queenSide = false;
     if (move.to.row === 7 && move.to.col === 7) rights.w.kingSide = false;
     if (move.to.row === 0 && move.to.col === 0) rights.b.queenSide = false;
     if (move.to.row === 0 && move.to.col === 7) rights.b.kingSide = false;
  }
  nextState.castlingRights = rights;

  // Update En Passant Target
  nextState.enPassantTarget = null;
  if (piece.type === 'p' && Math.abs(move.to.row - move.from.row) === 2) {
    nextState.enPassantTarget = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
  }

  // Update State
  nextState.board = board;
  nextState.turn = prevState.turn === 'w' ? 'b' : 'w';
  nextState.fullMoveNumber = prevState.turn === 'b' ? prevState.fullMoveNumber + 1 : prevState.fullMoveNumber;
  
  // Check/Mate Detection
  const isCheck = isKingInCheck(board, nextState.turn);
  nextState.isCheck = isCheck;

  // Count legal moves for next player
  let hasLegalMoves = false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === nextState.turn) {
        if (getLegalMoves(nextState, { row: r, col: c }).length > 0) {
          hasLegalMoves = true;
          break;
        }
      }
    }
    if (hasLegalMoves) break;
  }

  if (!hasLegalMoves) {
    if (isCheck) nextState.isCheckmate = true;
    else nextState.isStalemate = true;
  }

  // Add History
  const san = getSan(move, prevState.board, isCheck, nextState.isCheckmate);
  nextState.history = [...nextState.history, { ...move, san }];

  return nextState;
};
