import { configureStore } from '@reduxjs/toolkit';
import auctionReducer from './auctionSlice';

export const store = configureStore({
  reducer: {
    auction: auctionReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['auction/setAuctionState', 'auction/setCurrentPlayer', 'auction/setBid'],
        // Ignore these field paths in all actions
        ignoredActionsPaths: ['payload.timestamp', 'payload.createdAt', 'payload.updatedAt', 'payload.scrapedAt']
      }
    })
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;