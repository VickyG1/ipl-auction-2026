import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  connect(serverUrl?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const url = serverUrl || (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5001');

      this.socket = io(url, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('Connected to auction server');
        resolve(this.socket!);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Failed to connect to auction server:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from auction server');
      });

      // Set up event forwarding
      this.setupEventForwarding();
    });
  }

  private setupEventForwarding(): void {
    if (!this.socket) return;

    const events: (keyof SocketEvents)[] = [
      'auction_started',
      'bid_placed',
      'player_sold',
      'player_unsold',
      'next_player',
      'auction_complete',
      'auction_paused',
      'auction_resumed',
      'timer_update',
      'auction_state',
      'user_joined',
      'user_left',
      'error',
      'bid_error',
      'join_success'
    ];

    events.forEach(event => {
      this.socket!.on(event, (data: any) => {
        this.emit(event, data);
      });
    });
  }

  joinAuction(auctionId: string, userName: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('join_auction', { auctionId, userName });
  }

  placeBid(auctionId: string, playerId: string, amount: number): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('place_bid', { auctionId, playerId, amount });
  }

  startAuction(auctionId: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('start_auction', { auctionId });
  }

  pauseAuction(auctionId: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('pause_auction', { auctionId });
  }

  resumeAuction(auctionId: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('resume_auction', { auctionId });
  }

  getAuctionState(auctionId: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('get_auction_state', { auctionId });
  }

  getSquads(auctionId: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('get_squads', { auctionId });
  }

  sellPlayerNow(auctionId: string, playerId: string): void {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit('sell_player_now', { auctionId, playerId });
  }

  // Event listener management
  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit<K extends keyof SocketEvents>(event: K, data: Parameters<SocketEvents[K]>[0]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.eventListeners.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();