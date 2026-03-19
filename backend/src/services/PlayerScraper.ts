import axios from 'axios';
import * as cheerio from 'cheerio';
import { Player, PlayerRole, PlayerCategory } from '../models';
import { DatabaseService } from './DatabaseService';
import fs from 'fs/promises';
import path from 'path';

interface ScrapedPlayerData {
  name: string;
  team?: string;
  role: string;
  basePrice: number;
  category?: string;
  stats?: any;
}

export class PlayerScraper {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  async scrapeAndImportPlayers(): Promise<number> {
    try {
      console.log('Starting IPL 2026 player data collection...');

      // Try to scrape from multiple sources
      let players: Omit<Player, 'id'>[] = [];

      // First, try to load pre-existing JSON data
      const jsonData = await this.loadFromJSON();
      if (jsonData.length > 0) {
        players = jsonData;
        console.log(`Loaded ${players.length} players from JSON file`);
      } else {
        // Try web scraping
        const scrapedPlayers = await this.scrapeFromMultipleSources();
        if (scrapedPlayers.length > 0) {
          players = scrapedPlayers.map(this.convertToPlayer);
          console.log(`Scraped ${players.length} players from web sources`);

          // Save scraped data to JSON for future use
          await this.saveToJSON(players);
        } else {
          // Fall back to mock data for development
          players = this.generateMockPlayers();
          console.log(`Using ${players.length} mock players for development`);
        }
      }

      // Import all players to database
      let importedCount = 0;
      for (const player of players) {
        try {
          await this.db.insertPlayer(player);
          importedCount++;
        } catch (error) {
          console.warn(`Failed to import player ${player.name}:`, error);
        }
      }

      console.log(`Successfully imported ${importedCount} players to database`);
      return importedCount;

    } catch (error) {
      console.error('Error in player scraping/import:', error);
      throw error;
    }
  }

  private async loadFromJSON(): Promise<Omit<Player, 'id'>[]> {
    try {
      const jsonPath = path.join(process.cwd(), '..', 'data', 'ipl-players-2026.json');
      const jsonData = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(jsonData);

      if (Array.isArray(data) && data.length > 0) {
        return data.map(player => this.validateAndNormalizePlayer(player));
      }
    } catch (error) {
      console.log('No existing JSON data found, will attempt web scraping');
    }
    return [];
  }

  private async saveToJSON(players: Omit<Player, 'id'>[]): Promise<void> {
    try {
      const dataDir = path.join(process.cwd(), '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });

      const jsonPath = path.join(dataDir, 'ipl-players-2026.json');
      await fs.writeFile(jsonPath, JSON.stringify(players, null, 2));

      console.log(`Saved player data to ${jsonPath}`);
    } catch (error) {
      console.warn('Failed to save player data to JSON:', error);
    }
  }

  private async scrapeFromMultipleSources(): Promise<ScrapedPlayerData[]> {
    const allPlayers: ScrapedPlayerData[] = [];

    try {
      // Try ESPN Cricinfo
      const espnPlayers = await this.scrapeESPNCricinfo();
      allPlayers.push(...espnPlayers);
      console.log(`ESPN Cricinfo: Found ${espnPlayers.length} players`);
    } catch (error) {
      console.warn('Failed to scrape ESPN Cricinfo:', error);
    }

    try {
      // Try Cricbuzz if we need more players
      if (allPlayers.length < 200) {
        const cricbuzzPlayers = await this.scrapeCricbuzz();
        allPlayers.push(...cricbuzzPlayers);
        console.log(`Cricbuzz: Found ${cricbuzzPlayers.length} additional players`);
      }
    } catch (error) {
      console.warn('Failed to scrape Cricbuzz:', error);
    }

    return this.deduplicatePlayers(allPlayers);
  }

  private async scrapeESPNCricinfo(): Promise<ScrapedPlayerData[]> {
    try {
      // Note: In a production environment, you would need to respect robots.txt
      // and implement proper rate limiting and user-agent headers

      const response = await axios.get('https://www.espncricinfo.com/series/ipl-2024-1345038/players', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const players: ScrapedPlayerData[] = [];

      // This is a simplified example - actual scraping would need to
      // adapt to the specific HTML structure of the target website
      $('.player-card').each((_, element) => {
        const name = $(element).find('.player-name').text().trim();
        const team = $(element).find('.team-name').text().trim();
        const role = this.normalizeRole($(element).find('.player-role').text().trim());
        const basePriceText = $(element).find('.base-price').text().trim();

        if (name) {
          players.push({
            name,
            team: team || undefined,
            role,
            basePrice: this.parseBasePrice(basePriceText),
            category: this.determineCategory(name, team)
          });
        }
      });

      return players;

    } catch (error) {
      console.warn('ESPN Cricinfo scraping failed:', error);
      return [];
    }
  }

  private async scrapeCricbuzz(): Promise<ScrapedPlayerData[]> {
    try {
      // Another example scraping endpoint
      const response = await axios.get('https://www.cricbuzz.com/cricket-series/ipl-2024/players', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const players: ScrapedPlayerData[] = [];

      // Adapt to actual site structure
      $('.player-list-item').each((_, element) => {
        const name = $(element).find('.player-name').text().trim();
        const role = this.normalizeRole($(element).find('.role').text().trim());

        if (name) {
          players.push({
            name,
            role,
            basePrice: this.generateRandomBasePrice(role),
            category: this.determineCategory(name)
          });
        }
      });

      return players;

    } catch (error) {
      console.warn('Cricbuzz scraping failed:', error);
      return [];
    }
  }

  private deduplicatePlayers(players: ScrapedPlayerData[]): ScrapedPlayerData[] {
    const seen = new Set<string>();
    const deduplicated: ScrapedPlayerData[] = [];

    for (const player of players) {
      const key = player.name.toLowerCase().replace(/\s+/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(player);
      }
    }

    return deduplicated;
  }

  private convertToPlayer(scraped: ScrapedPlayerData): Omit<Player, 'id'> {
    return {
      name: scraped.name,
      team: scraped.team,
      role: this.mapToPlayerRole(scraped.role),
      basePrice: scraped.basePrice,
      category: scraped.category as PlayerCategory,
      stats: scraped.stats || {},
      scrapedAt: new Date()
    };
  }

  private normalizeRole(role: string): string {
    const normalized = role.toLowerCase();
    if (normalized.includes('wicket') || normalized.includes('keeper')) return 'WK';
    if (normalized.includes('all') || normalized.includes('rounder')) return 'AR';
    if (normalized.includes('bowl')) return 'BOWL';
    return 'BAT';
  }

  private mapToPlayerRole(role: string): PlayerRole {
    switch (role.toUpperCase()) {
      case 'WK': return PlayerRole.WK;
      case 'AR': return PlayerRole.AR;
      case 'BOWL': return PlayerRole.BOWL;
      default: return PlayerRole.BAT;
    }
  }

  private parseBasePrice(priceText: string): number {
    // Extract price from text like "₹2.5 crore" or "2.5 Cr"
    const match = priceText.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const value = parseFloat(match[1]);
      // Convert crores to lakhs
      if (priceText.toLowerCase().includes('crore')) {
        return value * 100;
      }
      return value;
    }
    return this.generateRandomBasePrice('BAT');
  }

  private generateRandomBasePrice(role: string): number {
    // Generate realistic base prices in lakhs
    const ranges = {
      WK: [20, 200],    // 20L - 2Cr
      AR: [50, 1500],   // 50L - 15Cr
      BOWL: [20, 500],  // 20L - 5Cr
      BAT: [20, 1000]   // 20L - 10Cr
    };

    const range = ranges[role as keyof typeof ranges] || ranges.BAT;
    const min = range[0];
    const max = range[1];

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private determineCategory(name: string, team?: string): string {
    // Simple heuristic for determining player category
    // In real implementation, this would use more sophisticated logic

    const marqueeNames = ['virat', 'dhoni', 'rohit', 'kohli', 'bumrah', 'pandya'];
    const lowercaseName = name.toLowerCase();

    if (marqueeNames.some(marquee => lowercaseName.includes(marquee))) {
      return PlayerCategory.MARQUEE;
    }

    if (team) {
      return PlayerCategory.CAPPED;
    }

    return PlayerCategory.UNCAPPED;
  }

  private validateAndNormalizePlayer(player: any): Omit<Player, 'id'> {
    return {
      name: player.name || 'Unknown Player',
      team: player.team,
      role: this.mapToPlayerRole(player.role || 'BAT'),
      basePrice: typeof player.basePrice === 'number' ? player.basePrice : 20,
      category: player.category as PlayerCategory || PlayerCategory.UNCAPPED,
      stats: player.stats || {},
      imageUrl: player.imageUrl,
      scrapedAt: new Date()
    };
  }

  private generateMockPlayers(): Omit<Player, 'id'>[] {
    const teams = ['CSK', 'MI', 'RCB', 'DC', 'KKR', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'];
    const players: Omit<Player, 'id'>[] = [];

    // Generate some marquee players
    const marqueeNames = [
      { name: 'Virat Kohli', role: PlayerRole.BAT, basePrice: 1500, team: 'RCB' },
      { name: 'MS Dhoni', role: PlayerRole.WK, basePrice: 1200, team: 'CSK' },
      { name: 'Rohit Sharma', role: PlayerRole.BAT, basePrice: 1400, team: 'MI' },
      { name: 'Jasprit Bumrah', role: PlayerRole.BOWL, basePrice: 1000, team: 'MI' },
      { name: 'Hardik Pandya', role: PlayerRole.AR, basePrice: 1600, team: 'MI' },
      { name: 'Rashid Khan', role: PlayerRole.BOWL, basePrice: 1500, team: 'GT' },
      { name: 'KL Rahul', role: PlayerRole.WK, basePrice: 1100, team: 'LSG' },
      { name: 'Jos Buttler', role: PlayerRole.WK, basePrice: 1000, team: 'RR' }
    ];

    marqueeNames.forEach(player => {
      players.push({
        name: player.name,
        team: player.team,
        role: player.role,
        basePrice: player.basePrice,
        category: PlayerCategory.MARQUEE,
        stats: {
          matches: Math.floor(Math.random() * 200) + 50,
          runs: Math.floor(Math.random() * 6000) + 1000,
          average: Math.random() * 20 + 30,
          strikeRate: Math.random() * 50 + 120,
          fantasyPoints: Math.floor(Math.random() * 1000) + 500
        },
        scrapedAt: new Date()
      });
    });

    // Generate additional players for each team
    teams.forEach(team => {
      for (let i = 0; i < 20; i++) {
        const roles = [PlayerRole.BAT, PlayerRole.BOWL, PlayerRole.AR, PlayerRole.WK];
        const role = roles[Math.floor(Math.random() * roles.length)];

        players.push({
          name: `${team} Player ${i + 1}`,
          team,
          role,
          basePrice: this.generateRandomBasePrice(role),
          category: i < 10 ? PlayerCategory.CAPPED : PlayerCategory.UNCAPPED,
          stats: {
            matches: Math.floor(Math.random() * 100) + 10,
            runs: role !== PlayerRole.BOWL ? Math.floor(Math.random() * 2000) + 100 : 0,
            wickets: role === PlayerRole.BOWL || role === PlayerRole.AR ? Math.floor(Math.random() * 100) + 5 : 0,
            average: Math.random() * 15 + 20,
            strikeRate: Math.random() * 40 + 110,
            fantasyPoints: Math.floor(Math.random() * 500) + 100
          },
          scrapedAt: new Date()
        });
      }
    });

    return players;
  }
}