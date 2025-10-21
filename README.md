# 📱 JanSetuAdminApp - Field Admin Mobile Application

## 🎯 Project Overview

**JanSetuAdminApp** is a mobile application for field administrators/technicians who travel to locations to fix civic issues reported by citizens through the JanSetu User app.

### 🔄 Ecosystem Relationship

```
┌─────────────────────┐
│  JanSetu User App   │  Citizens report issues
│  (Mobile - Expo)    │  Upload photos, location
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  JanSetu Admin      │  Office admins manage reports
│  (Web Dashboard)    │  Assign to field admins
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ JanSetuAdminApp     │  Field admins go on-site
│ (Mobile - Expo)     │  Fix issues, update status
└─────────────────────┘
```

## ✨ Key Features Implemented

### 🔐 1. Authentication
- OTP-based email login
- Secure session management
- Auto-redirect based on auth status

### 📊 2. Dashboard
- Welcome screen with admin details
- Statistics cards (Total, Pending, In Progress, Completed)
- Performance metrics (weekly/monthly completions, avg time)
- Today's reports quick view
- Quick action buttons

### 📋 3. Reports List
- View all assigned reports
- Advanced filtering (Priority, Status, Category)
- Search functionality
- Sort by priority and date
- Pull-to-refresh
- Priority/status badges with color coding

### 🗺️ 4. Map View
- Interactive map with all assigned reports
- Color-coded markers by priority
- Click marker to view report details
- Current location tracking
- Map legend
- Navigate to report from map

### 📍 5. Report Details
- Complete report information
- User contact details
- Photos/media gallery
- **Navigate to Location** - Opens Google Maps with directions
- **Call User** - Direct phone call
- **Start Work** button - Marks as "In Progress"
- **Mark Complete** button - Upload photos and mark resolved
- Before/after photo comparison
- Work duration tracking

### 👤 6. Profile
- Admin information display
- Department and role badges
- Account statistics
- Settings options
- Logout functionality

## 🛠️ Technology Stack

### Frontend
- **React Native** with **Expo**
- **TypeScript** for type safety
- **Expo Router** for navigation
- **React Native Maps** for mapping
- **Expo Camera** & **Image Picker** for photos
- **Expo Location** for GPS
- **AsyncStorage** for local data
- **Axios** for API calls

### Backend
- **Node.js** with **Express**
- **PostgreSQL** database
- **Cloudinary** for image storage
- **Multer** for file uploads
- RESTful API architecture

## 📁 Project Structure

```
JanSetuAdminApp/
├── Frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx       # Dashboard
│   │   │   ├── reports.tsx     # Reports List
│   │   │   ├── map.tsx         # Map View
│   │   │   ├── profile.tsx     # Profile
│   │   │   └── _layout.tsx     # Tab Navigation
│   │   ├── report/
│   │   │   └── [id].tsx        # Report Details
│   │   ├── index.tsx           # App Entry
│   │   └── login.tsx           # Login
│   ├── services/
│   │   ├── api.ts              # API Client
│   │   ├── auth.service.ts     # Auth APIs
│   │   └── report.service.ts   # Report APIs
│   ├── types/index.ts          # TypeScript Types
│   ├── constants/index.ts      # App Constants
│   ├── utils/storage.ts        # Local Storage
│   └── package.json
│
├── Backend/
│   ├── controllers/
│   │   └── fieldAdmin.controllers.js
│   ├── routes/
│   │   └── fieldAdmin.routes.js
│   ├── db/
│   │   └── migrations/
│   │       └── 001_field_admin_features.sql
│   ├── app.js
│   └── package.json
│
├── FEATURES.md                 # Detailed feature list
├── SETUP_GUIDE.md             # Setup instructions
└── README.md                  # This file
```

## 🚀 Quick Start

### Prerequisites
```bash
# Install Node.js 18+
# Install PostgreSQL
# Install Expo CLI
npm install -g expo-cli
```

### Backend Setup
```bash
cd Backend
npm install

# Configure .env file
DATABASE_URL=postgresql://user:pass@host:port/db
CLOUDINARY_CLOUD_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Run migrations
psql -U user -d db -f db/migrations/001_field_admin_features.sql

# Start server
npm run dev
```

### Frontend Setup
```bash
cd Frontend
npm install

# Configure .env
EXPO_PUBLIC_API_URL=http://192.168.1.100:4000/api/v1

# Start app
npx expo start
```

## 🎨 UI/UX Highlights

### Color Scheme
- **Primary Blue**: `#2563eb` - Main actions, headers
- **Success Green**: `#10b981` - Completed, positive actions
- **Warning Orange**: `#f59e0b` - Pending, medium priority
- **Danger Red**: `#ef4444` - Critical, high priority
- **Clean Grays**: Subtle backgrounds and text

### Priority Colors
- 🔴 **Critical**: `#dc2626`
- 🟠 **High**: `#ea580c`
- 🟡 **Medium**: `#f59e0b`
- 🟢 **Low**: `#10b981`

### Design Patterns
- Card-based layouts
- Bottom tab navigation
- Pull-to-refresh
- Loading states
- Empty states
- Error handling
- Responsive design

## 🔌 API Endpoints

### Field Admin Routes (`/api/v1/field-admin`)

#### Reports
- `GET /reports/:adminId` - Get assigned reports
- `GET /reports/:reportId/details` - Get report details
- `GET /reports/:adminId/today` - Today's reports

#### Actions
- `POST /reports/:reportId/start` - Start work
- `POST /reports/:reportId/update` - Add progress update
- `POST /reports/:reportId/complete` - Mark resolved

#### Dashboard
- `GET /dashboard/:adminId` - Get statistics

#### Media
- `POST /upload-work-photo` - Upload work photo

See `Backend/README_FIELD_ADMIN.md` for detailed API documentation.

## 💾 Database Schema

### New Tables

#### `work_logs`
Tracks all field admin activities
```sql
id, report_id, admin_id, action, notes, photos, 
location_lat, location_lng, created_at
```

#### `admin_locations`
Real-time location tracking
```sql
id, admin_id, latitude, longitude, updated_at
```

### Modified `reports` table
Added fields:
- `assigned_admin_id` - Assigned field admin
- `in_progress_at` - Work start time
- `in_progress_photos` - WIP photos
- `work_started_at` - On-site start
- `work_completed_at` - On-site completion
- `time_spent_minutes` - Duration
- `materials_used` - Resources (JSON)

## 🎯 Use Cases

### Typical Workflow

1. **Morning Briefing**
   - Field admin opens app
   - Views dashboard with today's assignments
   - Checks map for route planning

2. **Travel to Location**
   - Opens report details
   - Taps "Navigate" → Opens Google Maps
   - Drives to location

3. **On-Site Work**
   - Taps "Start Work" (marks as In Progress)
   - Takes work-in-progress photos
   - Performs repair/fix

4. **Completion**
   - Taps "Mark as Complete"
   - Uploads before/after photos
   - Adds resolution notes
   - Submits (marks as Resolved)

5. **Repeat**
   - Returns to dashboard
   - Picks next priority report

## 🌟 Advanced Features (Suggested)

### Already Implemented ✅
- Google Maps navigation
- Photo uploads
- Real-time status updates
- Dashboard analytics
- Filter and search
- Pull-to-refresh

### Future Enhancements 🔮
- **Push Notifications** - Real-time alerts for new assignments
- **Offline Mode** - Work without internet, sync later
- **Route Optimization** - Plan best route for multiple reports
- **Voice Notes** - Quick audio updates
- **Team Coordination** - See other team members on map
- **Time Tracking** - Auto-track time spent per report
- **Inventory Management** - Track materials used
- **Weather Integration** - Check weather before visiting
- **QR Code Scanning** - Scan location codes for verification
- **User Feedback** - Collect satisfaction ratings on-site
- **Signature Capture** - Digital signatures for verification

## 📱 Platform Support

- ✅ **Android** - Fully supported
- ✅ **iOS** - Fully supported
- ✅ **Web** - Basic support (limited mobile features)

## 🔒 Security

- OTP-based authentication
- Secure token storage
- HTTPS API calls
- Role-based access control
- Input validation
- SQL injection prevention

## 📊 Performance

- Lazy loading for images
- Pagination for large lists
- Optimized map rendering
- Cached data with AsyncStorage
- Compressed image uploads

## 🧪 Testing

### Test Data Setup
```sql
-- Create test admin
INSERT INTO admins (email, full_name, department, role, is_active)
VALUES ('field@test.com', 'Field Admin', 'Roads Dept', 'field_admin', true);

-- Assign reports
UPDATE reports SET assigned_admin_id = (SELECT id FROM admins WHERE email = 'field@test.com')
WHERE id IN (1, 2, 3);
```

### Test Credentials
- Email: `field@test.com`
- OTP: Check backend console logs

## 🐛 Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Check if backend is running
   - Verify API_URL in .env
   - Use your computer's IP, not localhost

2. **Location Permission Denied**
   - Grant location permission in device settings
   - Restart app after granting permission

3. **Maps Not Loading**
   - Enable Google Maps API in Google Cloud Console
   - Add API key in app.json (for production)

4. **Photos Not Uploading**
   - Check Cloudinary credentials
   - Verify camera/storage permissions

## 📚 Documentation

- `FEATURES.md` - Complete feature list with implementation details
- `SETUP_GUIDE.md` - Step-by-step setup instructions
- `Backend/README_FIELD_ADMIN.md` - API documentation

## 🤝 Contributing

This is a government civic management project. Contributions should focus on:
- Bug fixes
- Performance improvements
- Accessibility enhancements
- Documentation updates


## 👥 Team

- **Target Users**: Municipal field administrators, technicians, maintenance staff
- **Beneficiaries**: Citizens reporting civic issues
- **Stakeholders**: Municipal administration, department heads

## 🎉 Success Metrics

- **Response Time**: Time from report creation to admin reaching location
- **Resolution Rate**: % of reports resolved per day/week
- **User Satisfaction**: Feedback from citizens on resolution quality
- **Efficiency**: Average time spent per report
- **Coverage**: Number of reports handled per field admin

---

## 📞 Contact & Support

For technical support or feature requests, contact the JanSetu development team.


