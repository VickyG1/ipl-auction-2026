import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';

import { store } from './store';
import AuctionSetup from './components/AuctionSetup';
import AuctionRoom from './components/AuctionRoom';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    h1: {
      fontWeight: 600,
    },
    h2: {
      fontWeight: 600,
    },
    h3: {
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

// Wrapper component for auction room that extracts URL parameters
const AuctionRoomWrapper: React.FC = () => {
  const { auctionId } = useParams<{ auctionId: string }>();
  const [searchParams] = useSearchParams();
  const userName = searchParams.get('user');

  if (!auctionId) {
    return <Navigate to="/" replace />;
  }

  if (!userName) {
    return <Navigate to={`/?join=${auctionId}`} replace />;
  }

  return <AuctionRoom auctionId={auctionId} userName={userName} />;
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          }}
        >
          <Router>
            <Routes>
              <Route path="/" element={<AuctionSetup />} />
              <Route path="/auction/:auctionId" element={<AuctionRoomWrapper />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </Box>
      </ThemeProvider>
    </Provider>
  );
};

export default App;