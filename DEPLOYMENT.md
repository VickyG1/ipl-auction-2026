# IPL 2026 Auction Tool - Deployment Guide

## Overview

This is a complete IPL auction application with real-time bidding capabilities, designed to be deployed on Railway or similar cloud platforms.

## Architecture

- **Backend**: Node.js/Express with Socket.IO (Port 5001)
- **Frontend**: React with Material-UI (Port 3000)
- **Database**: SQLite for simplicity and portability
- **Real-time**: WebSocket connections via Socket.IO

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start both servers:
   ```bash
   npm run dev
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5001

## Railway Deployment

### Quick Deploy

1. Connect your repository to Railway
2. Set these environment variables:
   - `NODE_ENV=production`
   - `PORT` (auto-set by Railway)
   - `CORS_ORIGINS=*` (or your frontend domain)

3. Deploy using the provided `railway.toml` configuration

### Manual Steps

1. Create Railway project:
   ```bash
   railway login
   railway init
   ```

2. Deploy:
   ```bash
   railway up
   ```

3. Set environment variables:
   ```bash
   railway variables set NODE_ENV=production
   railway variables set CORS_ORIGINS=*
   ```

## Docker Deployment

1. Build image:
   ```bash
   docker build -t ipl-auction .
   ```

2. Run container:
   ```bash
   docker run -p 5001:5001 -e NODE_ENV=production ipl-auction
   ```

## Environment Configuration

### Production Environment Variables

- `NODE_ENV=production`
- `PORT=5001` (or Railway-assigned)
- `CORS_ORIGINS=*` (or specific frontend URLs)
- `DATABASE_URL=./auction.db`

### Optional

- `SOCKET_CORS_ORIGIN=*`

## Features

- ✅ **Complete auction workflow**: Player import, team creation, live bidding
- ✅ **Set-wise player ordering**: Players come in sets 0-13 with randomization
- ✅ **Overseas constraints**: Maximum 4 overseas players per team
- ✅ **Real-time bidding**: WebSocket-based live updates
- ✅ **Budget tracking**: Squad management with budget constraints
- ✅ **Enhanced display**: Player information with country, role, and set data

## Technical Details

### Backend Endpoints

- `GET /api/health` - Health check
- `POST /api/players/import-json` - Import players from JSON
- `POST /api/auctions` - Create auction
- `POST /api/auctions/:id/start` - Start auction
- WebSocket events for real-time bidding

### Data Source

- Players: 124 total from `data/ipl-players-2025-complete.json`
- Sets: Organized in sets 0-13 for proper auction flow
- Base prices: Correct values for each player category

### Database Schema

- SQLite database with tables for players, auctions, squads, and bids
- Automatic schema creation on first run
- Set-wise ordering stored in `auction_order` field

## Build Process

1. TypeScript compilation (`npm run build`)
2. Production optimization
3. Static file serving for production

## Troubleshooting

### Common Issues

1. **CORS errors**: Check `CORS_ORIGINS` environment variable
2. **Database issues**: Ensure write permissions for SQLite file
3. **Port conflicts**: Railway assigns ports automatically
4. **WebSocket connection**: Check firewall and proxy settings

### Logs

Check Railway logs or container logs for detailed error information.

## Support

For issues and improvements, refer to the main documentation or create an issue in the repository.
