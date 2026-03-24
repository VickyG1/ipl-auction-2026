export interface Player {
  id: string;
  name: string;
  team?: string;
  role: PlayerRole;
  basePrice: number;
  category?: PlayerCategory;
  stats?: PlayerStats;
  imageUrl?: string;
  country?: string;
  isOverseas?: boolean;
  setNumber?: number;
  battingStyle?: string;
  bowlingStyle?: string;
  previousTeam?: string;
  scrapedAt?: Date;
  purchasePrice?: number; // in lakhs - only present when player is in a squad
}

export enum PlayerRole {
  WK = 'WK',
  BAT = 'BAT',
  AR = 'AR',
  BOWL = 'BOWL'
}

export enum PlayerCategory {
  MARQUEE = 'MARQUEE',
  CAPPED = 'CAPPED',
  UNCAPPED = 'UNCAPPED',
  INTERNATIONAL = 'INTERNATIONAL'
}

export interface PlayerStats {
  matches?: number;
  runs?: number;
  wickets?: number;
  average?: number;
  strikeRate?: number;
  fantasyPoints?: number;
  lastSeasonPoints?: number;
}

export interface Auction {
  id: string;
  name: string;
  status: AuctionStatus;
  currentPlayerId?: string;
  timerEndTime?: Date;
  settings: AuctionSettings;
  createdAt: Date;
  updatedAt: Date;
}

export enum AuctionStatus {
  SETUP = 'setup',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed'
}

export interface AuctionSettings {
  maxPlayers: number;
  maxBudget: number;
  bidIncrement: number;
  bidTimer: number;
  minWicketKeepers: number;
  minAllRounders: number;
  minBowlers: number;
}

export interface Squad {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  budgetRemaining: number;
  playerCount: number;
  overseasCount?: number;
  roleCounts: Record<PlayerRole, number>;
  players: Player[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Bid {
  id: string;
  auctionId: string;
  playerId: string;
  userId: string;
  userName: string;
  amount: number;
  timestamp: Date;
  isWinning: boolean;
}

export interface AuctionState {
  auction: Auction | null;
  squads: Squad[];
  currentPlayer: Player | null;
  currentBid: Bid | null;
  timeRemaining: number;
}

export interface SocketEvents {
  auction_started: (data: { auctionId: string; player: Player }) => void;
  bid_placed: (data: { auctionId: string; playerId: string; bid: Bid; timeRemaining: number }) => void;
  player_sold: (data: { auctionId: string; playerId: string; winner: string; amount: number; updatedSquads?: Squad[] }) => void;
  player_unsold: (data: { auctionId: string; playerId: string }) => void;
  next_player: (data: { auctionId: string; player: Player }) => void;
  auction_complete: (data: { auctionId: string }) => void;
  auction_paused: (data: { auctionId: string }) => void;
  auction_resumed: (data: { auctionId: string }) => void;
  timer_update: (data: { timeRemaining: number; currentPlayer: Player; currentBid: Bid | null }) => void;
  auction_state: (data: AuctionState) => void;
  user_joined: (data: { userName: string; connectedUsers: string[] }) => void;
  user_left: (data: { userName: string; connectedUsers: string[] }) => void;
  error: (data: { message: string; error?: string }) => void;
  bid_error: (data: { message: string; error?: string }) => void;
  join_success: (data: { message: string; auctionState: AuctionState }) => void;

  // Undo events
  undo_success: (data: { message: string; type: string }) => void;
  player_sale_undone: (data: { auctionId: string; player: Player; initiatedBy: string }) => void;
  undo_to_previous_player: (data: { auctionId: string; player: Player; initiatedBy: string }) => void;
  bid_removed: (data: { auctionId: string; playerId: string; removedBid: Bid; newHighestBid: Bid | null; initiatedBy: string }) => void;
}