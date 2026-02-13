import React from 'react';
import { PieceType, Color } from '../types';
import { PIECE_SVGS } from '../constants';

interface PromotionModalProps {
  isOpen: boolean;
  color: Color;
  onSelect: (type: PieceType) => void;
}

export const PromotionModal: React.FC<PromotionModalProps> = ({ isOpen, color, onSelect }) => {
  if (!isOpen) return null;

  const options: PieceType[] = ['q', 'r', 'b', 'n'];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 p-4 rounded-xl shadow-2xl border border-slate-600">
        <h3 className="text-white text-center mb-4 font-semibold">Promote Pawn</h3>
        <div className="flex gap-4">
          {options.map((type) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-16 h-16 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-500 hover:border-slate-400"
            >
              <div className="w-12 h-12">
                {PIECE_SVGS[color][type]}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};