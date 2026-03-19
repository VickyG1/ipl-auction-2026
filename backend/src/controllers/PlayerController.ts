import { Request, Response } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { PlayerScraper } from '../services/PlayerScraper';
import Joi from 'joi';

export class PlayerController {
  private db: DatabaseService;
  private scraper: PlayerScraper;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.scraper = new PlayerScraper();
  }

  async getAllPlayers(req: Request, res: Response): Promise<void> {
    try {
      const players = await this.db.getAllPlayers();
      res.json({
        success: true,
        data: players,
        count: players.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch players',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getPlayerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const player = await this.db.getPlayerById(id);

      if (!player) {
        res.status(404).json({
          success: false,
          message: 'Player not found'
        });
        return;
      }

      res.json({
        success: true,
        data: player
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch player',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async importPlayers(req: Request, res: Response): Promise<void> {
    try {
      const importedCount = await this.scraper.scrapeAndImportPlayers();

      res.json({
        success: true,
        message: `Successfully imported ${importedCount} players`,
        count: importedCount
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to import players',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}