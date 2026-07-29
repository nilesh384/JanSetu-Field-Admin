# JanSetu Field Admin App

This folder contains the field service experience for JanSetu. The mobile app is used by technicians and field admins who receive work assignments, travel to the location, update progress, and close reports after completion.

## Relationship To The Rest Of The System

- Citizens file complaints from the JanSetu User App
- Office staff assign and monitor work from the Admin Panel
- Field admins execute the work from this app
- All status changes and media uploads flow through the shared Backend API

## What The Field App Supports

- OTP-based login and session handling
- Dashboard with assignment summaries and daily work snapshots
- Assigned report list with search, filters, sorting, and refresh
- Map view for route planning and location context
- Report detail view with contact info, photo gallery, and navigation actions
- Start work, progress update, and completion flows
- Profile and account management

## Tech Stack

- Expo React Native
- TypeScript
- Expo Router
- Axios for API calls
- AsyncStorage for local state persistence
- React Native Maps for map rendering
- Expo Camera, Image Picker, and Location for field workflows

## Project Layout

- `Frontend/app/(tabs)/` - dashboard, reports, map, and profile screens
- `Frontend/app/report/[id].tsx` - report detail screen
- `Frontend/services/` - API client and domain services
- `Frontend/types/` - app-level types
- `Frontend/constants/` - shared constants
- `Frontend/utils/` - local storage helpers

## Main Features

- Prioritized report queues for field staff
- Map-based navigation to assigned work
- Before and after image capture support
- Call and location launch actions from the report detail screen
- Status transitions such as pending, in progress, and completed
- Performance and activity summaries in the dashboard

## Setup

```bash
cd Frontend
npm install
npx expo start
```

Set the API base URL in the app environment before running the mobile client.

## Related Docs

- `Frontend/README.md`
- `../Backend/README.md`
- `../README.md`
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


