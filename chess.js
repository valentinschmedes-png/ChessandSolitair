/* ========================================================================
   Schach-Engine
   - Vollständige Regeln: legale Züge inkl. Schachgebot/Deckung,
     Rochade, En-Passant, Bauernumwandlung, Schachmatt/Patt.
   - Bot mit 3 Schwierigkeitsgraden (Minimax mit Alpha-Beta + bewusste
     Fehlerquote auf "leicht").
   ======================================================================== */

const PIECE_UNICODE = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
};

const FILES = ['a','b','c','d','e','f','g','h'];

function makeInitialBoard(){
  const empty = () => Array.from({length:8}, () => Array(8).fill(null));
  const board = empty();
  const backRank = ['R','N','B','Q','K','B','N','R'];
  for(let f=0; f<8; f++){
    board[0][f] = { type: backRank[f], color: 'b' };
    board[1][f] = { type: 'P', color: 'b' };
    board[6][f] = { type: 'P', color: 'w' };
    board[7][f] = { type: backRank[f], color: 'w' };
  }
  return board;
}

class ChessGame {
  constructor(){
    this.board = makeInitialBoard();
    this.turn = 'w';
    this.history = []; // { from, to, piece, captured, special, prevState }
    this.castling = { wK:true, wQ:true, bK:true, bQ:true };
    this.enPassantTarget = null; // {r,c} square that can be captured into
    this.captured = { w: [], b: [] }; // pieces captured BY each color
    this.kingPos = { w: {r:7,c:4}, b: {r:0,c:4} };
  }

  clone(){
    const g = new ChessGame();
    g.board = this.board.map(row => row.map(cell => cell ? {...cell} : null));
    g.turn = this.turn;
    g.castling = {...this.castling};
    g.enPassantTarget = this.enPassantTarget ? {...this.enPassantTarget} : null;
    g.captured = { w:[...this.captured.w], b:[...this.captured.b] };
    g.kingPos = { w:{...this.kingPos.w}, b:{...this.kingPos.b} };
    g.history = this.history.slice();
    return g;
  }

  inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
  at(r,c){ return this.board[r][c]; }

  opponent(color){ return color === 'w' ? 'b' : 'w'; }

  // ---------------- Pseudo-legal move generation (ignores own-king-check) ----------------
  pseudoMovesForPiece(r, c){
    const piece = this.at(r,c);
    if(!piece) return [];
    const moves = [];
    const dirsDiag = [[-1,-1],[-1,1],[1,-1],[1,1]];
    const dirsStraight = [[-1,0],[1,0],[0,-1],[0,1]];

    const addSlide = (dirs) => {
      for(const [dr,dc] of dirs){
        let nr = r+dr, nc = c+dc;
        while(this.inBounds(nr,nc)){
          const target = this.at(nr,nc);
          if(!target){
            moves.push({from:{r,c}, to:{r:nr,c:nc}});
          } else {
            if(target.color !== piece.color){
              moves.push({from:{r,c}, to:{r:nr,c:nc}, capture:true});
            }
            break;
          }
          nr += dr; nc += dc;
        }
      }
    };

    switch(piece.type){
      case 'P': {
        const dir = piece.color === 'w' ? -1 : 1;
        const startRow = piece.color === 'w' ? 6 : 1;
        const promoRow = piece.color === 'w' ? 0 : 7;
        // forward
        if(this.inBounds(r+dir,c) && !this.at(r+dir,c)){
          moves.push({from:{r,c}, to:{r:r+dir,c}, promotion: r+dir===promoRow});
          if(r === startRow && !this.at(r+2*dir, c)){
            moves.push({from:{r,c}, to:{r:r+2*dir,c}, doubleStep:true});
          }
        }
        // captures
        for(const dc of [-1,1]){
          const nr=r+dir, nc=c+dc;
          if(!this.inBounds(nr,nc)) continue;
          const target = this.at(nr,nc);
          if(target && target.color !== piece.color){
            moves.push({from:{r,c}, to:{r:nr,c:nc}, capture:true, promotion: nr===promoRow});
          } else if(!target && this.enPassantTarget && this.enPassantTarget.r===nr && this.enPassantTarget.c===nc){
            moves.push({from:{r,c}, to:{r:nr,c:nc}, capture:true, enPassant:true});
          }
        }
        break;
      }
      case 'N': {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for(const [dr,dc] of jumps){
          const nr=r+dr, nc=c+dc;
          if(!this.inBounds(nr,nc)) continue;
          const target = this.at(nr,nc);
          if(!target) moves.push({from:{r,c}, to:{r:nr,c:nc}});
          else if(target.color !== piece.color) moves.push({from:{r,c}, to:{r:nr,c:nc}, capture:true});
        }
        break;
      }
      case 'B': addSlide(dirsDiag); break;
      case 'R': addSlide(dirsStraight); break;
      case 'Q': addSlide(dirsDiag.concat(dirsStraight)); break;
      case 'K': {
        for(const [dr,dc] of dirsDiag.concat(dirsStraight)){
          const nr=r+dr, nc=c+dc;
          if(!this.inBounds(nr,nc)) continue;
          const target = this.at(nr,nc);
          if(!target) moves.push({from:{r,c}, to:{r:nr,c:nc}});
          else if(target.color !== piece.color) moves.push({from:{r,c}, to:{r:nr,c:nc}, capture:true});
        }
        // castling
        const color = piece.color;
        const row = color === 'w' ? 7 : 0;
        if(r===row && c===4 && !this.isSquareAttacked(row,4,this.opponent(color))){
          const kSide = color==='w' ? this.castling.wK : this.castling.bK;
          const qSide = color==='w' ? this.castling.wQ : this.castling.bQ;
          if(kSide && !this.at(row,5) && !this.at(row,6) &&
             this.at(row,7) && this.at(row,7).type==='R' && this.at(row,7).color===color &&
             !this.isSquareAttacked(row,5,this.opponent(color)) && !this.isSquareAttacked(row,6,this.opponent(color))){
            moves.push({from:{r,c}, to:{r:row,c:6}, castle:'K'});
          }
          if(qSide && !this.at(row,3) && !this.at(row,2) && !this.at(row,1) &&
             this.at(row,0) && this.at(row,0).type==='R' && this.at(row,0).color===color &&
             !this.isSquareAttacked(row,3,this.opponent(color)) && !this.isSquareAttacked(row,2,this.opponent(color))){
            moves.push({from:{r,c}, to:{r:row,c:2}, castle:'Q'});
          }
        }
        break;
      }
    }
    return moves;
  }

  isSquareAttacked(r, c, byColor){
    // Pawn attacks
    const pawnDir = byColor === 'w' ? 1 : -1; // squares attacked BY a pawn of byColor go "forward" from its perspective; we check from target backwards
    for(const dc of [-1,1]){
      const nr = r + pawnDir, nc = c + dc;
      if(this.inBounds(nr,nc)){
        const p = this.at(nr,nc);
        if(p && p.color===byColor && p.type==='P') return true;
      }
    }
    // Knight
    const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(const [dr,dc] of jumps){
      const nr=r+dr, nc=c+dc;
      if(this.inBounds(nr,nc)){
        const p = this.at(nr,nc);
        if(p && p.color===byColor && p.type==='N') return true;
      }
    }
    // King
    for(const dr of [-1,0,1]) for(const dc of [-1,0,1]){
      if(dr===0 && dc===0) continue;
      const nr=r+dr, nc=c+dc;
      if(this.inBounds(nr,nc)){
        const p = this.at(nr,nc);
        if(p && p.color===byColor && p.type==='K') return true;
      }
    }
    // Sliding: rook/queen
    const straight = [[-1,0],[1,0],[0,-1],[0,1]];
    for(const [dr,dc] of straight){
      let nr=r+dr, nc=c+dc;
      while(this.inBounds(nr,nc)){
        const p = this.at(nr,nc);
        if(p){
          if(p.color===byColor && (p.type==='R'||p.type==='Q')) return true;
          break;
        }
        nr+=dr; nc+=dc;
      }
    }
    // Sliding: bishop/queen
    const diag = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for(const [dr,dc] of diag){
      let nr=r+dr, nc=c+dc;
      while(this.inBounds(nr,nc)){
        const p = this.at(nr,nc);
        if(p){
          if(p.color===byColor && (p.type==='B'||p.type==='Q')) return true;
          break;
        }
        nr+=dr; nc+=dc;
      }
    }
    return false;
  }

  isInCheck(color){
    const kp = this.kingPos[color];
    return this.isSquareAttacked(kp.r, kp.c, this.opponent(color));
  }

  // Apply a move directly to this game's state (no legality check). Returns undo info.
  applyMove(move){
    const { from, to } = move;
    const piece = this.at(from.r, from.c);
    const undo = {
      move,
      capturedPiece: this.at(to.r,to.c),
      castling: {...this.castling},
      enPassantTarget: this.enPassantTarget ? {...this.enPassantTarget} : null,
      enPassantCapturedPiece: null,
      enPassantCapturedPos: null,
      movedPieceOriginalType: piece.type
    };

    // En passant capture
    if(move.enPassant){
      const capR = piece.color==='w' ? to.r+1 : to.r-1;
      undo.enPassantCapturedPiece = this.at(capR, to.c);
      undo.enPassantCapturedPos = {r:capR,c:to.c};
      this.board[capR][to.c] = null;
    }

    // Move piece
    this.board[from.r][from.c] = null;
    let movedPiece = { ...piece };
    if(move.promotion){
      movedPiece.type = move.promotionType || 'Q';
    }
    this.board[to.r][to.c] = movedPiece;

    // Castling rook move
    if(move.castle === 'K'){
      const row = from.r;
      this.board[row][5] = this.board[row][7];
      this.board[row][7] = null;
    } else if(move.castle === 'Q'){
      const row = from.r;
      this.board[row][3] = this.board[row][0];
      this.board[row][0] = null;
    }

    // Update king pos
    if(piece.type === 'K'){
      this.kingPos[piece.color] = {r:to.r,c:to.c};
      if(piece.color==='w'){ this.castling.wK=false; this.castling.wQ=false; }
      else { this.castling.bK=false; this.castling.bQ=false; }
    }
    // Rook moved/captured -> lose castling rights
    if(piece.type === 'R'){
      if(piece.color==='w'){
        if(from.r===7 && from.c===0) this.castling.wQ=false;
        if(from.r===7 && from.c===7) this.castling.wK=false;
      } else {
        if(from.r===0 && from.c===0) this.castling.bQ=false;
        if(from.r===0 && from.c===7) this.castling.bK=false;
      }
    }
    if(undo.capturedPiece && undo.capturedPiece.type==='R'){
      if(to.r===7 && to.c===0) this.castling.wQ=false;
      if(to.r===7 && to.c===7) this.castling.wK=false;
      if(to.r===0 && to.c===0) this.castling.bQ=false;
      if(to.r===0 && to.c===7) this.castling.bK=false;
    }

    // En passant target for next move
    if(move.doubleStep){
      const midR = (from.r + to.r)/2;
      this.enPassantTarget = {r:midR, c:from.c};
    } else {
      this.enPassantTarget = null;
    }

    return undo;
  }

  undoMove(undo){
    const { move } = undo;
    const piece = this.at(move.to.r, move.to.c);
    const originalColor = piece.color;

    // Restore moved piece (undo promotion)
    this.board[move.from.r][move.from.c] = { type: undo.movedPieceOriginalType, color: originalColor };
    this.board[move.to.r][move.to.c] = undo.capturedPiece || null;

    if(move.enPassant){
      this.board[move.to.r][move.to.c] = null;
      this.board[undo.enPassantCapturedPos.r][undo.enPassantCapturedPos.c] = undo.enPassantCapturedPiece;
    }

    if(move.castle === 'K'){
      const row = move.from.r;
      this.board[row][7] = this.board[row][5];
      this.board[row][5] = null;
    } else if(move.castle === 'Q'){
      const row = move.from.r;
      this.board[row][0] = this.board[row][3];
      this.board[row][3] = null;
    }

    if(undo.movedPieceOriginalType === 'K'){
      this.kingPos[originalColor] = {r: move.from.r, c: move.from.c};
    }

    this.castling = undo.castling;
    this.enPassantTarget = undo.enPassantTarget;
  }

  // Legal moves for a square: pseudo-legal moves that don't leave own king in check
  legalMovesForSquare(r,c){
    const piece = this.at(r,c);
    if(!piece) return [];
    const pseudo = this.pseudoMovesForPiece(r,c);
    const legal = [];
    for(const m of pseudo){
      const undo = this.applyMove(m);
      const stillInCheck = this.isInCheck(piece.color);
      this.undoMove(undo);
      if(!stillInCheck) legal.push(m);
    }
    return legal;
  }

  allLegalMoves(color){
    const moves = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p = this.at(r,c);
      if(p && p.color===color){
        moves.push(...this.legalMovesForSquare(r,c));
      }
    }
    return moves;
  }

  makeMove(move){
    const piece = this.at(move.from.r, move.from.c);
    const undo = this.applyMove(move);
    if(undo.capturedPiece){
      this.captured[piece.color].push(undo.capturedPiece.type);
    }
    if(move.enPassant && undo.enPassantCapturedPiece){
      this.captured[piece.color].push(undo.enPassantCapturedPiece.type);
    }
    this.history.push({ move, piece: {...piece}, undo });
    this.turn = this.opponent(this.turn);
    return undo;
  }

  undoLastMove(){
    const last = this.history.pop();
    if(!last) return false;
    const piece = last.piece;
    if(last.undo.capturedPiece) this.captured[piece.color].pop();
    if(last.move.enPassant && last.undo.enPassantCapturedPiece) this.captured[piece.color].pop();
    this.undoMove(last.undo);
    this.turn = piece.color;
    return true;
  }

  gameStatus(){
    const color = this.turn;
    const moves = this.allLegalMoves(color);
    const inCheck = this.isInCheck(color);
    if(moves.length === 0){
      if(inCheck) return { state: 'checkmate', winner: this.opponent(color) };
      return { state: 'stalemate' };
    }
    return { state: inCheck ? 'check' : 'playing' };
  }

  squareName(r,c){ return FILES[c] + (8-r); }
}

// ============================================================================
// Bot AI
// ============================================================================

const PIECE_VALUE = { P:100, N:320, B:330, R:500, Q:900, K:20000 };

// Simple piece-square tables (white perspective; mirrored for black) for better-than-random play
const PST_PAWN = [
  [0,0,0,0,0,0,0,0],
  [50,50,50,50,50,50,50,50],
  [10,10,20,30,30,20,10,10],
  [5,5,10,25,25,10,5,5],
  [0,0,0,20,20,0,0,0],
  [5,-5,-10,0,0,-10,-5,5],
  [5,10,10,-20,-20,10,10,5],
  [0,0,0,0,0,0,0,0]
];
const PST_KNIGHT = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,0,0,0,0,-20,-40],
  [-30,0,10,15,15,10,0,-30],
  [-30,5,15,20,20,15,5,-30],
  [-30,0,15,20,20,15,0,-30],
  [-30,5,10,15,15,10,5,-30],
  [-40,-20,0,5,5,0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];
const PST_BISHOP = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,0,0,0,0,0,0,-10],
  [-10,0,5,10,10,5,0,-10],
  [-10,5,5,10,10,5,5,-10],
  [-10,0,10,10,10,10,0,-10],
  [-10,10,10,10,10,10,10,-10],
  [-10,5,0,0,0,0,5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];
const PST_ROOK = [
  [0,0,0,0,0,0,0,0],
  [5,10,10,10,10,10,10,5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [0,0,0,5,5,0,0,0]
];
const PST_QUEEN = [
  [-20,-10,-10,-5,-5,-10,-10,-20],
  [-10,0,0,0,0,0,0,-10],
  [-10,0,5,5,5,5,0,-10],
  [-5,0,5,5,5,5,0,-5],
  [0,0,5,5,5,5,0,-5],
  [-10,5,5,5,5,5,0,-10],
  [-10,0,5,0,0,0,0,-10],
  [-20,-10,-10,-5,-5,-10,-10,-20]
];
const PST_KING = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20,20,0,0,0,0,20,20],
  [20,30,10,0,0,10,30,20]
];
const PST = { P:PST_PAWN, N:PST_KNIGHT, B:PST_BISHOP, R:PST_ROOK, Q:PST_QUEEN, K:PST_KING };

function evaluateBoard(game){
  let score = 0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = game.at(r,c);
    if(!p) continue;
    const value = PIECE_VALUE[p.type];
    const pstRow = p.color === 'w' ? r : 7-r;
    const positional = PST[p.type][pstRow][c];
    const sign = p.color === 'w' ? 1 : -1;
    score += sign * (value + positional);
  }
  return score; // positive favors white
}

function orderMoves(game, moves){
  // captures first (MVV-LVA-ish) for better pruning
  return moves.slice().sort((a,b) => {
    const av = a.capture ? 1 : 0;
    const bv = b.capture ? 1 : 0;
    return bv - av;
  });
}

function minimax(game, depth, alpha, beta, maximizing){
  if(depth === 0){
    return { score: evaluateBoard(game) };
  }
  const color = maximizing ? 'w' : 'b';
  const moves = orderMoves(game, game.allLegalMoves(color));
  if(moves.length === 0){
    const inCheck = game.isInCheck(color);
    if(inCheck) return { score: maximizing ? -100000 - depth : 100000 + depth };
    return { score: 0 }; // stalemate
  }

  let bestMove = null;
  if(maximizing){
    let value = -Infinity;
    for(const m of moves){
      const undo = game.applyMove(m);
      const wasPromotion = m.promotion;
      if(wasPromotion && !m.promotionType) m.promotionType = 'Q';
      game.turn = 'b';
      const result = minimax(game, depth-1, alpha, beta, false);
      game.turn = 'w';
      game.undoMove(undo);
      if(result.score > value){ value = result.score; bestMove = m; }
      alpha = Math.max(alpha, value);
      if(beta <= alpha) break;
    }
    return { score: value, move: bestMove };
  } else {
    let value = Infinity;
    for(const m of moves){
      const undo = game.applyMove(m);
      if(m.promotion && !m.promotionType) m.promotionType = 'Q';
      game.turn = 'w';
      const result = minimax(game, depth-1, alpha, beta, true);
      game.turn = 'b';
      game.undoMove(undo);
      if(result.score < value){ value = result.score; bestMove = m; }
      beta = Math.min(beta, value);
      if(beta <= alpha) break;
    }
    return { score: value, move: bestMove };
  }
}

/**
 * Wählt einen Bot-Zug abhängig vom Schwierigkeitsgrad.
 * easy:   meist zufällig/flach, mit hoher Wahrscheinlichkeit für klare Fehler
 *         (z.B. Figuren herschenken), gelegentlich übersieht er auch Drohungen.
 * medium: solide Suche mit moderater Tiefe, ab und zu Ungenauigkeiten.
 * hard:   tiefere Suche, fast immer der beste gefundene Zug.
 */
function chooseBotMove(game, difficulty){
  const color = game.turn;
  const allMoves = game.allLegalMoves(color);
  if(allMoves.length === 0) return null;

  if(difficulty === 'easy'){
    // 65% komplett zufälliger Zug (inkl. möglicher Fehlzüge),
    // 35% ein flacher 1-Tiefen-Blick, der trotzdem oft Figuren übersieht.
    const roll = Math.random();
    if(roll < 0.65){
      return allMoves[Math.floor(Math.random()*allMoves.length)];
    }
    // flache Bewertung nur der unmittelbaren Materialwirkung, keine Tiefensuche
    const scored = allMoves.map(m => {
      let s = 0;
      if(m.capture){
        const target = game.at(m.to.r, m.to.c) || (m.enPassant ? {type:'P'} : null);
        if(target) s += PIECE_VALUE[target.type] || 0;
      }
      s += (Math.random()*60 - 30); // viel Rauschen -> unzuverlässig
      return { m, s };
    });
    scored.sort((a,b) => b.s - a.s);
    // nimm zufällig eines der besten 3 (statt strikt das beste) -> bleibt fehleranfällig
    const poolSize = Math.min(3, scored.length);
    const pick = scored[Math.floor(Math.random()*poolSize)];
    return pick.m;
  }

  if(difficulty === 'medium'){
    const depth = 2;
    const result = minimax(game, depth, -Infinity, Infinity, color==='w');
    // 15% Chance auf einen suboptimalen, aber nicht zufälligen Zug
    if(Math.random() < 0.15){
      const scored = allMoves.map(m => {
        const undo = game.applyMove(m);
        const ev = evaluateBoard(game);
        game.undoMove(undo);
        return { m, ev: color==='w' ? ev : -ev };
      });
      scored.sort((a,b) => b.ev - a.ev);
      const poolSize = Math.min(4, scored.length);
      return scored[Math.floor(Math.random()*poolSize)].m;
    }
    return result.move || allMoves[0];
  }

  // hard
  const depth = 3;
  const result = minimax(game, depth, -Infinity, Infinity, color==='w');
  return result.move || allMoves[0];
}
