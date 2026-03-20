import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import dotenv from 'dotenv';

import { SocketManager } from './services/SocketManager';
import { PlayerController } from './controllers/PlayerController';
import { AuctionController } from './controllers/auctionController';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

// Initialize Socket Manager
const socketManager = new SocketManager(server);

// Controllers
const playerController = new PlayerController();
const auctionController = new AuctionController(socketManager.getAuctionEngine());

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for Socket.IO
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGINS?.split(',') || true
    : ['http://localhost:3000', 'http://10.171.116.70:3000', 'http://localhost:5002', 'http://10.171.116.70:5002'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IPL Auction API is running',
    timestamp: new Date().toISOString()
  });
});

// Debug route for Railway
app.get('/api/debug', (req, res) => {
  const fs = require('fs');
  res.json({
    success: true,
    cwd: process.cwd(),
    dirname: __dirname,
    nodeEnv: process.env.NODE_ENV,
    frontendExists: fs.existsSync(path.join(process.cwd(), '../frontend/build')),
    dataExists: fs.existsSync(path.join(process.cwd(), '../data')),
    files: fs.readdirSync(process.cwd()),
    parentFiles: fs.existsSync(path.join(process.cwd(), '..')) ? fs.readdirSync(path.join(process.cwd(), '..')) : 'NO_PARENT'
  });
});

// Player routes
app.get('/api/players', (req, res) => playerController.getAllPlayers(req, res));
app.get('/api/players/:id', (req, res) => playerController.getPlayerById(req, res));
// app.post('/api/players/import', (req, res) => playerController.importPlayers(req, res)); // DISABLED: Use JSON import only
app.post('/api/players/import-json', (req, res) => playerController.importPlayersFromJson(req, res));

// Auction routes
app.post('/api/auctions', (req, res) => auctionController.createAuction(req, res));
app.get('/api/auctions/:id', (req, res) => auctionController.getAuction(req, res));
app.post('/api/auctions/:id/join', (req, res) => auctionController.joinAuction(req, res));
app.get('/api/auctions/:id/state', (req, res) => auctionController.getAuctionState(req, res));
app.post('/api/auctions/:id/start', (req, res) => auctionController.startAuction(req, res));
app.post('/api/auctions/:id/pause', (req, res) => auctionController.pauseAuction(req, res));
app.post('/api/auctions/:id/resume', (req, res) => auctionController.resumeAuction(req, res));
app.post('/api/auctions/:id/sell-now', (req, res) => auctionController.sellPlayerNow(req, res));
app.get('/api/auctions/:id/squads', (req, res) => auctionController.getSquads(req, res));

// Serve static files from React build (for production)
if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(process.cwd(), '../frontend/build');
  console.log('🌐 Production mode detected');
  console.log('📁 Frontend build path:', frontendBuildPath);
  console.log('📁 Current working directory:', process.cwd());
  console.log('📁 __dirname:', __dirname);

  const fs = require('fs');
  console.log('📋 Directory contents:', fs.existsSync(frontendBuildPath) ? 'EXISTS' : 'MISSING');
  if (fs.existsSync(frontendBuildPath)) {
    console.log('📋 Build directory files:', fs.readdirSync(frontendBuildPath));
  }

  try {
    app.use(express.static(frontendBuildPath));
    console.log('✅ Static middleware configured');

    // Serve React app for any non-API routes
    app.get('*', (req, res) => {
      console.log('📄 Serving index.html for:', req.url);
      const indexPath = path.join(frontendBuildPath, 'index.html');
      console.log('📄 Index path:', indexPath, fs.existsSync(indexPath) ? 'EXISTS' : 'MISSING');
      res.sendFile(indexPath);
    });
  } catch (error: any) {
    console.error('❌ Error setting up static serving:', error);
    app.get('/', (req, res) => {
      res.json({
        error: 'Frontend serving failed',
        details: error?.message || 'Unknown error',
        path: frontendBuildPath
      });
    });
  }
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('=== ERROR DETAILS ===');
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  console.error('Request URL:', req.url);
  console.error('Request Method:', req.method);
  console.error('===================');
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    url: req.url,
    method: req.method
  });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Start server
server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🏏 IPL Auction Server running on port ${PORT}`);
  console.log(`📡 Socket.IO enabled for real-time updates`);
  console.log(`🌐 Server accessible at http://localhost:${PORT}`);

  // Get local IP for network access
  const networkInterfaces = require('os').networkInterfaces();
  const privateIP = Object.values(networkInterfaces)
    .flat()
    .find((details: any) => details && details.family === 'IPv4' && !details.internal) as any;

  if (privateIP && privateIP.address) {
    console.log(`🏠 Local network access: http://${privateIP.address}:${PORT}`);
    console.log(`👥 Share this URL with friends to join the auction!`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  socketManager.cleanup();
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  socketManager.cleanup();
  server.close(() => {
    console.log('Process terminated');
  });
});

export default app;