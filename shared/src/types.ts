export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "JOKER";

export type Card = {
  id: string;
  rank: Rank;
  suit: Suit | "joker";
  isWild: boolean;
};

export type MeldType = "run" | "set";

export type Meld = {
  id: string;
  ownerSeat: number;
  type: MeldType;
  cards: Card[];
  wildAssignments?: Record<string, Rank>;
};

export type Objective =
  | "TWO_SETS_OF_3"
  | "RUN4_SET4"
  | "TWO_RUNS_OF_4"
  | "THREE_SETS_OF_3"
  | "RUN_OF_7"
  | "SET_OF_8";

export type HandState = {
  objective: Objective;
  deck: Card[];
  discard: Card[];
  tableMelds: Meld[];
  playerMelds: Record<number, Meld[]>;
  hands: Record<number, Card[]>;
  laidDown: Record<number, boolean>;
  activeSeat: number;
  turnPhase: "draw_choice" | "action" | "discard_required" | "complete";
  winnerSeat: number | null;
  lastForcedDrawEvent: { seat: number; count: number; nonce: number } | null;
};

export type PlayerInfo = {
  seat: number;
  id: string;
  name: string;
  isAi: boolean;
  aiLevel?: "easy" | "medium" | "hard";
};

export type MatchState = {
  roomCode: string;
  players: PlayerInfo[];
  currentHandIndex: number;
  handHistory: Array<Record<number, number>>;
  cumulativeScores: Record<number, number>;
  pendingRoundSummary: {
    objective: Objective;
    winnerSeat: number;
    results: Array<{
      seat: number;
      roundScore: number;
      cumulativeScore: number;
    }>;
  } | null;
  hand: HandState;
  status: "lobby" | "in_hand" | "between_hands" | "finished";
};
