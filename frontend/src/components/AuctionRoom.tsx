import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Timer,
  Gavel,
  PlayArrow,
  Pause,
  Undo,
  SkipPrevious
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';

import { RootState } from '../store';
import { socketService } from '../services/socketService';
import {
  setLoading,
  setError,
  setConnected,
  setAuctionState,
  setCurrentPlayer,
  setBid,
  updateTimer,
  playerSold,
  playerUnsold,
  updateSquads,
  updateConnectedUsers,
  auctionComplete,
  pauseAuction,
  resumeAuction
} from '../store/auctionSlice';
import { PlayerRole } from '../types';

const StyledCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.2s',
  '&:hover': {
    transform: 'translateY(-2px)'
  }
}));

const TimerDisplay = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '2rem',
  fontWeight: 'bold',
  padding: theme.spacing(2),
  borderRadius: theme.spacing(1),
  background: theme.palette.error.main,
  color: theme.palette.error.contrastText,
  marginBottom: theme.spacing(2)
}));

const BidControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  alignItems: 'center',
  marginTop: theme.spacing(2)
}));

interface AuctionRoomProps {
  auctionId: string;
  userName: string;
}

const AuctionRoom: React.FC<AuctionRoomProps> = ({ auctionId, userName }) => {
  const dispatch = useDispatch();
  const {
    currentAuction,
    currentPlayer,
    currentBid,
    timeRemaining,
    squads,
    connectedUsers,
    isLoading,
    error,
    isConnected
  } = useSelector((state: RootState) => state.auction);

  const [bidAmount, setBidAmount] = useState<string>('');
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showSquadDetails, setShowSquadDetails] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const userSquad = squads.find(squad => squad.userName === userName);
  const isAuctionActive = currentAuction?.status === 'active';
  const canBid = isAuctionActive && currentPlayer && userSquad;

  // Socket event handlers
  const handleSocketEvents = useCallback(() => {
    socketService.on('join_success', (data) => {
      dispatch(setAuctionState(data.auctionState));
      dispatch(setConnected(true));
      setSnackbar({ open: true, message: 'Successfully joined auction!', severity: 'success' });
    });

    socketService.on('auction_started', (data) => {
      dispatch(setCurrentPlayer(data.player));
      setSnackbar({ open: true, message: 'Auction has started!', severity: 'success' });
    });

    socketService.on('bid_placed', (data) => {
      dispatch(setBid({ bid: data.bid, timeRemaining: data.timeRemaining }));
    });

    socketService.on('player_sold', (data) => {
      dispatch(playerSold(data));

      // Update squads if provided
      if (data.updatedSquads) {
        console.log('Frontend received updated squads:', JSON.stringify(data.updatedSquads.map(s => ({
          userName: s.userName,
          players: s.players.map(p => ({ name: p.name, purchasePrice: p.purchasePrice }))
        })), null, 2));

        dispatch(updateSquads(data.updatedSquads));
      }

      setSnackbar({
        open: true,
        message: `${currentPlayer?.name} sold to ${data.winner} for ₹${data.amount} lakhs!`,
        severity: 'success'
      });
    });

    socketService.on('player_unsold', () => {
      dispatch(playerUnsold());
      setSnackbar({
        open: true,
        message: `${currentPlayer?.name} went unsold`,
        severity: 'error'
      });
    });

    socketService.on('next_player', (data) => {
      dispatch(setCurrentPlayer(data.player));
    });

    socketService.on('timer_update', (data) => {
      dispatch(updateTimer(data));
    });

    socketService.on('auction_state', (data) => {
      dispatch(setAuctionState(data));
    });

    socketService.on('user_joined', (data) => {
      dispatch(updateConnectedUsers(data.connectedUsers));
      setSnackbar({
        open: true,
        message: `${data.userName} joined the auction`,
        severity: 'success'
      });
    });

    socketService.on('user_left', (data) => {
      dispatch(updateConnectedUsers(data.connectedUsers));
    });

    socketService.on('auction_complete', () => {
      dispatch(auctionComplete());
      setSnackbar({
        open: true,
        message: 'Auction completed!',
        severity: 'success'
      });
    });

    socketService.on('auction_paused', () => {
      dispatch(pauseAuction());
      setSnackbar({
        open: true,
        message: 'Auction paused',
        severity: 'error'
      });
    });

    socketService.on('auction_resumed', () => {
      dispatch(resumeAuction());
      setSnackbar({
        open: true,
        message: 'Auction resumed',
        severity: 'success'
      });
    });

    socketService.on('error', (data) => {
      dispatch(setError(data.message));
      setSnackbar({ open: true, message: data.message, severity: 'error' });
    });

    // Undo event listeners
    socketService.on('undo_success', (data) => {
      setSnackbar({
        open: true,
        message: data.message,
        severity: 'success'
      });
    });

    socketService.on('player_sale_undone', (data) => {
      setSnackbar({
        open: true,
        message: `Undid sale of ${data.player.name}`,
        severity: 'success'
      });
    });

    socketService.on('undo_to_previous_player', (data) => {
      setSnackbar({
        open: true,
        message: `Moved back to ${data.player.name}`,
        severity: 'success'
      });
    });

    socketService.on('bid_removed', (data) => {
      setSnackbar({
        open: true,
        message: `Removed bid for ${data.playerId}`,
        severity: 'success'
      });
    });

    socketService.on('bid_error', (data) => {
      setSnackbar({ open: true, message: data.message, severity: 'error' });
    });
  }, [dispatch, currentPlayer?.name]);

  // Initialize connection
  useEffect(() => {
    const connectAndJoin = async () => {
      try {
        dispatch(setLoading(true));
        await socketService.connect();
        handleSocketEvents();
        socketService.joinAuction(auctionId, userName);
      } catch (error) {
        dispatch(setError('Failed to connect to auction'));
      } finally {
        dispatch(setLoading(false));
      }
    };

    connectAndJoin();

    return () => {
      socketService.disconnect();
    };
  }, [auctionId, userName, dispatch, handleSocketEvents]);

  const handlePlaceBid = () => {
    if (!currentPlayer || !bidAmount) return;

    const amount = parseFloat(bidAmount);
    const currentAmount = currentBid ? currentBid.amount : currentPlayer.basePrice;
    const minBid = currentBid ? getValidNextBid(currentBid.amount) : currentPlayer.basePrice;

    if (amount < minBid) {
      setSnackbar({
        open: true,
        message: `Minimum bid is ₹${minBid} lakhs`,
        severity: 'error'
      });
      return;
    }

    if (userSquad && amount > userSquad.budgetRemaining) {
      setSnackbar({
        open: true,
        message: 'Insufficient budget',
        severity: 'error'
      });
      return;
    }

    socketService.placeBid(auctionId, currentPlayer.id, amount);
    setShowBidDialog(false);
    setBidAmount('');
  };

  const getMinBidIncrement = (currentAmount: number) => {
    if (currentAmount < 100) return 10;      // Till 1 CR - 10 lakhs increment
    else if (currentAmount < 1000) return 20; // 1 CR to 10 CR - 20 lakhs increment
    else return 50;                          // After 10 CR - 50 lakhs increment
  };

  const getValidNextBid = (currentAmount: number): number => {
    const increment = getMinBidIncrement(currentAmount);
    let nextBid = currentAmount + increment;

    // Align to valid bid values for the tier
    if (nextBid < 100) {
      // Round to nearest 10 lakhs
      nextBid = Math.ceil(nextBid / 10) * 10;
    } else if (nextBid < 1000) {
      // Round to nearest 20 lakhs, but ensure it's at least 100
      nextBid = Math.max(100, Math.ceil(nextBid / 20) * 20);
    } else {
      // Round to nearest 50 lakhs, but ensure it's at least 1000
      nextBid = Math.max(1000, Math.ceil(nextBid / 50) * 50);
    }

    return nextBid;
  };

  const isValidBidAmount = (amount: number): boolean => {
    // Check if the bid amount follows IPL rules
    if (amount < 100) {
      // Must be multiple of 10 lakhs
      return amount % 10 === 0;
    } else if (amount < 1000) {
      // Must be multiple of 20 lakhs and >= 100
      return amount >= 100 && amount % 20 === 0;
    } else {
      // Must be multiple of 50 lakhs and >= 1000
      return amount >= 1000 && amount % 50 === 0;
    }
  };

  const getQuickBidAmount = () => {
    if (!currentPlayer) return 0;

    // If there's no current bid, return base price (first bid)
    if (!currentBid) {
      return currentPlayer.basePrice;
    }

    // If there is a current bid, return the next valid bid amount
    return getValidNextBid(currentBid.amount);
  };

  const handleQuickBid = () => {
    const amount = getQuickBidAmount();
    socketService.placeBid(auctionId, currentPlayer!.id, amount);
  };

  const handleSellNow = (playerId: string) => {
    if (!currentPlayer) return;

    socketService.sellPlayerNow(auctionId, playerId);
    setSnackbar({
      open: true,
      message: 'Selling player immediately...',
      severity: 'success'
    });
  };

  const getRoleColor = (role: PlayerRole) => {
    switch (role) {
      case PlayerRole.WK: return 'primary';
      case PlayerRole.BAT: return 'success';
      case PlayerRole.AR: return 'warning';
      case PlayerRole.BOWL: return 'error';
      default: return 'default';
    }
  };

  const getRoleDisplayName = (role: PlayerRole) => {
    switch (role) {
      case PlayerRole.WK: return 'WICKETKEEPER';
      case PlayerRole.BAT: return 'BATTER';
      case PlayerRole.AR: return 'ALL-ROUNDER';
      case PlayerRole.BOWL: return 'BOWLER';
      default: return 'UNKNOWN';
    }
  };

  const getRoleIcon = (role: PlayerRole) => {
    switch (role) {
      case PlayerRole.WK: return '🥅';
      case PlayerRole.BAT: return '🏏';
      case PlayerRole.AR: return '⚡';
      case PlayerRole.BOWL: return '⚾';
      default: return '👤';
    }
  };

  const formatBudget = (amount: number) => {
    return `₹${(amount / 100).toFixed(1)}Cr`;
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ ml: 2 }}>
          Connecting to auction...
        </Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Grid container spacing={3}>
        {/* Auction Header */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3, mb: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h4" gutterBottom>
                  {currentAuction?.name || 'IPL 2026 Auction'}
                </Typography>
                <Typography variant="subtitle1" color="textSecondary">
                  Connected Users: {connectedUsers.join(', ')}
                </Typography>
              </Box>
              <Box display="flex" gap={2}>
                {currentAuction?.status === 'setup' && (
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrow />}
                    onClick={() => socketService.startAuction(auctionId)}
                  >
                    Start Auction
                  </Button>
                )}
                {currentAuction?.status === 'active' && (
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<Pause />}
                    onClick={() => socketService.pauseAuction(auctionId)}
                  >
                    Pause
                  </Button>
                )}
                {currentAuction?.status === 'paused' && (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<PlayArrow />}
                    onClick={() => socketService.resumeAuction(auctionId)}
                  >
                    Resume
                  </Button>
                )}
                {/* Undo Controls - only show during active auction */}
                {(currentAuction?.status === 'active' || currentAuction?.status === 'paused') && (
                  <>
                    <Button
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={<Undo />}
                      onClick={() => socketService.undoLastSale(auctionId)}
                      sx={{ minWidth: 'auto' }}
                    >
                      Undo Sale
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={<SkipPrevious />}
                      onClick={() => socketService.undoPreviousPlayer(auctionId)}
                      sx={{ minWidth: 'auto' }}
                    >
                      Previous Player
                    </Button>
                    {currentPlayer && (
                      <Button
                        variant="outlined"
                        color="secondary"
                        size="small"
                        startIcon={<Undo />}
                        onClick={() => socketService.undoLastBid(auctionId, currentPlayer.id)}
                        sx={{ minWidth: 'auto' }}
                      >
                        Undo Bid
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant="outlined"
                  onClick={() => setShowSquadDetails(true)}
                  disabled={squads.length === 0}
                >
                  View All Squads
                </Button>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Current Player and Bidding */}
        <Grid item xs={12} md={8}>
          {currentPlayer ? (
            <StyledCard>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h5" component="h2">
                    Current Player
                  </Typography>
                  <Chip
                    label={`${getRoleIcon(currentPlayer.role)} ${currentPlayer.role}`}
                    color={getRoleColor(currentPlayer.role)}
                    size="small"
                  />
                </Box>

                <Box display="flex" gap={3} alignItems="center" mb={3}>
                  <Box flex={1}>
                    <Typography variant="h4" gutterBottom>
                      {currentPlayer.name}
                    </Typography>

                    {/* Enhanced player details */}
                    <Box display="flex" gap={2} alignItems="center" mb={1}>
                      <Chip
                        label={(currentPlayer as any).country || 'India'}
                        color={(currentPlayer as any).isOverseas ? 'secondary' : 'primary'}
                        size="small"
                      />
                      <Chip
                        label={(currentPlayer as any).isOverseas ? 'OVERSEAS' : 'INDIAN'}
                        color={(currentPlayer as any).isOverseas ? 'warning' : 'success'}
                        size="small"
                      />
                      <Chip
                        label={getRoleDisplayName(currentPlayer.role)}
                        variant="outlined"
                        size="small"
                      />
                      {(currentPlayer as any).setNumber !== undefined && (
                        <Chip
                          label={`Set ${(currentPlayer as any).setNumber}`}
                          color="default"
                          size="small"
                        />
                      )}
                    </Box>

                    {currentPlayer.team && (
                      <Typography variant="h6" color="textSecondary">
                        Previous Team: {currentPlayer.team}
                      </Typography>
                    )}
                    <Typography variant="body1" sx={{ mt: 1 }}>
                      Base Price: {formatBudget(currentPlayer.basePrice)}
                    </Typography>
                  </Box>
                </Box>

                {isAuctionActive && (
                  <>
                    <TimerDisplay>
                      <Timer sx={{ mr: 1 }} />
                      {timeRemaining}s
                    </TimerDisplay>

                    <Box mb={2}>
                      {currentBid ? (
                        <Alert severity="info">
                          Highest Bid: {formatBudget(currentBid.amount)} by {currentBid.userName}
                        </Alert>
                      ) : (
                        <Alert severity="warning">
                          No bids yet. Base price: {formatBudget(currentPlayer.basePrice)}
                        </Alert>
                      )}
                    </Box>

                    {canBid && (
                      <BidControls>
                        <Button
                          variant="contained"
                          color="primary"
                          size="large"
                          startIcon={<Gavel />}
                          onClick={handleQuickBid}
                          disabled={!isConnected}
                        >
                          Quick Bid: {formatBudget(getQuickBidAmount())}
                        </Button>
                        <Button
                          variant="outlined"
                          color="primary"
                          onClick={() => setShowBidDialog(true)}
                          disabled={!isConnected}
                        >
                          Custom Bid
                        </Button>
                      </BidControls>
                    )}

                    {/* Sell Now Button for Auction Host */}
                    {isConnected && currentPlayer && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          onClick={() => handleSellNow(currentPlayer.id)}
                          disabled={!isConnected}
                          sx={{
                            backgroundColor: '#4caf50',
                            '&:hover': { backgroundColor: '#45a049' }
                          }}
                        >
                          🔨 Sell Now
                        </Button>
                        <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                          Host can sell player immediately
                        </Typography>
                      </Box>
                    )}
                  </>
                )}
              </CardContent>
            </StyledCard>
          ) : (
            <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h5" color="textSecondary">
                {currentAuction?.status === 'completed'
                  ? 'Auction Completed! 🎉'
                  : 'Waiting for auction to start...'}
              </Typography>
            </Paper>
          )}
        </Grid>

        {/* User Squad */}
        <Grid item xs={12} md={4}>
          <StyledCard>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Your Squad
              </Typography>
              {userSquad && (
                <>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body1">
                      Players: {userSquad.playerCount}/12
                    </Typography>
                    <Typography variant="body1" color="primary">
                      Budget: {formatBudget(userSquad.budgetRemaining)}
                    </Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2" color="text.secondary">
                      Overseas: {(userSquad as any).overseasCount || 0}/4
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Spent: {formatBudget(12000 - userSquad.budgetRemaining)}
                    </Typography>
                  </Box>

                  <Box mb={2}>
                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <Chip
                          label={`🥅 WK: ${userSquad.roleCounts[PlayerRole.WK]}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <Chip
                          label={`🏏 BAT: ${userSquad.roleCounts[PlayerRole.BAT]}`}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <Chip
                          label={`⚡ AR: ${userSquad.roleCounts[PlayerRole.AR]}`}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <Chip
                          label={`⚾ BOWL: ${userSquad.roleCounts[PlayerRole.BOWL]}`}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </Grid>
                    </Grid>
                  </Box>

                  <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                    {userSquad.players.length > 0 ? (
                      userSquad.players.map((player, index) => (
                        <Box
                          key={player.id}
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          p={1}
                          borderBottom="1px solid #eee"
                        >
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {player.name}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {getRoleIcon(player.role)} {player.role} {player.team && `- ${player.team}`}
                            </Typography>
                          </Box>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" color="textSecondary" textAlign="center">
                        No players yet
                      </Typography>
                    )}
                  </Box>
                </>
              )}
            </CardContent>
          </StyledCard>
        </Grid>

        {/* All Squads */}
        <Grid item xs={12}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              All Squads
            </Typography>
            <Grid container spacing={2}>
              {squads.map((squad) => (
                <Grid item xs={12} sm={6} md={3} key={squad.id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {squad.userName}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Players: {squad.playerCount}/12
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Overseas: {(squad as any).overseasCount || 0}/4
                      </Typography>
                      <Typography variant="body2" color="primary">
                        Budget: {formatBudget(squad.budgetRemaining)}
                      </Typography>
                      <Box mt={1}>
                        <Typography variant="caption" display="block">
                          WK:{squad.roleCounts[PlayerRole.WK]} | BAT:{squad.roleCounts[PlayerRole.BAT]} |{' '}
                          AR:{squad.roleCounts[PlayerRole.AR]} | BOWL:{squad.roleCounts[PlayerRole.BOWL]}
                        </Typography>
                      </Box>
                      {squad.players && squad.players.length > 0 && (
                        <Box mt={1}>
                          <Typography variant="caption" color="textSecondary" display="block">
                            Players:
                          </Typography>
                          {squad.players.slice(0, 3).map((player, index) => (
                            <Typography key={player.id} variant="caption" display="block" sx={{ fontSize: '0.7rem' }}>
                              {getRoleIcon(player.role)} {player.name}
                              {player.purchasePrice && ` (₹${(player.purchasePrice / 100).toFixed(1)}Cr)`}
                            </Typography>
                          ))}
                          {squad.players.length > 3 && (
                            <Typography variant="caption" color="primary" sx={{ cursor: 'pointer' }}
                              onClick={() => setShowSquadDetails(true)}>
                              +{squad.players.length - 3} more...
                            </Typography>
                          )}
                        </Box>
                      )}
                      <Box mt={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setShowSquadDetails(true)}
                          fullWidth
                        >
                          View Details
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Custom Bid Dialog */}
      <Dialog open={showBidDialog} onClose={() => setShowBidDialog(false)}>
        <DialogTitle>Place Custom Bid</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Bid Amount (in lakhs)"
            type="number"
            fullWidth
            variant="outlined"
            value={bidAmount}
            inputProps={{
              min: getQuickBidAmount(),
              step: currentBid ? getMinBidIncrement(currentBid.amount) : 10 // Use proper increment based on current amount
            }}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              const minBid = getQuickBidAmount();

              if (value >= minBid || e.target.value === '') {
                setBidAmount(e.target.value);
              }
            }}
            error={bidAmount !== '' && (parseFloat(bidAmount) < getQuickBidAmount() || !isValidBidAmount(parseFloat(bidAmount)))}
            helperText={(() => {
              if (bidAmount === '') return `Minimum: ₹${getQuickBidAmount()} lakhs (next increment)`;
              const amount = parseFloat(bidAmount);
              if (amount < getQuickBidAmount()) {
                return `Must be at least ₹${getQuickBidAmount()} lakhs`;
              }
              if (!isValidBidAmount(amount)) {
                const increment = amount < 100 ? 10 : amount < 1000 ? 20 : 50;
                return `Invalid amount. Must be multiple of ${increment} lakhs`;
              }
              return `Valid bid amount`;
            })()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBidDialog(false)}>Cancel</Button>
          <Button
            onClick={handlePlaceBid}
            variant="contained"
            disabled={bidAmount === '' || parseFloat(bidAmount) < getQuickBidAmount() || !isValidBidAmount(parseFloat(bidAmount))}
          >
            Place Bid
          </Button>
        </DialogActions>
      </Dialog>

      {/* Squad Details Dialog */}
      <Dialog
        open={showSquadDetails}
        onClose={() => setShowSquadDetails(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">Squad Details</Typography>
            <Button onClick={() => setShowSquadDetails(false)}>✕</Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {squads.map((squad) => (
              <Grid item xs={12} md={6} key={squad.id}>
                <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" color="primary" gutterBottom>
                    {squad.userName}
                  </Typography>

                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2">
                      Players: {squad.playerCount}/12
                    </Typography>
                    <Typography variant="body2" color="primary">
                      Budget Left: {formatBudget(squad.budgetRemaining)}
                    </Typography>
                  </Box>

                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2">
                      Overseas: {(squad as any).overseasCount || 0}/4
                    </Typography>
                    <Typography variant="body2">
                      Used: {formatBudget(12000 - squad.budgetRemaining)}
                    </Typography>
                  </Box>

                  <Box mb={2}>
                    <Typography variant="caption">
                      WK:{squad.roleCounts[PlayerRole.WK]} | BAT:{squad.roleCounts[PlayerRole.BAT]} | AR:{squad.roleCounts[PlayerRole.AR]} | BOWL:{squad.roleCounts[PlayerRole.BOWL]}
                    </Typography>
                  </Box>

                  {squad.players && squad.players.length > 0 ? (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Squad Players:
                      </Typography>
                      {squad.players.map((player, index) => {
                        console.log(`Rendering player ${player.name}:`, { purchasePrice: player.purchasePrice });
                        return (
                          <Box key={player.id} display="flex" justifyContent="space-between" alignItems="center"
                               sx={{ py: 0.5, borderBottom: index < squad.players.length - 1 ? '1px solid #eee' : 'none' }}>
                            <Box display="flex" alignItems="center">
                              <Typography variant="body2" sx={{ minWidth: '30px' }}>
                                {getRoleIcon(player.role)}
                              </Typography>
                              <Typography variant="body2">
                                {player.name}
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="primary">
                              {player.purchasePrice ? `₹${(player.purchasePrice / 100).toFixed(1)}Cr` : 'N/A'}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                      No players purchased yet
                    </Typography>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Error display */}
      {error && (
        <Snackbar open={!!error} autoHideDuration={6000} onClose={() => dispatch(setError(null))}>
          <Alert severity="error">{error}</Alert>
        </Snackbar>
      )}
    </Container>
  );
};

export default AuctionRoom;