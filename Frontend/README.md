# JanSetu Field Admin Frontend

This is the Expo-based mobile client for field admins and technicians. It is the operational app used to handle assigned complaints on site.

## Key Screens

- Dashboard for assignment summaries and work metrics
- Reports list with filters, search, sort, and refresh
- Map view for route planning and location awareness
- Report detail view with contact, photos, and work actions
- Login screen for OTP-based access
- Profile screen for account details and logout

## Core Features

- OTP authentication
- Assignment tracking
- Priority and status badges
- Map markers for report locations
- Navigation to the incident location
- Start, update, and complete work flows
- Media upload for field evidence
- Local session persistence with AsyncStorage

## Tech Stack

- Expo
- React Native
- TypeScript
- Expo Router
- Axios
- React Native Maps
- Expo Camera
- Expo Image Picker
- Expo Location

## Scripts

```bash
npm install
npx expo start
npm run android
npm run ios
npm run web
npm run lint
```

## Folder Layout

- `app/` - routed screens
- `services/` - API and domain service wrappers
- `types/` - shared TypeScript definitions
- `constants/` - app constants
- `utils/` - storage and helper utilities
- `assets/` - static images and icons
