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

    // Validate bid amount follows IPL increment rules
    const currentAmount = currentHighestBid ? currentHighestBid.amount : player.basePrice;

    // For first bid, must be at least base price and valid amount
    if (!currentHighestBid) {
      if (amount < player.basePrice) {
        throw new Error(`Minimum bid is ${player.basePrice} lakhs (base price)`);
      }
      if (!this.isValidBidAmount(amount)) {
        throw new Error(`Invalid bid amount. Valid amounts must be multiples of ${amount < 100 ? '10' : amount < 1000 ? '20' : '50'} lakhs`);
      }
    } else {
      // For subsequent bids, amount must be greater than current and valid
      const minimumNextBid = this.getValidNextBid(currentAmount);
      if (amount < minimumNextBid) {
        throw new Error(`Minimum bid is ${minimumNextBid} lakhs`);
      }
      if (!this.isValidBidAmount(amount)) {
        throw new Error(`Invalid bid amount. Valid amounts must be multiples of ${amount < 100 ? '10' : amount < 1000 ? '20' : '50'} lakhs`);
      }
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
    // IPL auction increment rules:
    // 0-99 lakhs: minimum 10 lakhs increment
    // 100-999 lakhs: minimum 20 lakhs increment
    // 1000+ lakhs: minimum 50 lakhs increment

    if (currentAmount < 100) return 10;
    else if (currentAmount < 1000) return 20;
    else return 50;
  }

  private getValidNextBid(currentAmount: number): number {
    // Ensure bids follow IPL rules: valid sequences are
    // 0-99 lakhs: 10, 20, 30, ..., 90
    // 100-999 lakhs: 100, 120, 140, ..., 980
    // 1000+ lakhs: 1000, 1050, 1100, 1150, ...

    const increment = this.calculateMinimumIncrement(currentAmount);
    let nextBid = currentAmount + increment;

    // Align to valid bid values for the tier
    if (nextBid < 100) {
      // Round to nearest 10 lakhs
      nextBid = Math.ceil(nextBid / 10) * 10;
    } else if (nextBid < 1000) {
      // Round to nearest 20 lakhs, but ensure it's at least 100
      nextBid = Math.max(100, Math.ceil(nextBid / 20) * 20);
    } else {
      // Round to nearest 50 lakhs, but ensure it's at least 1000
      nextBid = Math.max(1000, Math.ceil(nextBid / 50) * 50);
    }

    return nextBid;
  }

  private isValidBidAmount(amount: number): boolean {
    // Check if the bid amount follows IPL rules
    if (amount < 100) {
      // Must be multiple of 10 lakhs
      return amount % 10 === 0;
    } else if (amount < 1000) {
      // Must be multiple of 20 lakhs and >= 100
      return amount >= 100 && amount % 20 === 0;
    } else {
      // Must be multiple of 50 lakhs and >= 1000
      return amount >= 1000 && amount % 50 === 0;
    }
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

  // ===== UNDO FUNCTIONALITY =====

  async undoLastPlayerSale(auctionId: string, initiatedBy: string): Promise<boolean> {
    try {
      console.log(`🔄 Starting undo last player sale for auction ${auctionId} by ${initiatedBy}`);

      const auction = await this.db.getAuctionById(auctionId);
      if (!auction) {
        console.error(`❌ Auction ${auctionId} not found`);
        throw new Error('Auction not found');
      }

      if (auction.status !== AuctionStatus.ACTIVE) {
        console.error(`❌ Auction ${auctionId} is not active, status: ${auction.status}`);
        throw new Error('Auction not active');
      }

      console.log(`✅ Auction ${auctionId} is active, looking for last sold player`);

      // Get the last sold player (most recent by sale timestamp)
      const lastSoldPlayer = await this.db.getLastSoldPlayer(auctionId);
      if (!lastSoldPlayer) {
        console.error(`❌ No sold players found for auction ${auctionId}`);
        throw new Error('No players have been sold yet');
      }

      console.log(`🔄 Undoing sale of ${lastSoldPlayer.name} (sold to: ${lastSoldPlayer.soldTo}) by ${initiatedBy}`);

      // Remove player from squad and refund budget
      await this.db.removePlayerFromSquad(auctionId, lastSoldPlayer.id, lastSoldPlayer.soldTo);
      console.log(`✅ Removed player from squad and refunded budget`);

      // Reset player to available status
      await this.db.updatePlayerTeam(lastSoldPlayer.id, null, null);
      console.log(`✅ Reset player team status`);

      // Remove all bids for this player to prevent confusion
      await this.db.deleteBidsForPlayer(auctionId, lastSoldPlayer.id);
      console.log(`✅ Cleared all bids for player`);

      // Set auction back to this player
      await this.db.updateAuction(auctionId, {
        currentPlayerId: lastSoldPlayer.id,
        status: AuctionStatus.ACTIVE
      });
      console.log(`✅ Set auction back to player ${lastSoldPlayer.name}`);

      // Restart timer for this player
      this.startTimer(auctionId, lastSoldPlayer.id, auction.settings.bidTimer);
      console.log(`✅ Restarted timer for player`);

      this.emit('playerSaleUndone', {
        auctionId,
        player: lastSoldPlayer,
        initiatedBy
      });

      console.log(`🎉 Undo last player sale completed successfully`);
      return true;
    } catch (error) {
      console.error('❌ Error undoing player sale:', error);
      throw error;
    }
  }

  async undoToPreviousPlayer(auctionId: string, initiatedBy: string): Promise<boolean> {
    try {
      const auction = await this.db.getAuctionById(auctionId);
      if (!auction || auction.status !== AuctionStatus.ACTIVE) {
        throw new Error('Auction not active');
      }

      const playerOrder = this.auctionPlayerOrders.get(auctionId);
      if (!playerOrder) {
        throw new Error('Player order not found for auction');
      }

      const currentPlayerIndex = playerOrder.findIndex(p => p.id === auction.currentPlayerId);
      if (currentPlayerIndex <= 0) {
        throw new Error('Already at the first player');
      }

      const previousPlayer = playerOrder[currentPlayerIndex - 1];

      // Clear any bids for current player
      if (auction.currentPlayerId) {
        await this.db.deleteBidsForPlayer(auctionId, auction.currentPlayerId);
      }

      // Set auction to previous player
      await this.db.updateAuction(auctionId, {
        currentPlayerId: previousPlayer.id,
        status: AuctionStatus.ACTIVE
      });

      // Reset player status to available if they were sold
      await this.db.updatePlayerTeam(previousPlayer.id, null, null);

      // If previous player was sold, remove from squad
      if (previousPlayer.team) {
        const squads = await this.db.getSquadsByAuction(auctionId);
        const squad = squads.find(s => s.id === previousPlayer.team);
        if (squad) {
          await this.db.removePlayerFromSquad(auctionId, previousPlayer.id, squad.userId);
        }
      }

      // Restart timer
      this.startTimer(auctionId, previousPlayer.id, auction.settings.bidTimer);

      this.emit('undoToPreviousPlayer', {
        auctionId,
        player: previousPlayer,
        initiatedBy
      });

      return true;
    } catch (error) {
      console.error('Error undoing to previous player:', error);
      throw error;
    }
  }

  async undoLastBid(auctionId: string, playerId: string, initiatedBy: string): Promise<boolean> {
    try {
      const auction = await this.db.getAuctionById(auctionId);
      if (!auction || auction.status !== AuctionStatus.ACTIVE) {
        throw new Error('Auction not active');
      }

      if (auction.currentPlayerId !== playerId) {
        throw new Error('Can only undo bids for current player');
      }

      // Get current highest bid
      const currentBid = await this.db.getHighestBid(auctionId, playerId);
      if (!currentBid) {
        throw new Error('No bids to undo for this player');
      }

      // Remove the highest bid
      await this.db.deleteSpecificBid(auctionId, playerId, currentBid.id);

      // Get the new highest bid (previous bid)
      const newHighestBid = await this.db.getHighestBid(auctionId, playerId);

      // Emit bid removed event
      this.emit('bidRemoved', {
        auctionId,
        playerId,
        removedBid: currentBid,
        newHighestBid,
        initiatedBy
      });

      return true;
    } catch (error) {
      console.error('Error undoing last bid:', error);
      throw error;
    }
  }

  cleanup(): void {
    // Clear all active timers
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();

    // Clear stored player orders
    this.auctionPlayerOrders.clear();
  }
}