import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { AuctionEngine } from './AuctionEngine';

interface SocketUser {
  id: string;
  name: string;
  auctionId?: string;
}

export class SocketManager {
  private io: SocketIOServer;
  private auctionEngine: AuctionEngine;
  private connectedUsers: Map<string, SocketUser> = new Map();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? false
          : ['http://localhost:3000', 'http://10.171.116.70:3000', 'http://localhost:5002', 'http://10.171.116.70:5002'],
        methods: ['GET', 'POST']
      }
    });

    this.auctionEngine = new AuctionEngine();
    this.setupEventListeners();
    this.setupSocketHandlers();
  }

  private setupEventListeners(): void {
    // Listen to auction engine events
    this.auctionEngine.on('auctionStarted', (data) => {
      this.io.to(data.auctionId).emit('auction_started', data);
    });

    this.auctionEngine.on('bidPlaced', (data) => {
      this.io.to(data.auctionId).emit('bid_placed', data);
    });

    this.auctionEngine.on('playerSold', (data) => {
      this.io.to(data.auctionId).emit('player_sold', data);
    });

    this.auctionEngine.on('playerUnsold', (data) => {
      this.io.to(data.auctionId).emit('player_unsold', data);
    });

    this.auctionEngine.on('nextPlayer', (data) => {
      this.io.to(data.auctionId).emit('next_player', data);
    });

    this.auctionEngine.on('auctionComplete', (data) => {
      this.io.to(data.auctionId).emit('auction_complete', data);
    });

    this.auctionEngine.on('auctionPaused', (data) => {
      this.io.to(data.auctionId).emit('auction_paused', data);
    });

    this.auctionEngine.on('auctionResumed', (data) => {
      this.io.to(data.auctionId).emit('auction_resumed', data);
    });

    // Undo event listeners
    this.auctionEngine.on('playerSaleUndone', (data) => {
      this.io.to(data.auctionId).emit('player_sale_undone', data);
    });

    this.auctionEngine.on('undoToPreviousPlayer', (data) => {
      this.io.to(data.auctionId).emit('undo_to_previous_player', data);
    });

    this.auctionEngine.on('bidRemoved', (data) => {
      this.io.to(data.auctionId).emit('bid_removed', data);
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log('User connected:', socket.id);

      socket.on('join_auction', async (data: { auctionId: string, userName: string }) => {
        try {
          const user: SocketUser = {
            id: socket.id,
            name: data.userName,
            auctionId: data.auctionId
          };

          this.connectedUsers.set(socket.id, user);

          // Join the auction room
          await socket.join(data.auctionId);

          // Try to add participant to auction (creates squad if doesn't exist)
          try {
            await this.auctionEngine.addParticipant(data.auctionId, data.userName);
            console.log(`Added ${data.userName} as new participant in auction ${data.auctionId}`);
          } catch (error) {
            // User might already exist, that's okay
            console.log(`User ${data.userName} already participating in auction ${data.auctionId} or error:`, error);
          }

          // Send current auction state
          const auctionState = await this.auctionEngine.getCurrentAuctionState(data.auctionId);
          socket.emit('auction_state', auctionState);

          // Notify other users
          socket.to(data.auctionId).emit('user_joined', {
            userName: data.userName,
            connectedUsers: this.getAuctionUsers(data.auctionId)
          });

          socket.emit('join_success', {
            message: 'Successfully joined auction',
            auctionState
          });

        } catch (error) {
          socket.emit('error', { message: 'Failed to join auction', error: error instanceof Error ? error.message : String(error) });
        }
      });

      socket.on('place_bid', async (data: { auctionId: string, playerId: string, amount: number }) => {
        try {
          const user = this.connectedUsers.get(socket.id);
          if (!user) {
            socket.emit('error', { message: 'User not authenticated' });
            return;
          }

          const userId = user.name.toLowerCase().replace(/\s+/g, '_');
          await this.auctionEngine.placeBid(
            data.auctionId,
            data.playerId,
            userId,
            user.name,
            data.amount
          );

          // The bidPlaced event will be emitted by auction engine and broadcast to all users

        } catch (error) {
          socket.emit('bid_error', {
            message: 'Failed to place bid',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('start_auction', async (data: { auctionId: string }) => {
        try {
          const user = this.connectedUsers.get(socket.id);
          if (!user) {
            socket.emit('error', { message: 'User not authenticated' });
            return;
          }

          await this.auctionEngine.startAuction(data.auctionId);

        } catch (error) {
          socket.emit('error', {
            message: 'Failed to start auction',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('pause_auction', async (data: { auctionId: string }) => {
        try {
          await this.auctionEngine.pauseAuction(data.auctionId);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to pause auction',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('resume_auction', async (data: { auctionId: string }) => {
        try {
          await this.auctionEngine.resumeAuction(data.auctionId);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to resume auction',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('get_auction_state', async (data: { auctionId: string }) => {
        try {
          const auctionState = await this.auctionEngine.getCurrentAuctionState(data.auctionId);
          socket.emit('auction_state', auctionState);
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to get auction state',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('get_squads', async (data: { auctionId: string }) => {
        try {
          const squads = await this.auctionEngine.getSquadsByAuction(data.auctionId);
          socket.emit('squads_update', { squads });
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to get squads',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('sell_player_now', async (data: { auctionId: string, playerId: string }) => {
        try {
          const user = this.connectedUsers.get(socket.id);
          if (!user) {
            socket.emit('error', { message: 'User not authenticated' });
            return;
          }

          await this.auctionEngine.sellPlayerNow(data.auctionId, data.playerId);

        } catch (error) {
          socket.emit('error', {
            message: 'Failed to sell player',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      // ===== UNDO SOCKET EVENTS =====

      socket.on('undo_last_sale', async (data: { auctionId: string }) => {
        try {
          console.log('🔄 Undo last sale requested for auction:', data.auctionId);

          const user = this.connectedUsers.get(socket.id);
          if (!user) {
            console.error('❌ User not found for socket:', socket.id);
            socket.emit('error', { message: 'User not found' });
            return;
          }

          console.log('👤 User found:', user.name, 'for auction:', data.auctionId);

          await this.auctionEngine.undoLastPlayerSale(data.auctionId, user.name);

          console.log('✅ Undo last sale successful, broadcasting state update');

          // Get updated auction state and broadcast to all users in auction
          const state = await this.auctionEngine.getCurrentAuctionState(data.auctionId);
          this.io.to(data.auctionId).emit('auction_state_updated', state);

          socket.emit('undo_success', {
            message: 'Last player sale undone successfully',
            type: 'last_sale'
          });
        } catch (error) {
          console.error('❌ Undo last sale error:', error);
          socket.emit('error', {
            message: 'Failed to undo last sale',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('undo_previous_player', async (data: { auctionId: string }) => {
        try {
          const user = this.connectedUsers.get(socket.id);
          if (!user) {
            socket.emit('error', { message: 'User not found' });
            return;
          }

          await this.auctionEngine.undoToPreviousPlayer(data.auctionId, user.name);

          // Get updated auction state and broadcast to all users in auction
          const state = await this.auctionEngine.getCurrentAuctionState(data.auctionId);
          this.io.to(data.auctionId).emit('auction_state_updated', state);

          socket.emit('undo_success', {
            message: 'Moved to previous player successfully',
            type: 'previous_player'
          });
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to move to previous player',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('undo_last_bid', async (data: { auctionId: string, playerId: string }) => {
        try {
          const user = this.connectedUsers.get(socket.id);
          if (!user) {
            socket.emit('error', { message: 'User not found' });
            return;
          }

          await this.auctionEngine.undoLastBid(data.auctionId, data.playerId, user.name);

          // Get updated auction state and broadcast to all users in auction
          const state = await this.auctionEngine.getCurrentAuctionState(data.auctionId);
          this.io.to(data.auctionId).emit('auction_state_updated', state);

          socket.emit('undo_success', {
            message: 'Last bid undone successfully',
            type: 'last_bid'
          });
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to undo last bid',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        const user = this.connectedUsers.get(socket.id);
        if (user && user.auctionId) {
          // Notify other users in the auction
          socket.to(user.auctionId).emit('user_left', {
            userName: user.name,
            connectedUsers: this.getAuctionUsers(user.auctionId, socket.id)
          });
        }

        this.connectedUsers.delete(socket.id);
      });

      // Timer synchronization
      setInterval(() => {
        const user = this.connectedUsers.get(socket.id);
        if (user && user.auctionId) {
          this.sendTimerUpdate(user.auctionId, socket);
        }
      }, 1000); // Update every second
    });
  }

  private async sendTimerUpdate(auctionId: string, socket: Socket): Promise<void> {
    try {
      const state = await this.auctionEngine.getCurrentAuctionState(auctionId);
      if (state.auction?.status === 'active' && state.timeRemaining > 0) {
        socket.emit('timer_update', {
          timeRemaining: state.timeRemaining,
          currentPlayer: state.currentPlayer,
          currentBid: state.currentBid
        });
      }
    } catch (error) {
      // Silently handle timer update errors
    }
  }

  private getAuctionUsers(auctionId: string, excludeSocketId?: string): string[] {
    const users: string[] = [];
    this.connectedUsers.forEach((user, socketId) => {
      if (user.auctionId === auctionId && socketId !== excludeSocketId) {
        users.push(user.name);
      }
    });
    return users;
  }

  // Broadcast message to all users in an auction
  public broadcastToAuction(auctionId: string, event: string, data: any): void {
    this.io.to(auctionId).emit(event, data);
  }

  // Get auction engine instance (for REST API routes)
  public getAuctionEngine(): AuctionEngine {
    return this.auctionEngine;
  }

  public cleanup(): void {
    this.auctionEngine.cleanup();
  }
}