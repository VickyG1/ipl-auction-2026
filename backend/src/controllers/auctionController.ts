import { Request, Response } from 'express';
import { AuctionEngine } from '../services/AuctionEngine';
import { DatabaseService } from '../services/DatabaseService';
import Joi from 'joi';

export class AuctionController {
  private auctionEngine: AuctionEngine;
  private db: DatabaseService;

  constructor(auctionEngine: AuctionEngine) {
    this.auctionEngine = auctionEngine;
    this.db = DatabaseService.getInstance();
  }

  async createAuction(req: Request, res: Response): Promise<void> {
    try {
      const schema = Joi.object({
        name: Joi.string().min(3).max(100).required(),
        participants: Joi.array().items(Joi.string().min(1)).min(0).max(8).default([])
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          error: error.details[0].message
        });
        return;
      }

      const { name, participants } = value;
      const auctionId = await this.auctionEngine.createAuction(name, participants);

      res.status(201).json({
        success: true,
        message: 'Auction created successfully',
        data: { auctionId }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create auction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getAuction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const auction = await this.db.getAuctionById(id);

      if (!auction) {
        res.status(404).json({
          success: false,
          message: 'Auction not found'
        });
        return;
      }

      res.json({
        success: true,
        data: auction
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch auction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getAuctionState(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const state = await this.auctionEngine.getCurrentAuctionState(id);

      res.json({
        success: true,
        data: state
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch auction state',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async startAuction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.auctionEngine.startAuction(id);

      res.json({
        success: true,
        message: 'Auction started successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to start auction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async pauseAuction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.auctionEngine.pauseAuction(id);

      res.json({
        success: true,
        message: 'Auction paused successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to pause auction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async resumeAuction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.auctionEngine.resumeAuction(id);

      res.json({
        success: true,
        message: 'Auction resumed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to resume auction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getSquads(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const squads = await this.auctionEngine.getSquadsByAuction(id);

      res.json({
        success: true,
        data: squads
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch squads',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async joinAuction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const schema = Joi.object({
        userName: Joi.string().min(2).max(50).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          error: error.details[0].message
        });
        return;
      }

      const { userName } = value;
      const success = await this.auctionEngine.addParticipant(id, userName);

      if (!success) {
        res.status(409).json({
          success: false,
          message: 'User already participating in this auction'
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'Successfully joined auction',
        data: { userName, auctionId: id }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to join auction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async sellPlayerNow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params; // auction id
      const { playerId } = req.body;

      if (!playerId) {
        res.status(400).json({
          success: false,
          message: 'Player ID is required'
        });
        return;
      }

      await this.auctionEngine.sellPlayerNow(id, playerId);

      res.json({
        success: true,
        message: 'Player sold successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to sell player',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}