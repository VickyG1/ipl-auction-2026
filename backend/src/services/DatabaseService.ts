import sqlite3 from 'sqlite3';
import { Player, Auction, Squad, Bid, PlayerRole } from '../models';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DatabaseService {
  private db: sqlite3.Database;
  private static instance: DatabaseService;

  private constructor() {
    const dbPath = path.join(process.cwd(), 'auction.db');
    this.db = new sqlite3.Database(dbPath);
    this.initializeTables();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private initializeTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      const createTables = `
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          team TEXT,
          role TEXT NOT NULL,
          base_price INTEGER NOT NULL,
          category TEXT,
          stats TEXT,
          image_url TEXT,
          scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS auctions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'setup',
          current_player_id TEXT,
          timer_end_time DATETIME,
          settings TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS squads (
          id TEXT PRIMARY KEY,
          auction_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          budget_remaining INTEGER DEFAULT 12000,
          player_count INTEGER DEFAULT 0,
          role_counts TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (auction_id) REFERENCES auctions(id)
        );

        CREATE TABLE IF NOT EXISTS squad_players (
          id TEXT PRIMARY KEY,
          squad_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          purchase_price INTEGER NOT NULL,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (squad_id) REFERENCES squads(id),
          FOREIGN KEY (player_id) REFERENCES players(id)
        );

        CREATE TABLE IF NOT EXISTS bids (
          id TEXT PRIMARY KEY,
          auction_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          amount INTEGER NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_winning BOOLEAN DEFAULT 0,
          FOREIGN KEY (auction_id) REFERENCES auctions(id),
          FOREIGN KEY (player_id) REFERENCES players(id)
        );

        CREATE INDEX IF NOT EXISTS idx_bids_auction_player ON bids(auction_id, player_id);
        CREATE INDEX IF NOT EXISTS idx_squad_players_squad ON squad_players(squad_id);
        CREATE INDEX IF NOT EXISTS idx_squads_auction ON squads(auction_id);
      `;

      this.db.exec(createTables, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Player operations
  async insertPlayer(player: Omit<Player, 'id'>): Promise<string> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO players (id, name, team, role, base_price, category, stats, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        player.name,
        player.team || null,
        player.role,
        player.basePrice,
        player.category || null,
        JSON.stringify(player.stats || {}),
        player.imageUrl || null,
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        }
      );
      stmt.finalize();
    });
  }

  async getAllPlayers(): Promise<Player[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM players ORDER BY name', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const players: Player[] = rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            team: row.team,
            role: row.role as PlayerRole,
            basePrice: row.base_price,
            category: row.category,
            stats: JSON.parse(row.stats || '{}'),
            imageUrl: row.image_url,
            scrapedAt: new Date(row.scraped_at)
          }));
          resolve(players);
        }
      });
    });
  }

  async getPlayerById(id: string): Promise<Player | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM players WHERE id = ?', [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            name: row.name,
            team: row.team,
            role: row.role as PlayerRole,
            basePrice: row.base_price,
            category: row.category,
            stats: JSON.parse(row.stats || '{}'),
            imageUrl: row.image_url,
            scrapedAt: new Date(row.scraped_at)
          });
        }
      });
    });
  }

  // Auction operations
  async createAuction(auction: Omit<Auction, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO auctions (id, name, status, settings)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        id,
        auction.name,
        auction.status,
        JSON.stringify(auction.settings),
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        }
      );
      stmt.finalize();
    });
  }

  async updateAuction(id: string, updates: Partial<Auction>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.currentPlayerId !== undefined) {
      fields.push('current_player_id = ?');
      values.push(updates.currentPlayerId);
    }
    if (updates.timerEndTime !== undefined) {
      fields.push('timer_end_time = ?');
      values.push(updates.timerEndTime?.toISOString());
    }
    if (updates.settings) {
      fields.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE auctions SET ${fields.join(', ')} WHERE id = ?`;
      this.db.run(sql, values, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getAuctionById(id: string): Promise<Auction | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM auctions WHERE id = ?', [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            name: row.name,
            status: row.status,
            currentPlayerId: row.current_player_id,
            timerEndTime: row.timer_end_time ? new Date(row.timer_end_time) : undefined,
            settings: JSON.parse(row.settings),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
          });
        }
      });
    });
  }

  // Squad operations
  async createSquad(squad: Omit<Squad, 'id' | 'players' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO squads (id, auction_id, user_id, user_name, budget_remaining, player_count, role_counts)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        squad.auctionId,
        squad.userId,
        squad.userName,
        squad.budgetRemaining,
        squad.playerCount,
        JSON.stringify(squad.roleCounts),
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        }
      );
      stmt.finalize();
    });
  }

  async getSquadsByAuction(auctionId: string): Promise<Squad[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM squads WHERE auction_id = ?', [auctionId], async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const squads: Squad[] = [];
          for (const row of rows as any[]) {
            const players = await this.getSquadPlayers(row.id);
            squads.push({
              id: row.id,
              auctionId: row.auction_id,
              userId: row.user_id,
              userName: row.user_name,
              budgetRemaining: row.budget_remaining,
              playerCount: row.player_count,
              roleCounts: JSON.parse(row.role_counts),
              players,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          }
          resolve(squads);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async getSquadPlayers(squadId: string): Promise<Player[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT p.*, sp.purchase_price
        FROM players p
        JOIN squad_players sp ON p.id = sp.player_id
        WHERE sp.squad_id = ?
        ORDER BY sp.added_at
      `;

      this.db.all(sql, [squadId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const players: Player[] = (rows as any[]).map(row => ({
            id: row.id,
            name: row.name,
            team: row.team,
            role: row.role as PlayerRole,
            basePrice: row.base_price,
            category: row.category,
            stats: JSON.parse(row.stats || '{}'),
            imageUrl: row.image_url,
            scrapedAt: new Date(row.scraped_at)
          }));
          resolve(players);
        }
      });
    });
  }

  async addPlayerToSquad(squadId: string, playerId: string, purchasePrice: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const stmt = this.db.prepare(`
        INSERT INTO squad_players (id, squad_id, player_id, purchase_price)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(id, squadId, playerId, purchasePrice, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      stmt.finalize();
    });
  }

  // Bid operations
  async insertBid(bid: Omit<Bid, 'id'>): Promise<string> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO bids (id, auction_id, player_id, user_id, user_name, amount, is_winning)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        bid.auctionId,
        bid.playerId,
        bid.userId,
        bid.userName,
        bid.amount,
        bid.isWinning ? 1 : 0,
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        }
      );
      stmt.finalize();
    });
  }

  async getHighestBid(auctionId: string, playerId: string): Promise<Bid | null> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM bids
        WHERE auction_id = ? AND player_id = ?
        ORDER BY amount DESC, timestamp ASC
        LIMIT 1
      `;

      this.db.get(sql, [auctionId, playerId], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve({
            id: row.id,
            auctionId: row.auction_id,
            playerId: row.player_id,
            userId: row.user_id,
            userName: row.user_name,
            amount: row.amount,
            timestamp: new Date(row.timestamp),
            isWinning: row.is_winning === 1
          });
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        }
        resolve();
      });
    });
  }
}