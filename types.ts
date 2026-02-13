export type Color = 'w' | 'b';
export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  isCastling?: boolean;
  isEnPassant?: boolean;
  san?: string; // Standard Algebraic Notation
}

export interface GameState {
  board: (Piece | null)[][];
  turn: Color;
  castlingRights: {
    w: { kingSide: boolean; queenSide: boolean };
    b: { kingSide: boolean; queenSide: boolean };
  };
  enPassantTarget: Position | null; // The square behind the pawn that just moved two steps
  halfMoveClock: number;
  fullMoveNumber: number;
  history: Move[];
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  capturedPieces: { w: PieceType[]; b: PieceType[] };
}

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";