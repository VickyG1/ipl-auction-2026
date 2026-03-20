import { EventEmitter } from 'events';
import { DatabaseService } from './DatabaseService';
import { Player, Auction, Squad, Bid, BidEvent, AuctionStatus, PlayerRole } from '../models';

export class AuctionEngine extends EventEmitter {
  private db: DatabaseService;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private auctionPlayerOrders: Map<string, Player[]> = new Map(); // Store player orders for each auction

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
      overseasCount: 0,
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

    // Randomize player order freshly for this auction
    await this.db.randomizePlayerOrder();

    // Get players in their newly randomized auction order
    const allPlayers = await this.db.getAllPlayers();
    if (allPlayers.length === 0) {
      throw new Error('No players available for auction');
    }

    console.log(`🏏 Starting auction with ${allPlayers.length} players`);
    console.log(`🎯 Players are already ordered set-wise with randomization from import`);

    const firstPlayer = allPlayers[0];

    // Store the ordered player list for auction progression
    await this.storeAuctionPlayerOrder(auctionId, allPlayers);

    await this.db.updateAuction(auctionId, {
      status: AuctionStatus.ACTIVE,
      currentPlayerId: firstPlayer.id,
      timerEndTime: new Date(Date.now() + auction.settings.bidTimer * 1000)
    });

    this.startTimer(auctionId, firstPlayer.id, auction.settings.bidTimer);

    this.emit('auctionStarted', { auctionId, player: firstPlayer });
  }

  private async storeAuctionPlayerOrder(auctionId: string, players: Player[]): Promise<void> {
    this.auctionPlayerOrders.set(auctionId, players);
    console.log(`Stored player order for auction ${auctionId}: ${players.length} players`);
  }

  private getAuctionPlayerOrder(auctionId: string): Player[] | null {
    return this.auctionPlayerOrders.get(auctionId) || null;
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
    const currentAmount = currentHighestBid ? currentHighestBid.amount : player.basePrice;
    const minimumIncrement = this.calculateMinimumIncrement(currentAmount);
    const minimumBid = currentHighestBid
      ? currentHighestBid.amount + minimumIncrement  // Subsequent bids: previous + increment
      : player.basePrice;                           // First bid: can equal base price

    if (amount < minimumBid) {
      const errorMessage = currentHighestBid
        ? `Minimum bid is ${minimumBid} lakhs (current bid + increment)`
        : `Minimum bid is ${minimumBid} lakhs (base price)`;
      throw new Error(errorMessage);
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

  async getMinimumBid(auctionId: string, playerId: string): Promise<{ minimumBid: number, isFirstBid: boolean }> {
    const currentHighestBid = await this.db.getHighestBid(auctionId, playerId);
    const player = await this.db.getPlayerById(playerId);

    if (!player) {
      throw new Error('Player not found');
    }

    const isFirstBid = !currentHighestBid;
    const minimumBid = isFirstBid
      ? player.basePrice  // First bid can equal base price
      : currentHighestBid.amount + this.calculateMinimumIncrement(currentHighestBid.amount);

    return { minimumBid, isFirstBid };
  }

  private calculateMinimumIncrement(currentAmount: number): number {
    // Same rules as frontend:
    // Till 1 CR (100 lakhs) - minimum 10 lakhs increment
    // 1 CR to 10 CR (100-1000 lakhs) - minimum 20 lakhs increment
    // After 10 CR (1000+ lakhs) - minimum 50 lakhs increment

    if (currentAmount < 100) return 10;      // Till 1 CR
    else if (currentAmount < 1000) return 20; // 1 CR to 10 CR
    else return 50;                          // After 10 CR
  }

  private canAddPlayerToSquad(squad: Squad, player: Player): boolean {
    // Check player count
    if (squad.playerCount >= 12) {
      return false;
    }

    // Check overseas player limit (max 4 overseas players)
    const currentOverseasCount = squad.overseasCount || 0;
    if ((player as any).isOverseas && currentOverseasCount >= 4) {
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
    console.log('Timer expired for player:', playerId, 'in auction:', auctionId);

    const highestBid = await this.db.getHighestBid(auctionId, playerId);
    const player = await this.db.getPlayerById(playerId);

    if (!player) {
      console.error('Player not found during timer expiry:', playerId);
      return;
    }

    console.log('Player found:', player.name, 'Highest bid:', highestBid?.amount || 'None');

    if (highestBid) {
      // Player sold - add to squad
      const squads = await this.db.getSquadsByAuction(auctionId);
      const winnerSquad = squads.find(s => s.userId === highestBid.userId);

      console.log('Winner squad found:', winnerSquad?.userName, 'Squad ID:', winnerSquad?.id);

      if (winnerSquad) {
        console.log('Adding player to squad...');
        await this.addPlayerToSquad(winnerSquad.id, player, highestBid.amount);

        // Get updated squads after purchase
        console.log('Getting updated squads...');
        const updatedSquads = await this.db.getSquadsByAuction(auctionId);

        console.log('Updated squads data:', JSON.stringify(updatedSquads.map(s => ({
          userName: s.userName,
          players: s.players.map(p => ({ name: p.name, purchasePrice: p.purchasePrice }))
        })), null, 2));

        console.log('Emitting playerSold event...');
        this.emit('playerSold', {
          auctionId,
          playerId,
          winner: highestBid.userName,
          amount: highestBid.amount,
          updatedSquads // Include updated squad info
        });
      }
    } else {
      // Player unsold
      console.log('Player unsold, emitting playerUnsold event...');
      this.emit('playerUnsold', { auctionId, playerId });
    }

    // Move to next player
    console.log('Moving to next player...');
    await this.moveToNextPlayer(auctionId);
  }

  private async addPlayerToSquad(squadId: string, player: Player, purchasePrice: number): Promise<void> {
    await this.db.addPlayerToSquad(squadId, player, purchasePrice);
  }

  private async moveToNextPlayer(auctionId: string): Promise<void> {
    console.log('Moving to next player for auction:', auctionId);

    // Use stored player order for this auction
    const orderedPlayers = this.getAuctionPlayerOrder(auctionId);
    const auction = await this.db.getAuctionById(auctionId);

    if (!auction) {
      console.error('Auction not found:', auctionId);
      return;
    }

    if (!orderedPlayers) {
      console.error('No player order found for auction:', auctionId);
      return;
    }

    console.log('Total ordered players:', orderedPlayers.length, 'Current player ID:', auction.currentPlayerId);

    const currentIndex = orderedPlayers.findIndex(p => p.id === auction.currentPlayerId);
    const nextIndex = currentIndex + 1;

    console.log('Current player index:', currentIndex, 'Next index:', nextIndex);

    if (nextIndex >= orderedPlayers.length) {
      // Auction complete
      console.log('Auction complete - no more players');
      await this.db.updateAuction(auctionId, {
        status: AuctionStatus.COMPLETED,
        currentPlayerId: undefined,
        timerEndTime: undefined
      });

      this.emit('auctionComplete', { auctionId });
    } else {
      // Move to next player
      const nextPlayer = orderedPlayers[nextIndex];
      const timerEnd = new Date(Date.now() + auction.settings.bidTimer * 1000);

      const nextPlayerSetNumber = (nextPlayer as any).setNumber || 0;
      const currentPlayerSetNumber = currentIndex >= 0 ? (orderedPlayers[currentIndex] as any).setNumber || 0 : 0;

      if (nextPlayerSetNumber !== currentPlayerSetNumber) {
        console.log(`Moving from Set ${currentPlayerSetNumber} to Set ${nextPlayerSetNumber}`);
      }

      console.log('Moving to next player:', nextPlayer.name, 'ID:', nextPlayer.id, 'Set:', nextPlayerSetNumber);

      await this.db.updateAuction(auctionId, {
        currentPlayerId: nextPlayer.id,
        timerEndTime: timerEnd
      });

      this.startTimer(auctionId, nextPlayer.id, auction.settings.bidTimer);

      this.emit('nextPlayer', { auctionId, player: nextPlayer });
      console.log('Emitted nextPlayer event for:', nextPlayer.name);
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

  async sellPlayerNow(auctionId: string, playerId: string): Promise<boolean> {
    console.log('Sell player now called for:', playerId, 'in auction:', auctionId);

    const auction = await this.db.getAuctionById(auctionId);
    if (!auction || auction.status !== AuctionStatus.ACTIVE) {
      console.error('Auction not active or not found');
      throw new Error('Auction not active');
    }

    if (auction.currentPlayerId !== playerId) {
      console.error('Player not currently up for auction. Current:', auction.currentPlayerId, 'Requested:', playerId);
      throw new Error('Player not currently up for auction');
    }

    // Clear the timer and trigger immediate sale
    console.log('Clearing timer and triggering immediate sale...');
    this.clearTimer(auctionId);
    await this.handleTimerExpired(auctionId, playerId);

    return true;
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

    // Clear stored player orders
    this.auctionPlayerOrders.clear();
  }
}