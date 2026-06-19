/* ========================================================================
   Solitär (Klondike) — 1 Karte ziehen, Standardregeln
   ======================================================================== */

const SUITS = ['♠','♥','♦','♣'];
const SUIT_COLOR = { '♠':'black', '♣':'black', '♥':'red', '♦':'red' };
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i) => [r, i+1]));

function buildDeck(){
  const deck = [];
  let id = 0;
  for(const suit of SUITS){
    for(const rank of RANKS){
      deck.push({ id: id++, suit, rank, faceUp:false });
    }
  }
  return deck;
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

class SolitaireGame {
  constructor(){
    this.reset();
  }

  reset(){
    const deck = shuffle(buildDeck());
    this.tableau = [[],[],[],[],[],[],[]];
    this.foundations = { '♠':[], '♥':[], '♦':[], '♣':[] };
    this.stock = [];
    this.waste = [];

    let idx = 0;
    for(let col=0; col<7; col++){
      for(let row=0; row<=col; row++){
        const card = deck[idx++];
        card.faceUp = (row === col);
        this.tableau[col].push(card);
      }
    }
    this.stock = deck.slice(idx).map(c => ({...c, faceUp:false}));
    this.waste = [];
  }

  isWon(){
    return Object.values(this.foundations).every(pile => pile.length === 13);
  }

  drawFromStock(){
    if(this.stock.length === 0){
      // reset stock from waste
      this.stock = this.waste.slice().reverse().map(c => ({...c, faceUp:false}));
      this.waste = [];
      return;
    }
    const card = this.stock.pop();
    card.faceUp = true;
    this.waste.push(card);
  }

  canStackTableau(card, targetCard){
    if(!targetCard) return card.rank === 'K';
    const colorOk = SUIT_COLOR[card.suit] !== SUIT_COLOR[targetCard.suit];
    const rankOk = RANK_VALUE[card.rank] === RANK_VALUE[targetCard.rank] - 1;
    return colorOk && rankOk;
  }

  canPlaceFoundation(card, suit){
    const pile = this.foundations[suit];
    if(card.suit !== suit) return false;
    if(pile.length === 0) return card.rank === 'A';
    return RANK_VALUE[card.rank] === RANK_VALUE[pile[pile.length-1].rank] + 1;
  }

  flipTopIfNeeded(colIdx){
    const col = this.tableau[colIdx];
    if(col.length > 0 && !col[col.length-1].faceUp){
      col[col.length-1].faceUp = true;
    }
  }
}
