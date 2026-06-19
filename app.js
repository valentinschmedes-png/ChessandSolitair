/* ========================================================================
   App-Steuerung: Navigation, Schach-UI, Solitär-UI
   ======================================================================== */

(function(){
  'use strict';

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active');
  }

  document.querySelectorAll('[data-target]').forEach(el => {
    el.addEventListener('click', () => {
      showScreen(el.getAttribute('data-target'));
    });
  });

  // ---------------------------------------------------------------------
  // Schach: Setup-Status
  // ---------------------------------------------------------------------
  const chessSetup = {
    opponent: null,   // 'human' | 'bot'
    difficulty: null, // 'easy' | 'medium' | 'hard'
    boardTheme: 'blue'
  };

  document.querySelectorAll('[data-opponent]').forEach(btn => {
    btn.addEventListener('click', () => {
      chessSetup.opponent = btn.getAttribute('data-opponent');
      if(chessSetup.opponent === 'bot'){
        showScreen('screen-chess-difficulty');
      } else {
        showScreen('screen-chess-board-color');
      }
    });
  });

  document.querySelectorAll('[data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      chessSetup.difficulty = btn.getAttribute('data-difficulty');
      showScreen('screen-chess-board-color');
    });
  });

  document.getElementById('btn-back-from-color').addEventListener('click', () => {
    showScreen(chessSetup.opponent === 'bot' ? 'screen-chess-difficulty' : 'screen-chess-setup');
  });

  document.querySelectorAll('[data-board-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      chessSetup.boardTheme = btn.getAttribute('data-board-theme');
      startChessGame();
    });
  });

  document.getElementById('btn-leave-chess').addEventListener('click', () => {
    showScreen('screen-menu');
  });
  document.getElementById('btn-end-to-menu').addEventListener('click', () => {
    showScreen('screen-menu');
  });

  // ---------------------------------------------------------------------
  // Schach: Spiel-Status & Rendering
  // ---------------------------------------------------------------------
  let game = null;
  let selectedSquare = null; // {r,c}
  let legalTargets = [];
  let pendingPromotion = null; // {from,to,...}
  let botThinking = false;

  const boardEl = document.getElementById('chess-board');
  const turnIndicator = document.getElementById('turn-indicator');
  const gameTitle = document.getElementById('chess-game-title');
  const moveListEl = document.getElementById('move-list');
  const capturedWhiteEl = document.getElementById('captured-white');
  const capturedBlackEl = document.getElementById('captured-black');
  const promotionOverlay = document.getElementById('promotion-overlay');
  const promotionChoices = document.getElementById('promotion-choices');
  const endOverlay = document.getElementById('end-overlay');
  const endMessage = document.getElementById('end-message');

  function startChessGame(){
    game = new ChessGame();
    selectedSquare = null;
    legalTargets = [];
    pendingPromotion = null;
    botThinking = false;

    boardEl.className = 'chess-board theme-' + chessSetup.boardTheme;
    gameTitle.textContent = chessSetup.opponent === 'bot'
      ? 'Schach · ' + difficultyLabel(chessSetup.difficulty)
      : 'Schach · 2 Spieler';

    endOverlay.classList.add('hidden');
    moveListEl.innerHTML = '';
    capturedWhiteEl.innerHTML = '';
    capturedBlackEl.innerHTML = '';

    renderBoard();
    updateTurnIndicator();
    showScreen('screen-chess-game');
  }

  function difficultyLabel(d){
    return d === 'easy' ? 'Leicht' : d === 'medium' ? 'Mittel' : 'Schwer';
  }

  function renderBoard(){
    boardEl.innerHTML = '';
    const lastMove = game.history.length ? game.history[game.history.length-1].move : null;
    const inCheckColor = game.isInCheck(game.turn) ? game.turn : null;

    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const sq = document.createElement('div');
        const isLight = (r+c) % 2 === 0;
        sq.className = 'sq ' + (isLight ? 'light' : 'dark');
        sq.dataset.r = r; sq.dataset.c = c;

        if(selectedSquare && selectedSquare.r===r && selectedSquare.c===c){
          sq.classList.add('selected');
        }
        if(lastMove && lastMove.from.r===r && lastMove.from.c===c) sq.classList.add('last-from');
        if(lastMove && lastMove.to.r===r && lastMove.to.c===c) sq.classList.add('last-to');

        const piece = game.at(r,c);
        if(piece){
          const span = document.createElement('span');
          span.className = 'piece';
          span.textContent = PIECE_UNICODE[piece.color][piece.type];
          sq.appendChild(span);
          if(inCheckColor && piece.type==='K' && piece.color===inCheckColor){
            sq.classList.add('in-check');
          }
        }

        const target = legalTargets.find(m => m.to.r===r && m.to.c===c);
        if(target){
          const dot = document.createElement('span');
          dot.className = 'move-dot' + (target.capture ? ' capture' : '');
          sq.appendChild(dot);
        }

        sq.addEventListener('click', onSquareClick);
        boardEl.appendChild(sq);
      }
    }
  }

  function updateTurnIndicator(){
    const status = game.gameStatus();
    if(status.state === 'checkmate'){
      const winnerLabel = status.winner === 'w' ? 'Weiß' : 'Schwarz';
      turnIndicator.textContent = 'Schachmatt — ' + winnerLabel + ' gewinnt!';
      showEndOverlay('Schachmatt! ' + winnerLabel + ' gewinnt.');
      return;
    }
    if(status.state === 'stalemate'){
      turnIndicator.textContent = 'Patt — Unentschieden';
      showEndOverlay('Patt — Unentschieden.');
      return;
    }
    const colorLabel = game.turn === 'w' ? 'Weiß' : 'Schwarz';
    turnIndicator.textContent = colorLabel + ' ist am Zug' + (status.state==='check' ? ' — Schach!' : '');
  }

  function showEndOverlay(msg){
    endMessage.textContent = msg;
    endOverlay.classList.remove('hidden');
  }

  function isHumanTurn(){
    if(chessSetup.opponent === 'human') return true;
    return game.turn === 'w'; // Mensch spielt immer Weiß gegen den Bot
  }

  function onSquareClick(e){
    if(botThinking || pendingPromotion) return;
    if(!isHumanTurn()) return;
    const r = parseInt(e.currentTarget.dataset.r, 10);
    const c = parseInt(e.currentTarget.dataset.c, 10);
    const piece = game.at(r,c);

    if(selectedSquare){
      const move = legalTargets.find(m => m.to.r===r && m.to.c===c);
      if(move){
        executeMove(move);
        return;
      }
      // Klick auf eigene andere Figur -> Auswahl wechseln
      if(piece && piece.color === game.turn){
        selectSquare(r,c);
      } else {
        selectedSquare = null;
        legalTargets = [];
        renderBoard();
      }
      return;
    }

    if(piece && piece.color === game.turn){
      selectSquare(r,c);
    }
  }

  function selectSquare(r,c){
    selectedSquare = {r,c};
    legalTargets = game.legalMovesForSquare(r,c);
    renderBoard();
  }

  function executeMove(move){
    if(move.promotion){
      pendingPromotion = move;
      selectedSquare = null;
      legalTargets = [];
      renderBoard();
      openPromotionOverlay(move);
      return;
    }
    finalizeMove(move);
  }

  function openPromotionOverlay(move){
    const color = game.at(move.from.r, move.from.c).color;
    promotionChoices.innerHTML = '';
    ['Q','R','B','N'].forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'promo-choice';
      btn.textContent = PIECE_UNICODE[color][type];
      btn.addEventListener('click', () => {
        pendingPromotion.promotionType = type;
        promotionOverlay.classList.add('hidden');
        finalizeMove(pendingPromotion);
        pendingPromotion = null;
      });
      promotionChoices.appendChild(btn);
    });
    promotionOverlay.classList.remove('hidden');
  }

  function finalizeMove(move){
    game.makeMove(move);
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
    updateMoveList();
    updateCaptured();
    updateTurnIndicator();

    const status = game.gameStatus();
    if(status.state === 'checkmate' || status.state === 'stalemate') return;

    if(chessSetup.opponent === 'bot' && game.turn === 'b'){
      botThinking = true;
      setTimeout(runBotMove, 280);
    }
  }

  function runBotMove(){
    const move = chooseBotMove(game, chessSetup.difficulty);
    botThinking = false;
    if(!move) return;
    if(move.promotion && !move.promotionType) move.promotionType = 'Q';
    finalizeMove(move);
  }

  function pieceLetter(type){
    return type === 'P' ? '' : type;
  }

  function updateMoveList(){
    moveListEl.innerHTML = '';
    const hist = game.history;
    for(let i=0;i<hist.length;i+=2){
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = (i/2+1) + '.';

      const whiteMove = formatMove(hist[i]);
      const blackMove = hist[i+1] ? formatMove(hist[i+1]) : '';

      const w = document.createElement('span');
      w.textContent = whiteMove;
      const b = document.createElement('span');
      b.textContent = blackMove;

      li.appendChild(num);
      li.appendChild(w);
      li.appendChild(b);
      moveListEl.appendChild(li);
    }
    moveListEl.parentElement.scrollTop = moveListEl.parentElement.scrollHeight;
  }

  function formatMove(entry){
    const { move, piece } = entry;
    if(move.castle === 'K') return 'O-O';
    if(move.castle === 'Q') return 'O-O-O';
    const letter = pieceLetter(piece.type);
    const capture = (move.capture) ? 'x' : '';
    const dest = game.squareName(move.to.r, move.to.c);
    const promo = move.promotion ? '=' + (move.promotionType || 'Q') : '';
    return letter + capture + dest + promo;
  }

  function updateCaptured(){
    capturedWhiteEl.innerHTML = game.captured.w.map(t => PIECE_UNICODE.b[t]).join(' ');
    capturedBlackEl.innerHTML = game.captured.b.map(t => PIECE_UNICODE.w[t]).join(' ');
  }

  document.getElementById('btn-undo').addEventListener('click', () => {
    if(botThinking) return;
    if(game.history.length === 0) return;
    game.undoLastMove();
    // Gegen Bot: auch den Bot-Zug zurücknehmen, damit wieder der Mensch dran ist
    if(chessSetup.opponent === 'bot' && game.history.length > 0 && game.turn === 'b'){
      game.undoLastMove();
    }
    selectedSquare = null;
    legalTargets = [];
    pendingPromotion = null;
    promotionOverlay.classList.add('hidden');
    endOverlay.classList.add('hidden');
    renderBoard();
    updateMoveList();
    updateCaptured();
    updateTurnIndicator();
  });

  document.getElementById('btn-rematch').addEventListener('click', startChessGame);

  // ---------------------------------------------------------------------
  // Solitär
  // ---------------------------------------------------------------------
  let sGame = null;
  let dragState = null; // { cards:[], fromType, fromIndex, ghostEls, originalParent }

  const tableauEl = document.getElementById('tableau');
  const foundationsEl = document.getElementById('foundations');
  const pileStockEl = document.getElementById('pile-stock');
  const pileWasteEl = document.getElementById('pile-waste');
  const solitaireWinOverlay = document.getElementById('solitaire-win-overlay');

  function startSolitaire(){
    sGame = new SolitaireGame();
    solitaireWinOverlay.classList.add('hidden');
    buildSolitaireStaticUI();
    renderSolitaire();
  }

  function buildSolitaireStaticUI(){
    tableauEl.innerHTML = '';
    for(let i=0;i<7;i++){
      const col = document.createElement('div');
      col.className = 'tableau-col';
      col.dataset.col = i;
      tableauEl.appendChild(col);
    }
    foundationsEl.innerHTML = '';
    SUITS.forEach(suit => {
      const pile = document.createElement('div');
      pile.className = 'pile';
      pile.dataset.suit = suit;
      const ph = document.createElement('div');
      ph.className = 'pile-placeholder';
      ph.textContent = suit;
      pile.appendChild(ph);
      foundationsEl.appendChild(pile);
    });
  }

  function cardLabel(card){
    return card.rank;
  }

  function makeCardEl(card, draggable){
    const el = document.createElement('div');
    el.className = 'card ' + SUIT_COLOR[card.suit] + (card.faceUp ? '' : ' face-down') + (draggable ? ' draggable' : '');
    if(card.faceUp){
      const corner = document.createElement('div');
      corner.className = 'corner';
      corner.innerHTML = cardLabel(card) + '<br>' + card.suit;
      const center = document.createElement('div');
      center.className = 'suit-center';
      center.textContent = card.suit;
      el.appendChild(corner);
      el.appendChild(center);
    }
    el.dataset.cardId = card.id;
    return el;
  }

  function renderSolitaire(){
    // Stock
    pileStockEl.querySelectorAll('.card').forEach(c => c.remove());
    if(sGame.stock.length > 0){
      const el = makeCardEl({faceUp:false}, false);
      pileStockEl.appendChild(el);
    }

    // Waste
    pileWasteEl.querySelectorAll('.card').forEach(c => c.remove());
    if(sGame.waste.length > 0){
      const top = sGame.waste[sGame.waste.length-1];
      const el = makeCardEl(top, true);
      el.style.position = 'absolute';
      pileWasteEl.appendChild(el);
      attachDragHandlers(el, top, 'waste', sGame.waste.length-1);
    }

    // Foundations
    SUITS.forEach(suit => {
      const pileEl = foundationsEl.querySelector(`[data-suit="${suit}"]`);
      pileEl.querySelectorAll('.card').forEach(c => c.remove());
      const pile = sGame.foundations[suit];
      if(pile.length > 0){
        const top = pile[pile.length-1];
        const el = makeCardEl(top, true);
        pileEl.appendChild(el);
        attachDragHandlers(el, top, 'foundation', pile.length-1, suit);
      }
    });

    // Tableau
    for(let col=0; col<7; col++){
      const colEl = tableauEl.querySelector(`[data-col="${col}"]`);
      colEl.querySelectorAll('.card').forEach(c => c.remove());
      const stack = sGame.tableau[col];
      stack.forEach((card, idx) => {
        const el = makeCardEl(card, card.faceUp);
        el.style.top = (idx * 26) + 'px';
        el.style.zIndex = idx;
        colEl.appendChild(el);
        if(card.faceUp){
          attachDragHandlers(el, card, 'tableau', idx, col);
        }
      });
      colEl.style.minHeight = (74 + Math.max(0, stack.length-1) * 26) + 'px';
    }

    if(sGame.isWon()){
      solitaireWinOverlay.classList.remove('hidden');
    }
  }

  pileStockEl.addEventListener('click', () => {
    sGame.drawFromStock();
    renderSolitaire();
  });

  // -------------------- Drag & Drop (Pointer Events, touch-friendly) -----
  function attachDragHandlers(el, card, fromType, fromIndex, extra){
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      beginDrag(el, card, fromType, fromIndex, extra, e);
    });
  }

  function beginDrag(el, card, fromType, fromIndex, extra, startEvent){
    let cardsToMove = [];
    let sourceColEl = null;

    if(fromType === 'tableau'){
      const stack = sGame.tableau[extra];
      cardsToMove = stack.slice(fromIndex);
      sourceColEl = tableauEl.querySelector(`[data-col="${extra}"]`);
    } else if(fromType === 'waste'){
      cardsToMove = [card];
    } else if(fromType === 'foundation'){
      cardsToMove = [card];
    }

    const rect = el.getBoundingClientRect();
    const boardRect = document.querySelector('.solitaire-layout').getBoundingClientRect();

    const ghostWrap = document.createElement('div');
    ghostWrap.style.position = 'fixed';
    ghostWrap.style.left = rect.left + 'px';
    ghostWrap.style.top = rect.top + 'px';
    ghostWrap.style.zIndex = 1000;
    ghostWrap.style.pointerEvents = 'none';

    const cardElsToHide = [];
    if(fromType === 'tableau'){
      const colEl = sourceColEl;
      const allCardEls = Array.from(colEl.querySelectorAll('.card'));
      const startEls = allCardEls.slice(fromIndex);
      startEls.forEach((origEl, i) => {
        const clone = origEl.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.left = '0px';
        clone.style.top = (i*26) + 'px';
        ghostWrap.appendChild(clone);
        cardElsToHide.push(origEl);
      });
    } else {
      const clone = el.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.left = '0px';
      clone.style.top = '0px';
      ghostWrap.appendChild(clone);
      cardElsToHide.push(el);
    }

    document.body.appendChild(ghostWrap);
    cardElsToHide.forEach(c => c.style.visibility = 'hidden');

    const startX = startEvent.clientX, startY = startEvent.clientY;
    const origLeft = rect.left, origTop = rect.top;

    dragState = { cardsToMove, fromType, fromIndex, extra, ghostWrap, cardElsToHide };

    function onMove(e){
      const dx = e.clientX - startX, dy = e.clientY - startY;
      ghostWrap.style.left = (origLeft + dx) + 'px';
      ghostWrap.style.top = (origTop + dy) + 'px';
    }

    function onUp(e){
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const dropTarget = findDropTarget(e.clientX, e.clientY);
      const moved = tryDrop(dropTarget, cardsToMove, fromType, extra);

      ghostWrap.remove();
      if(!moved){
        cardElsToHide.forEach(c => c.style.visibility = 'visible');
      }
      dragState = null;

      if(moved){
        renderSolitaire();
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function findDropTarget(x,y){
    const els = document.elementsFromPoint(x,y);
    for(const el of els){
      const colEl = el.closest('.tableau-col');
      if(colEl) return { type:'tableau', col: parseInt(colEl.dataset.col,10) };
      const foundEl = el.closest('#foundations .pile');
      if(foundEl) return { type:'foundation', suit: foundEl.dataset.suit };
    }
    return null;
  }

  function tryDrop(target, cards, fromType, fromExtra){
    if(!target) return false;
    const movingCard = cards[0];

    if(target.type === 'foundation'){
      if(cards.length !== 1) return false;
      if(!sGame.canPlaceFoundation(movingCard, target.suit)) return false;
      removeFromSource(fromType, fromExtra, cards.length);
      sGame.foundations[target.suit].push(movingCard);
      return true;
    }

    if(target.type === 'tableau'){
      const destStack = sGame.tableau[target.col];
      const destTop = destStack.length ? destStack[destStack.length-1] : null;
      if(fromType === 'tableau' && target.col === fromExtra) return false;
      if(!sGame.canStackTableau(movingCard, destTop)) return false;
      removeFromSource(fromType, fromExtra, cards.length);
      destStack.push(...cards);
      return true;
    }
    return false;
  }

  function removeFromSource(fromType, fromExtra, count){
    if(fromType === 'tableau'){
      const stack = sGame.tableau[fromExtra];
      stack.splice(stack.length - count, count);
      sGame.flipTopIfNeeded(fromExtra);
    } else if(fromType === 'waste'){
      sGame.waste.pop();
    } else if(fromType === 'foundation'){
      // fromExtra ist hier das Suit-Symbol der Quell-Foundation
      sGame.foundations[fromExtra].pop();
    }
  }

  document.getElementById('btn-new-solitaire').addEventListener('click', startSolitaire);
  document.getElementById('btn-solitaire-again').addEventListener('click', startSolitaire);

  document.getElementById('tile-solitaire').addEventListener('click', () => {
    if(!sGame) startSolitaire();
  });

})();
