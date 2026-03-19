export interface Player {
  id: string;
  name: string;
  team?: string;
  role: PlayerRole;
  basePrice: number; // in lakhs
  category?: PlayerCategory;
  stats?: PlayerStats;
  imageUrl?: string;
  scrapedAt?: Date;
}

export enum PlayerRole {
  WK = 'WK',           // Wicket-keeper
  BAT = 'BAT',         // Batsman
  AR = 'AR',           // All-rounder
  BOWL = 'BOWL'        // Bowler
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
  maxPlayers: number;       // 12
  maxBudget: number;        // 12000 lakhs (120 crores)
  bidIncrement: number;     // minimum bid increment
  bidTimer: number;         // seconds per bid
  minWicketKeepers: number; // 1
  minAllRounders: number;   // 1
  minBowlers: number;       // 3
}

export interface Squad {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  budgetRemaining: number;
  playerCount: number;
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

export interface BidEvent {
  type: 'bid_placed' | 'player_sold' | 'timer_update' | 'auction_ended';
  playerId?: string;
  bid?: Bid;
  timeRemaining?: number;
  nextPlayer?: Player;
}