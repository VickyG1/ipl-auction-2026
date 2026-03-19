import axios from 'axios';
import { Player, Auction, Squad } from '../types';

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : process.env.REACT_APP_API_URL || 'http://10.171.116.70:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  count?: number;
}

export const apiService = {
  // Health check
  async checkHealth(): Promise<boolean> {
    try {
      const response = await api.get<ApiResponse<any>>('/health');
      return response.data.success;
    } catch {
      return false;
    }
  },

  // Player operations
  async getAllPlayers(): Promise<Player[]> {
    const response = await api.get<ApiResponse<Player[]>>('/players');
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch players');
    }
    return response.data.data || [];
  },

  async getPlayer(id: string): Promise<Player> {
    const response = await api.get<ApiResponse<Player>>(`/players/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Player not found');
    }
    return response.data.data!;
  },

  async importPlayers(): Promise<number> {
    const response = await api.post<ApiResponse<{ count: number }>>('/players/import');
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to import players');
    }
    return response.data.count || 0;
  },

  // Auction operations
  async createAuction(name: string, participants: string[] = []): Promise<string> {
    const response = await api.post<ApiResponse<{ auctionId: string }>>('/auctions', {
      name,
      participants
    });
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to create auction');
    }
    return response.data.data!.auctionId;
  },

  async joinAuction(auctionId: string, userName: string): Promise<void> {
    const response = await api.post<ApiResponse<any>>(`/auctions/${auctionId}/join`, {
      userName
    });
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to join auction');
    }
  },

  async getAuction(id: string): Promise<Auction> {
    const response = await api.get<ApiResponse<Auction>>(`/auctions/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Auction not found');
    }
    return response.data.data!;
  },

  async getAuctionState(id: string): Promise<any> {
    const response = await api.get<ApiResponse<any>>(`/auctions/${id}/state`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get auction state');
    }
    return response.data.data!;
  },

  async startAuction(id: string): Promise<void> {
    const response = await api.post<ApiResponse<any>>(`/auctions/${id}/start`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to start auction');
    }
  },

  async pauseAuction(id: string): Promise<void> {
    const response = await api.post<ApiResponse<any>>(`/auctions/${id}/pause`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to pause auction');
    }
  },

  async resumeAuction(id: string): Promise<void> {
    const response = await api.post<ApiResponse<any>>(`/auctions/${id}/resume`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to resume auction');
    }
  },

  async getSquads(auctionId: string): Promise<Squad[]> {
    const response = await api.get<ApiResponse<Squad[]>>(`/auctions/${auctionId}/squads`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get squads');
    }
    return response.data.data || [];
  }
};