# IPL 2026 Auction Tool

A comprehensive real-time auction platform for conducting IPL player auctions with friends.

## Features

- 🏏 Real-time bidding on IPL 2026 players
- 📊 Squad management with budget and composition rules
- ⚡ Live updates across all participants
- 📱 Mobile-friendly responsive design
- 🏆 Fantasy points tracking and leaderboards
- 🔄 Automatic player data collection via web scraping

## Quick Start

### Installation

```bash
# Install all dependencies
npm run install-all
```

### Development

```bash
# Start both backend and frontend in development mode
npm run dev
```

### Production

```bash
# Build and start production server
npm run start-local
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

For local network access (so friends can join):
- Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Share: http://[YOUR_LOCAL_IP]:3000

## Squad Rules

- **Players:** Maximum 12 per squad
- **Budget:** 120 crores (tracking in lakhs)
- **Composition:**
  - Minimum 1 wicket-keeper
  - Minimum 1 all-rounder
  - Minimum 3 bowlers
  - Flexible remaining slots

## Tech Stack

- **Frontend:** React + TypeScript + Material-UI + Redux Toolkit
- **Backend:** Node.js + Express + TypeScript + Socket.IO
- **Database:** SQLite (local) + Redis (optional)
- **Real-time:** WebSocket connections via Socket.IO

## Project Structure

```
ipl-auction-2026/
├── backend/          # Node.js backend server
├── frontend/         # React frontend application
├── data/             # Player data and configurations
└── package.json      # Root package management
```

## Development Notes

- Player data automatically scraped from IPL/cricket websites
- SQLite database created automatically on first run
- Real-time state synchronization across all clients
- Comprehensive input validation and business logic

Ready to conduct your IPL auction! 🎯