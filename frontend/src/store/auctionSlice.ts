import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Auction, Player, Squad, Bid, AuctionState, AuctionStatus } from '../types';

interface AuctionSliceState {
  currentAuction: Auction | null;
  currentPlayer: Player | null;
  currentBid: Bid | null;
  timeRemaining: number;
  squads: Squad[];
  connectedUsers: string[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

const initialState: AuctionSliceState = {
  currentAuction: null,
  currentPlayer: null,
  currentBid: null,
  timeRemaining: 0,
  squads: [],
  connectedUsers: [],
  isLoading: false,
  error: null,
  isConnected: false
};

const auctionSlice = createSlice({
  name: 'auction',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    setConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
    },

    setAuctionState: (state, action: PayloadAction<AuctionState>) => {
      const { auction, squads, currentPlayer, currentBid, timeRemaining } = action.payload;
      state.currentAuction = auction;
      state.squads = squads;
      state.currentPlayer = currentPlayer;
      state.currentBid = currentBid;
      state.timeRemaining = timeRemaining;
    },

    setCurrentAuction: (state, action: PayloadAction<Auction>) => {
      state.currentAuction = action.payload;
    },

    setCurrentPlayer: (state, action: PayloadAction<Player>) => {
      state.currentPlayer = action.payload;
      state.timeRemaining = state.currentAuction?.settings.bidTimer || 30;
    },

    setBid: (state, action: PayloadAction<{ bid: Bid; timeRemaining: number }>) => {
      state.currentBid = action.payload.bid;
      state.timeRemaining = action.payload.timeRemaining;
    },

    updateTimer: (state, action: PayloadAction<{ timeRemaining: number; currentPlayer: Player; currentBid: Bid | null }>) => {
      state.timeRemaining = action.payload.timeRemaining;
      state.currentPlayer = action.payload.currentPlayer;
      state.currentBid = action.payload.currentBid;
    },

    playerSold: (state, action: PayloadAction<{ playerId: string; winner: string; amount: number }>) => {
      // Don't manipulate squad data here - it will be updated via updateSquads action
      // Just clear current player and bid
      state.currentPlayer = null;
      state.currentBid = null;
      state.timeRemaining = 0;
    },

    playerUnsold: (state) => {
      // Clear current player and bid
      state.currentPlayer = null;
      state.currentBid = null;
      state.timeRemaining = 0;
    },

    updateSquads: (state, action: PayloadAction<Squad[]>) => {
      state.squads = action.payload;
    },

    updateConnectedUsers: (state, action: PayloadAction<string[]>) => {
      state.connectedUsers = action.payload;
    },

    auctionComplete: (state) => {
      if (state.currentAuction) {
        state.currentAuction.status = AuctionStatus.COMPLETED;
      }
      state.currentPlayer = null;
      state.currentBid = null;
      state.timeRemaining = 0;
    },

    pauseAuction: (state) => {
      if (state.currentAuction) {
        state.currentAuction.status = AuctionStatus.PAUSED;
      }
      state.timeRemaining = 0;
    },

    resumeAuction: (state) => {
      if (state.currentAuction) {
        state.currentAuction.status = AuctionStatus.ACTIVE;
        state.timeRemaining = state.currentAuction.settings.bidTimer || 30;
      }
    },

    resetAuction: () => initialState
  }
});

export const {
  setLoading,
  setError,
  setConnected,
  setAuctionState,
  setCurrentAuction,
  setCurrentPlayer,
  setBid,
  updateTimer,
  playerSold,
  playerUnsold,
  updateSquads,
  updateConnectedUsers,
  auctionComplete,
  pauseAuction,
  resumeAuction,
  resetAuction
} = auctionSlice.actions;

export default auctionSlice.reducer;