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
          country TEXT DEFAULT 'India',
          is_overseas BOOLEAN DEFAULT 0,
          set_number INTEGER DEFAULT 0,
          batting_style TEXT,
          bowling_style TEXT,
          previous_team TEXT,
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
          overseas_count INTEGER DEFAULT 0,
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
          acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
          // Add new columns to existing tables if they don't exist
          this.migrateDatabase()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  }

  private async migrateDatabase(): Promise<void> {
    return new Promise((resolve) => {
      // Add new columns to players table if they don't exist
      const migrations = [
        'ALTER TABLE players ADD COLUMN country TEXT DEFAULT "India"',
        'ALTER TABLE players ADD COLUMN is_overseas BOOLEAN DEFAULT 0',
        'ALTER TABLE players ADD COLUMN set_number INTEGER DEFAULT 0',
        'ALTER TABLE players ADD COLUMN auction_order INTEGER',
        'ALTER TABLE players ADD COLUMN batting_style TEXT',
        'ALTER TABLE players ADD COLUMN bowling_style TEXT',
        'ALTER TABLE players ADD COLUMN previous_team TEXT',
        'ALTER TABLE squads ADD COLUMN overseas_count INTEGER DEFAULT 0'
      ];

      let completedMigrations = 0;
      const totalMigrations = migrations.length;

      migrations.forEach(migration => {
        this.db.run(migration, (err) => {
          // Ignore errors for columns that already exist
          if (err && !err.message.includes('duplicate column name')) {
            console.warn('Migration warning:', err.message);
          }
          completedMigrations++;
          if (completedMigrations === totalMigrations) {
            resolve();
          }
        });
      });
    });
  }

  // Player operations
  async insertPlayer(player: Omit<Player, 'id'> | Player): Promise<string> {
    const id = (player as any).id || uuidv4();
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO players (
          id, name, team, role, base_price, category, stats, image_url,
          country, is_overseas, set_number, auction_order, batting_style, bowling_style, previous_team
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        (player as any).country || 'India',
        (player as any).isOverseas ? 1 : 0,
        (player as any).setNumber || 0,
        (player as any).auctionOrder || 0,
        (player as any).battingStyle || null,
        (player as any).bowlingStyle || null,
        (player as any).previousTeam || null,
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

  async randomizePlayerOrder(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM players ORDER BY set_number, name', (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Group players by set number
        const playersBySets = new Map<number, any[]>();
        rows.forEach((player: any) => {
          const setNumber = player.set_number || 0;
          if (!playersBySets.has(setNumber)) {
            playersBySets.set(setNumber, []);
          }
          playersBySets.get(setNumber)!.push(player);
        });

        // Randomize within each set and assign new auction order
        let globalOrder = 0;
        const orderedPlayers: any[] = [];
        const sortedSets = Array.from(playersBySets.keys()).sort((a, b) => a - b);

        console.log(`🎲 Randomizing players across ${sortedSets.length} sets...`);

        sortedSets.forEach((setNumber) => {
          const setPlayers = playersBySets.get(setNumber)!;

          // Fisher-Yates shuffle with current timestamp as seed
          const seed = Date.now() + setNumber;
          for (let i = setPlayers.length - 1; i > 0; i--) {
            // Seeded random using timestamp
            const random = Math.abs(Math.sin(seed + i * 12345)) * 10000;
            const j = Math.floor((random % 1) * (i + 1));
            [setPlayers[i], setPlayers[j]] = [setPlayers[j], setPlayers[i]];
          }

          // Assign new auction order
          setPlayers.forEach((player) => {
            player.auction_order = globalOrder++;
          });

          orderedPlayers.push(...setPlayers);
          console.log(`🔀 Set ${setNumber}: Randomized ${setPlayers.length} players`);
        });

        // Update database with new auction order
        const stmt = this.db.prepare('UPDATE players SET auction_order = ? WHERE id = ?');
        orderedPlayers.forEach((player) => {
          stmt.run(player.auction_order, player.id);
        });

        stmt.finalize((err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`✅ Randomized auction order for ${orderedPlayers.length} players!`);
            console.log(`🎯 Order: Set 0 → Set 1 → Set 2... with fresh randomization within sets`);
            resolve();
          }
        });
      });
    });
  }

  async getAllPlayers(): Promise<Player[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM players ORDER BY auction_order', (err, rows) => {
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
            country: row.country,
            isOverseas: row.is_overseas === 1,
            setNumber: row.set_number,
            battingStyle: row.batting_style,
            bowlingStyle: row.bowling_style,
            previousTeam: row.previous_team,
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
            country: row.country,
            isOverseas: row.is_overseas === 1,
            setNumber: row.set_number,
            battingStyle: row.batting_style,
            bowlingStyle: row.bowling_style,
            previousTeam: row.previous_team,
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
        INSERT INTO squads (id, auction_id, user_id, user_name, budget_remaining, player_count, overseas_count, role_counts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        squad.auctionId,
        squad.userId,
        squad.userName,
        squad.budgetRemaining,
        squad.playerCount,
        (squad as any).overseasCount || 0,
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
      this.db.all('SELECT * FROM squads WHERE auction_id = ?', [auctionId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Process squads sequentially to avoid the infinite loop
        const processSquads = async () => {
          try {
            const squads: Squad[] = [];

            for (const row of rows as any[]) {
              const players = await this.getSquadPlayers(row.id);
              console.log(`Squad ${row.user_name} players:`, players.map(p => ({ name: p.name, purchasePrice: p.purchasePrice })));

              squads.push({
                id: row.id,
                auctionId: row.auction_id,
                userId: row.user_id,
                userName: row.user_name,
                budgetRemaining: row.budget_remaining,
                playerCount: row.player_count,
                overseasCount: row.overseas_count || 0,
                roleCounts: JSON.parse(row.role_counts),
                players,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at)
              });
            }

            console.log('Total squads with players:', squads.length);
            resolve(squads);
          } catch (error) {
            reject(error);
          }
        };

        // Call the async function
        processSquads();
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
        ORDER BY sp.acquired_at
      `;

      this.db.all(sql, [squadId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Raw squad players data for squad ${squadId}:`, rows);

          const players: Player[] = (rows as any[]).map(row => ({
            id: row.id,
            name: row.name,
            team: row.team,
            role: row.role as PlayerRole,
            basePrice: row.base_price,
            category: row.category,
            stats: JSON.parse(row.stats || '{}'),
            imageUrl: row.image_url,
            country: row.country,
            isOverseas: row.is_overseas === 1,
            setNumber: row.set_number,
            battingStyle: row.batting_style,
            bowlingStyle: row.bowling_style,
            previousTeam: row.previous_team,
            scrapedAt: new Date(row.scraped_at),
            purchasePrice: row.purchase_price // Include purchase price for squad players
          }));

          console.log(`Processed squad players:`, players.map(p => ({ name: p.name, purchasePrice: p.purchasePrice })));
          resolve(players);
        }
      });
    });
  }

  async addPlayerToSquad(squadId: string, player: Player, soldPrice: number): Promise<void> {
    console.log('Adding player to squad:', player.name, 'to squad:', squadId, 'for price:', soldPrice);

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // Add player to squad_players table
        const insertPlayerStmt = this.db.prepare(`
          INSERT INTO squad_players (id, squad_id, player_id, purchase_price, acquired_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        const playerId = uuidv4();
        console.log('Inserting into squad_players with ID:', playerId);

        insertPlayerStmt.run(
          playerId,
          squadId,
          player.id,
          soldPrice,
          new Date().toISOString(),
          (err: any) => {
            if (err) {
              console.error('Error inserting squad player:', err);
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }
            console.log('Squad player inserted successfully');
          }
        );
        insertPlayerStmt.finalize();

        // Update squad stats
        const updateSquadStmt = this.db.prepare(`
          UPDATE squads SET
            budget_remaining = budget_remaining - ?,
            player_count = player_count + 1,
            overseas_count = overseas_count + ?,
            role_counts = json_set(
              role_counts,
              '$.' || ?,
              COALESCE(json_extract(role_counts, '$.' || ?), 0) + 1
            )
          WHERE id = ?
        `);

        console.log('Updating squad stats for role:', player.role, 'isOverseas:', (player as any).isOverseas);

        updateSquadStmt.run(
          soldPrice,
          (player as any).isOverseas ? 1 : 0,
          player.role,
          player.role,
          squadId,
          (err: any) => {
            if (err) {
              console.error('Error updating squad:', err);
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }
            console.log('Squad updated successfully');
          }
        );
        updateSquadStmt.finalize();

        this.db.run('COMMIT', (err) => {
          if (err) {
            console.error('Transaction failed, rolling back:', err);
            this.db.run('ROLLBACK');
            reject(err);
          } else {
            console.log('Transaction committed successfully');
            resolve();
          }
        });
      });
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

  // Import players from JSON file with set-wise ordering and randomization
  async importPlayersFromJson(): Promise<number> {
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const path = require('path');

      try {
        // Read the JSON file
        const dataPath = path.join(process.cwd(), '../data/ipl-players-2025-complete.json');
        console.log('Trying to read from:', dataPath);
        console.log('File exists:', fs.existsSync(dataPath));

        const playersData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`📊 Loaded ${playersData.length} players from JSON`);

        // Group players by set number
        const playersBySets = new Map<number, any[]>();
        playersData.forEach((player: any) => {
          const setNumber = player.setNumber || 0;
          if (!playersBySets.has(setNumber)) {
            playersBySets.set(setNumber, []);
          }
          playersBySets.get(setNumber)!.push(player);
        });

        console.log(`📋 Players organized into ${playersBySets.size} sets`);

        // Randomize players within each set and create ordered list
        const orderedPlayers: any[] = [];
        const sortedSets = Array.from(playersBySets.keys()).sort((a, b) => a - b);

        sortedSets.forEach((setNumber, setIndex) => {
          const setPlayers = playersBySets.get(setNumber)!;
          console.log(`🎲 Set ${setNumber}: ${setPlayers.length} players`);

          // Shuffle players within this set using Fisher-Yates algorithm with seed
          const seed = Date.now() + setNumber; // Use timestamp + set number as seed
          for (let i = setPlayers.length - 1; i > 0; i--) {
            // Simple seeded random number generator
            const random = Math.abs(Math.sin(seed + i)) * 10000;
            const j = Math.floor((random % 1) * (i + 1));
            [setPlayers[i], setPlayers[j]] = [setPlayers[j], setPlayers[i]];
          }

          // Assign auction order numbers
          setPlayers.forEach((player, playerIndex) => {
            const auctionOrder = (setIndex * 100) + playerIndex; // E.g., Set 0: 0-99, Set 1: 100-199
            player.auctionOrder = auctionOrder;
          });

          orderedPlayers.push(...setPlayers);
        });

        console.log(`✅ Final auction order established: ${orderedPlayers.length} players`);
        console.log(`🔀 Randomized within sets: ${sortedSets.map(s => `Set ${s}`).join(', ')}`);

        // Clear existing players
        this.db.run('DELETE FROM players', (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Insert players with their auction order
          let insertedCount = 0;
          const stmt = this.db.prepare(`
            INSERT INTO players (
              id, name, team, role, base_price, category, stats, image_url,
              country, is_overseas, set_number, auction_order, batting_style, bowling_style, previous_team
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const player of orderedPlayers) {
            stmt.run(
              player.id,
              player.name,
              null, // team will be set during auction
              player.role,
              player.basePrice,
              player.category,
              JSON.stringify(player.stats || {}),
              player.imageUrl || null,
              player.country || 'India',
              player.isOverseas ? 1 : 0,
              player.setNumber || 0,
              player.auctionOrder,
              player.battingStyle || null,
              player.bowlingStyle || null,
              player.previousTeam || null,
              (err: any) => {
                if (err) {
                  console.error('Error inserting player:', player.name, err);
                } else {
                  insertedCount++;
                }
              }
            );
          }

          stmt.finalize((err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`🏏 Imported ${insertedCount} players with set-wise ordering!`);
              console.log(`🎯 Players will come in order: Set 0 → Set 1 → Set 2... → Set 13`);
              console.log(`🔀 Within each set: Randomized order`);
              resolve(insertedCount);
            }
          });
        });
      } catch (err) {
        reject(err);
      }
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