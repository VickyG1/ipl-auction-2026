import { EventEmitter } from 'events';
import { DatabaseService } from './DatabaseService';
import { Player, Auction, Squad, Bid, BidEvent, AuctionStatus, PlayerRole } from '../models';

export class AuctionEngine extends EventEmitter {
  private db: DatabaseService;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.db = DatabaseService.getInstance();
  }

  async createAuction(name: string, participants: string[] = []): Promise<string> {
    const auction: Omit<Auction, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      status: AuctionStatus.SETUP,
      settings: {
        maxPlayers: 12,
        maxBudget: 12000, // 120 crores in lakhs
        bidIncrement: 5,
        bidTimer: 30,
        minWicketKeepers: 1,
        minAllRounders: 1,
        minBowlers: 3
      }
    };

    const auctionId = await this.db.createAuction(auction);

    // Create squads for any initial participants (optional)
    for (const userName of participants) {
      await this.addParticipant(auctionId, userName);
    }

    return auctionId;
  }

  async addParticipant(auctionId: string, userName: string): Promise<boolean> {
    const auction = await this.db.getAuctionById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    const userId = userName.toLowerCase().replace(/\s+/g, '_');

    // Check if user already exists in this auction
    const existingSquads = await this.db.getSquadsByAuction(auctionId);
    const existingSquad = existingSquads.find(s => s.userId === userId);

    if (existingSquad) {
      return false; // User already participating
    }

    // Check if auction has started - allow joining even if started
    await this.db.createSquad({
      auctionId,
      userId,
      userName,
      budgetRemaining: auction.settings.maxBudget,
      playerCount: 0,
      roleCounts: {
        [PlayerRole.WK]: 0,
        [PlayerRole.BAT]: 0,
        [PlayerRole.AR]: 0,
        [PlayerRole.BOWL]: 0
      }
    });

    return true;
  }

  async startAuction(auctionId: string): Promise<void> {
    const auction = await this.db.getAuctionById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status !== AuctionStatus.SETUP) {
      throw new Error('Auction already started');
    }

    // Start with first player
    const players = await this.db.getAllPlayers();
    if (players.length === 0) {
      throw new Error('No players available for auction');
    }

    const firstPlayer = players[0];

    await this.db.updateAuction(auctionId, {
      status: AuctionStatus.ACTIVE,
      currentPlayerId: firstPlayer.id,
      timerEndTime: new Date(Date.now() + auction.settings.bidTimer * 1000)
    });

    this.startTimer(auctionId, firstPlayer.id, auction.settings.bidTimer);

    this.emit('auctionStarted', { auctionId, player: firstPlayer });
  }

  async placeBid(auctionId: string, playerId: string, userId: string, userName: string, amount: number): Promise<boolean> {
    const auction = await this.db.getAuctionById(auctionId);
    if (!auction || auction.status !== AuctionStatus.ACTIVE) {
      throw new Error('Auction not active');
    }

    if (auction.currentPlayerId !== playerId) {
      throw new Error('Player not currently up for auction');
    }

    // Get current highest bid
    const currentHighestBid = await this.db.getHighestBid(auctionId, playerId);
    const player = await this.db.getPlayerById(playerId);

    if (!player) {
      throw new Error('Player not found');
    }

    // Validate bid amount
    const minimumBid = currentHighestBid
      ? currentHighestBid.amount + auction.settings.bidIncrement
      : player.basePrice;

    if (amount < minimumBid) {
      throw new Error(`Minimum bid is ${minimumBid} lakhs`);
    }

    // Check if user can afford this bid
    const squads = await this.db.getSquadsByAuction(auctionId);
    const userSquad = squads.find(s => s.userId === userId);

    if (!userSquad) {
      throw new Error('User not participating in auction');
    }

    if (amount > userSquad.budgetRemaining) {
      throw new Error('Insufficient budget');
    }

    // Validate squad composition if user wins
    if (!this.canAddPlayerToSquad(userSquad, player)) {
      throw new Error('Adding this player would violate squad composition rules');
    }

    // Mark previous highest bid as not winning
    if (currentHighestBid) {
      // Update previous bid in database (simplified - in production you'd update the record)
    }

    // Insert new bid
    const bid: Omit<Bid, 'id'> = {
      auctionId,
      playerId,
      userId,
      userName,
      amount,
      timestamp: new Date(),
      isWinning: true
    };

    await this.db.insertBid(bid);

    // Reset timer
    const newTimerEnd = new Date(Date.now() + auction.settings.bidTimer * 1000);
    await this.db.updateAuction(auctionId, { timerEndTime: newTimerEnd });

    this.clearTimer(auctionId);
    this.startTimer(auctionId, playerId, auction.settings.bidTimer);

    this.emit('bidPlaced', { auctionId, playerId, bid, timeRemaining: auction.settings.bidTimer });

    return true;
  }

  private canAddPlayerToSquad(squad: Squad, player: Player): boolean {
    // Check player count
    if (squad.playerCount >= 12) {
      return false;
    }

    // Check role requirements - only enforce minimums if we're getting close to full squad
    const remainingSlots = 12 - squad.playerCount;

    if (remainingSlots <= 4) { // In final slots, enforce minimums
      const newRoleCounts = { ...squad.roleCounts };
      newRoleCounts[player.role]++;

      // Check if we can still meet minimum requirements
      const wkNeeded = Math.max(0, 1 - newRoleCounts[PlayerRole.WK]);
      const arNeeded = Math.max(0, 1 - newRoleCounts[PlayerRole.AR]);
      const bowlNeeded = Math.max(0, 3 - newRoleCounts[PlayerRole.BOWL]);

      const totalMinimumNeeded = wkNeeded + arNeeded + bowlNeeded;
      const slotsAfterThisPlayer = remainingSlots - 1;

      if (totalMinimumNeeded > slotsAfterThisPlayer) {
        return false;
      }
    }

    return true;
  }

  private startTimer(auctionId: string, playerId: string, duration: number): void {
    const timer = setTimeout(() => {
      this.handleTimerExpired(auctionId, playerId);
    }, duration * 1000);

    this.activeTimers.set(auctionId, timer);
  }

  private clearTimer(auctionId: string): void {
    const timer = this.activeTimers.get(auctionId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(auctionId);
    }
  }

  private async handleTimerExpired(auctionId: string, playerId: string): Promise<void> {
    const highestBid = await this.db.getHighestBid(auctionId, playerId);
    const player = await this.db.getPlayerById(playerId);

    if (!player) {
      console.error('Player not found during timer expiry');
      return;
    }

    if (highestBid) {
      // Player sold - add to squad
      const squads = await this.db.getSquadsByAuction(auctionId);
      const winnerSquad = squads.find(s => s.userId === highestBid.userId);

      if (winnerSquad) {
        await this.addPlayerToSquad(winnerSquad.id, player, highestBid.amount);
        this.emit('playerSold', {
          auctionId,
          playerId,
          winner: highestBid.userName,
          amount: highestBid.amount
        });
      }
    } else {
      // Player unsold
      this.emit('playerUnsold', { auctionId, playerId });
    }

    // Move to next player
    await this.moveToNextPlayer(auctionId);
  }

  private async addPlayerToSquad(squadId: string, player: Player, purchasePrice: number): Promise<void> {
    await this.db.addPlayerToSquad(squadId, player.id, purchasePrice);

    // Update squad totals - in a production system, this would be done in a transaction
    // For now, we'll calculate these on the fly when needed
  }

  private async moveToNextPlayer(auctionId: string): Promise<void> {
    const players = await this.db.getAllPlayers();
    const auction = await this.db.getAuctionById(auctionId);

    if (!auction) return;

    const currentIndex = players.findIndex(p => p.id === auction.currentPlayerId);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= players.length) {
      // Auction complete
      await this.db.updateAuction(auctionId, {
        status: AuctionStatus.COMPLETED,
        currentPlayerId: undefined,
        timerEndTime: undefined
      });

      this.emit('auctionComplete', { auctionId });
    } else {
      // Move to next player
      const nextPlayer = players[nextIndex];
      const timerEnd = new Date(Date.now() + auction.settings.bidTimer * 1000);

      await this.db.updateAuction(auctionId, {
        currentPlayerId: nextPlayer.id,
        timerEndTime: timerEnd
      });

      this.startTimer(auctionId, nextPlayer.id, auction.settings.bidTimer);

      this.emit('nextPlayer', { auctionId, player: nextPlayer });
    }
  }

  async pauseAuction(auctionId: string): Promise<void> {
    await this.db.updateAuction(auctionId, { status: AuctionStatus.PAUSED });
    this.clearTimer(auctionId);
    this.emit('auctionPaused', { auctionId });
  }

  async resumeAuction(auctionId: string): Promise<void> {
    const auction = await this.db.getAuctionById(auctionId);
    if (!auction || !auction.currentPlayerId) {
      throw new Error('Cannot resume auction');
    }

    await this.db.updateAuction(auctionId, {
      status: AuctionStatus.ACTIVE,
      timerEndTime: new Date(Date.now() + auction.settings.bidTimer * 1000)
    });

    this.startTimer(auctionId, auction.currentPlayerId, auction.settings.bidTimer);
    this.emit('auctionResumed', { auctionId });
  }

  async getSquadsByAuction(auctionId: string): Promise<Squad[]> {
    return this.db.getSquadsByAuction(auctionId);
  }

  async getCurrentAuctionState(auctionId: string) {
    const auction = await this.db.getAuctionById(auctionId);
    const squads = await this.db.getSquadsByAuction(auctionId);

    let currentPlayer = null;
    let currentBid = null;
    let timeRemaining = 0;

    if (auction?.currentPlayerId) {
      currentPlayer = await this.db.getPlayerById(auction.currentPlayerId);
      currentBid = await this.db.getHighestBid(auctionId, auction.currentPlayerId);

      if (auction.timerEndTime) {
        timeRemaining = Math.max(0, Math.floor((auction.timerEndTime.getTime() - Date.now()) / 1000));
      }
    }

    return {
      auction,
      squads,
      currentPlayer,
      currentBid,
      timeRemaining
    };
  }

  cleanup(): void {
    // Clear all active timers
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();
  }
}