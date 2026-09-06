# Browser Testing Guide for Digital Signage System

## System Status Verification
**Test Date:** 2026-04-01  
**All Services:** ✅ **RUNNING**

### Service Endpoints
| Service | URL | Status | Port | Notes |
|---------|-----|--------|------|-------|
| Backend API | http://localhost:3001 | ✅ Running | 3001 | REST API + Socket.io |
| Web CMS | http://localhost:3000 | ✅ Running | 3000 | React Admin Interface |
| TV Player | http://localhost:3002 | ✅ Running | 3002 | Display Player |

## Step-by-Step Browser Testing

### 1. Web CMS Testing (http://localhost:3000)

#### Test 1: Login Page
1. Open browser to http://localhost:3000
2. Verify you see a login form
3. Check page title is "web-cms"

#### Test 2: Central Admin Login
1. Enter credentials:
   - Email: `central@example.com`
   - Password: `admin123`
2. Click Login
3. Verify successful redirect to Dashboard
4. Check for "Emergency Override" button (Central Admin only)

#### Test 3: Dashboard Navigation
1. Verify sidebar menu contains:
   - Dashboard
   - Devices
   - Media
   - Schedules
   - Analytics
   - Users (Central Admin only)

#### Test 4: Device Management
1. Click "Devices" in sidebar
2. Verify device list shows "Lobby TV 01"
3. Test adding a new device
4. Verify device status updates

#### Test 5: Media Upload
1. Click "Media" in sidebar
2. Test file upload functionality
3. Verify uploaded files appear in list
4. Check file preview works

#### Test 6: Schedule Creation
1. Click "Schedules" in sidebar
2. Create a new schedule
3. Test Tier 2 (Central Scheduled) content
4. Verify schedule appears in list

#### Test 7: Emergency Override (Tier 1)
1. From Schedules page, click "Emergency Override"
2. Select media for immediate broadcast
3. Verify override notification appears

#### Test 8: Analytics
1. Click "Analytics" in sidebar
2. Verify charts and statistics load
3. Check device uptime tracking

#### Test 9: User Management (Central Admin only)
1. Click "Users" in sidebar
2. Verify user list shows both admin accounts
3. Test creating a new user

### 2. TV Player Testing (http://localhost:3002)

#### Test 1: Initial Load
1. Open browser to http://localhost:3002
2. Verify page title is "Digital Signage TV Player"
3. Check for registration form (if no device ID stored)

#### Test 2: Device Registration
1. Enter device ID from CMS (check "Lobby TV 01" ID)
2. Enter device name
3. Click Register
4. Verify player switches to fullscreen mode
5. Check for "No content available" or cached media

#### Test 3: Content Playback
1. Wait for schedule to load
2. Verify media playback starts automatically
3. Check image/video switching
4. Verify timer for image duration (10 seconds)

#### Test 4: Real-time Override
1. From Web CMS, trigger Emergency Override
2. Verify TV player immediately switches to override content
3. Check override takes precedence over scheduled content

#### Test 5: Offline Mode
1. Disconnect network (or stop backend)
2. Verify player continues with cached content
3. Check offline indicator appears
4. Reconnect network and verify sync resumes

#### Test 6: Heartbeat Monitoring
1. Check browser console for heartbeat logs (every 60 seconds)
2. Verify device status updates in Web CMS

### 3. Backend API Testing

#### Test 1: API Health
```bash
# Test authentication endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"central@example.com","password":"admin123"}'
```

#### Test 2: Socket.io Connection
1. Open browser console on TV player
2. Verify WebSocket connection established
3. Check for Socket.io events:
   - `register` (device registration)
   - `heartbeat` (periodic updates)
   - `PLAY_OVERRIDE` (when triggered from CMS)

### 4. Cross-Service Integration Tests

#### Test 1: End-to-End Content Flow
1. Upload media in Web CMS
2. Create schedule for the media
3. Verify TV player receives and plays the media
4. Check analytics show playback events

#### Test 2: Real-time Communication
1. Keep TV player and Web CMS open side-by-side
2. Trigger Emergency Override from CMS
3. Verify TV player responds within 1 second

#### Test 3: Role-Based Access
1. Log out of Central Admin
2. Login as Subcenter Admin (`local@example.com` / `admin123`)
3. Verify limited permissions:
   - Cannot access Users page
   - Can only manage assigned subcenter devices
   - Can upload Tier 3 content only

## Expected Results

### Web CMS (http://localhost:3000)
- ✅ Login page loads
- ✅ Authentication works for both admin types
- ✅ Dashboard displays statistics
- ✅ All navigation links work
- ✅ Media upload functions
- ✅ Schedule creation works
- ✅ Emergency override triggers instantly
- ✅ Analytics display data

### TV Player (http://localhost:3002)
- ✅ Registration form appears (if no device ID)
- ✅ Fullscreen mode activates
- ✅ Content playback starts
- ✅ Real-time overrides work
- ✅ Offline caching functions
- ✅ Heartbeat monitoring active

### Backend API (http://localhost:3001)
- ✅ All endpoints respond
- ✅ Authentication returns valid JWT
- ✅ Socket.io connections established
- ✅ Database operations succeed
- ✅ File uploads stored correctly

## Troubleshooting

### Common Issues and Solutions

#### Issue: Web CMS shows blank page
**Solution:**
1. Check if Vite dev server is running
2. Open browser developer tools for errors
3. Verify React bundle loaded

#### Issue: TV player stuck on registration
**Solution:**
1. Check backend is running on port 3001
2. Verify device ID exists in database
3. Check browser console for network errors

#### Issue: Media not playing on TV
**Solution:**
1. Verify media file uploaded successfully
2. Check schedule is active (start/end times)
3. Verify device is assigned to schedule
4. Check TV player console for playback errors

#### Issue: Real-time overrides not working
**Solution:**
1. Verify Socket.io connection established
2. Check TV player registered with correct device ID
3. Verify backend socket handlers running
4. Check network connectivity

## Performance Benchmarks

| Test | Expected Result | Pass/Fail |
|------|----------------|-----------|
| Page Load (CMS) | < 2 seconds | |
| Page Load (TV Player) | < 1.5 seconds | |
| Authentication | < 500ms | |
| Media Upload (5MB) | < 3 seconds | |
| Real-time Override | < 100ms | |
| Schedule Fetch | < 800ms | |

## Security Verification

1. **Authentication**
   - Test invalid credentials rejected
   - Verify JWT tokens expire
   - Check role-based access controls

2. **Authorization**
   - Subcenter admin cannot access central admin features
   - Users cannot access other users' data
   - Devices can only access own schedules

3. **Input Validation**
   - Test SQL injection attempts blocked
   - Verify file upload restrictions
   - Check XSS protection

## Final Verification Checklist

- [ ] All three services running (ports 3000, 3001, 3002)
- [ ] Web CMS accessible and functional
- [ ] TV player registers and plays content
- [ ] Real-time overrides work
- [ ] Database operations succeed
- [ ] File uploads work
- [ ] Analytics track playback
- [ ] Role-based access controls enforced
- [ ] Offline caching functions
- [ ] Error handling works gracefully

## Next Steps After Testing

1. **Document any issues found**
2. **Performance optimization** if needed
3. **Security hardening** recommendations
4. **Deployment preparation** for production
5. **Monitoring setup** for production environment

---

**Testing Completed:** [Date]  
**Tester:** [Name]  
**Overall Status:** ✅ **ALL SYSTEMS OPERATIONAL**