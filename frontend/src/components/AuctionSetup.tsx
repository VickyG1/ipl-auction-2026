import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import {
  Sports as SportsIcon,
  Group as GroupIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { apiService } from '../services/apiService';

const AuctionSetup: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const joinAuctionId = searchParams.get('join');

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Join auction state
  const [userName, setUserName] = useState('');

  // Form state
  const [auctionName, setAuctionName] = useState('');
  const [playersImported, setPlayersImported] = useState(false);
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);

  const steps = [
    {
      label: 'Import Player Data',
      description: 'Load IPL 2026 player database with base prices and statistics'
    },
    {
      label: 'Setup Auction',
      description: 'Configure auction name and basic settings'
    },
    {
      label: 'Create Auction',
      description: 'Create the auction and get a shareable link'
    }
  ];

  const handleImportPlayers = async () => {
    setLoading(true);
    setError(null);

    try {
      const count = await apiService.importPlayers();
      setPlayersImported(true);
      setActiveStep(1);
      console.log(`Successfully imported ${count} players`);
    } catch (err) {
      setError('Failed to import player data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAuction = async () => {
    setLoading(true);
    setError(null);

    try {
      if (auctionName.length < 3) {
        setError('Auction name must be at least 3 characters');
        return;
      }

      const auctionId = await apiService.createAuction(auctionName, []);
      setCreatedAuctionId(auctionId);
      setActiveStep(2);
    } catch (err) {
      setError('Failed to create auction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinExistingAuction = async () => {
    if (joinAuctionId && userName.trim()) {
      setLoading(true);
      setError(null);

      try {
        // Call API to join the auction
        await apiService.joinAuction(joinAuctionId, userName.trim());

        // Navigate to the auction room
        navigate(`/auction/${joinAuctionId}?user=${encodeURIComponent(userName.trim())}`);
      } catch (err) {
        console.error('Join auction error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to join auction. Please try again.';
        setError(`Failed to join auction: ${errorMsg}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleJoinAuction = () => {
    if (createdAuctionId) {
      // Creator can join their own auction by entering their name
      navigate(`/?join=${createdAuctionId}`);
    }
  };

  const isStepComplete = (step: number): boolean => {
    switch (step) {
      case 0: return playersImported;
      case 1: return auctionName.length >= 3;
      case 2: return !!createdAuctionId;
      default: return false;
    }
  };

  const canProceedToNext = (step: number): boolean => {
    return isStepComplete(step);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box display="flex" alignItems="center" mb={4}>
          <SportsIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
          <Typography variant="h3" component="h1">
            IPL 2026 Auction Setup
          </Typography>
        </Box>

        <Typography variant="h6" color="textSecondary" paragraph>
          Set up your IPL auction in a few simple steps. Import player data, add participants, and start bidding!
        </Typography>

        {/* Join Existing Auction Section */}
        {joinAuctionId && (
          <Card sx={{ mb: 4, bgcolor: 'primary.50', border: '2px solid', borderColor: 'primary.main' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <GroupIcon sx={{ mr: 2, color: 'primary.main' }} />
                <Typography variant="h5" color="primary.main">
                  Join Auction
                </Typography>
              </Box>

              <Typography variant="body1" paragraph>
                You've been invited to join an auction! Enter your name to participate.
              </Typography>

              <Typography variant="body2" color="textSecondary" paragraph>
                Auction ID: <code>{joinAuctionId}</code>
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <Box display="flex" gap={2} alignItems="flex-end">
                <TextField
                  label="Your Name"
                  variant="outlined"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name to join"
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinExistingAuction()}
                  sx={{ flexGrow: 1 }}
                  error={userName.trim().length > 0 && userName.trim().length < 2}
                  helperText={userName.trim().length > 0 && userName.trim().length < 2 ? "Name must be at least 2 characters" : ""}
                />
                <Button
                  variant="contained"
                  onClick={handleJoinExistingAuction}
                  disabled={userName.trim().length < 2 || loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  size="large"
                >
                  Join Auction
                </Button>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography variant="body2" color="textSecondary">
                Want to create your own auction instead?
                <Button
                  variant="text"
                  onClick={() => navigate('/')}
                  sx={{ ml: 1, textTransform: 'none' }}
                >
                  Start New Auction
                </Button>
              </Typography>
            </CardContent>
          </Card>
        )}

        {error && !joinAuctionId && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Regular Auction Setup - Hide when joining existing auction */}
        {!joinAuctionId && (
          <Stepper activeStep={activeStep} orientation="vertical">
            {/* Step 0: Import Players */}
            <Step>
              <StepLabel>
                <Typography variant="h6">{steps[0].label}</Typography>
              </StepLabel>
              <StepContent>
                <Typography paragraph>{steps[0].description}</Typography>

                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="body2" color="textSecondary" paragraph>
                      This will automatically scrape and import IPL 2026 player data including:
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemText primary="• Player names, teams, and roles (WK/BAT/AR/BOWL)" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="• Base prices and auction categories" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="• Player statistics and fantasy points" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="• Over 200+ players available for auction" />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>

                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleImportPlayers}
                    disabled={loading || playersImported}
                    startIcon={playersImported ? null : loading ? <CircularProgress size={20} /> : <SportsIcon />}
                    size="large"
                  >
                    {loading ? 'Importing Players...' : playersImported ? 'Players Imported ✓' : 'Import Player Data'}
                  </Button>
                </Box>

                {playersImported && (
                  <Button
                    variant="text"
                    onClick={() => setActiveStep(1)}
                    sx={{ ml: 1 }}
                  >
                    Continue
                  </Button>
                )}
              </StepContent>
            </Step>

            {/* Step 1: Auction Name */}
            <Step>
              <StepLabel>
                <Typography variant="h6">{steps[1].label}</Typography>
              </StepLabel>
              <StepContent>
                <Typography paragraph>{steps[1].description}</Typography>

                <TextField
                  label="Auction Name"
                  variant="outlined"
                  fullWidth
                  value={auctionName}
                  onChange={(e) => setAuctionName(e.target.value)}
                  placeholder="e.g., Friends IPL Auction 2026"
                  helperText="Choose a memorable name for your auction"
                  sx={{ mb: 3 }}
                />

                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      Auction Settings (Default)
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemText primary="Max Players per Squad: 12" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Budget per Squad: ₹120 Crores" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Minimum Bid Increment: ₹5 Lakhs" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Bid Timer: 30 seconds" />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Required: 1 WK, 1 AR, 3+ Bowlers" />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>

                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    disabled={!canProceedToNext(1)}
                    onClick={() => setActiveStep(2)}
                    sx={{ mr: 1 }}
                  >
                    Continue
                  </Button>
                  <Button onClick={() => setActiveStep(0)}>
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* Step 2: Create Auction */}
            <Step>
              <StepLabel>
                <Typography variant="h6">{steps[2].label}</Typography>
              </StepLabel>
              <StepContent>
                <Typography paragraph>{steps[2].description}</Typography>

                {!createdAuctionId ? (
                  <Card variant="outlined" sx={{ mb: 3 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Ready to Create Auction
                      </Typography>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="body2" gutterBottom>
                        <strong>Auction Name:</strong> {auctionName}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                        Click "Create Auction" to set up the auction room. You'll get a shareable link that anyone can use to join and participate in the bidding.
                      </Typography>
                    </CardContent>
                  </Card>
                ) : (
                  <Card variant="outlined" sx={{ mb: 3, bgcolor: 'success.50' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom color="success.main">
                        Auction Created Successfully! 🎉
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        Auction ID: <code>{createdAuctionId}</code>
                      </Typography>

                      <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Shareable Links:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1, fontFamily: 'monospace' }}>
                          📱 Mobile: http://localhost:3000/auction/{createdAuctionId}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          🌐 Network: http://10.171.116.70:3000/auction/{createdAuctionId}
                        </Typography>
                      </Box>

                      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                        Share these URLs with participants. When they click the link, they'll enter their name and join the auction automatically!
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                <Box sx={{ mt: 2 }}>
                  {!createdAuctionId ? (
                    <Button
                      variant="contained"
                      onClick={handleCreateAuction}
                      disabled={loading}
                      startIcon={loading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                      size="large"
                    >
                      {loading ? 'Creating Auction...' : 'Create Auction'}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      color="success"
                      onClick={handleJoinAuction}
                      startIcon={<PlayArrowIcon />}
                      size="large"
                    >
                      Join Your Auction
                    </Button>
                  )}
                  <Button onClick={() => setActiveStep(1)} sx={{ ml: 1 }}>
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          </Stepper>
        )}

      </Paper>
    </Container>
  );
};

export default AuctionSetup;