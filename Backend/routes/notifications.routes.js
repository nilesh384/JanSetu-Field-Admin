// Backend API endpoints for FCM token management and notifications
// Add these to your existing backend routes

import admin from 'firebase-admin';
import express from 'express';
import { query } from '../db/utils.js';

const router = express.Router();

// Initialize Firebase Admin SDK (do this once in your main server file)
// const serviceAccount = require('./path/to/your/firebase-service-account-key.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// Store FCM token (for new installations)
router.post('/users/fcm-token', async (req, res) => {
  try {
    const { fcmToken, platform } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    // For anonymous token storage, we could create a temporary tokens table
    // For now, we'll just log it as tokens should be associated with users
    console.log('FCM Token received (anonymous):', fcmToken);

    res.json({
      success: true,
      message: 'FCM token received successfully'
    });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save FCM token'
    });
  }
});

// Update FCM token for a specific user
router.put('/users/update-fcm-token', async (req, res) => {
  try {
    const { userId, fcmToken, platform } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'User ID and FCM token are required'
      });
    }

    // Update the token in database
    const updateQuery = `
      UPDATE users 
      SET fcm_token = $2, fcm_platform = $3, fcm_updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    
    const result = await query(updateQuery, [userId, fcmToken, platform || 'unknown']);

    console.log(`FCM Token updated for user ${userId}`);

    res.json({
      success: true,
      message: 'FCM token updated successfully'
    });
  } catch (error) {
    console.error('Error updating FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update FCM token'
    });
  }
});

// Send notification when report is resolved
router.post('/notifications/report-resolved', async (req, res) => {
  try {
    const { userId, reportId, reportTitle } = req.body;

    if (!userId || !reportId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Report ID are required'
      });
    }

    // Get user's FCM token from database
    // const userFCMToken = await getUserFCMToken(userId);

    // For demo purposes, using a placeholder token
    const userFCMToken = 'user-fcm-token-from-database';

    if (!userFCMToken) {
      return res.status(404).json({
        success: false,
        message: 'User FCM token not found'
      });
    }

    // Prepare notification payload
    const notificationPayload = {
      token: userFCMToken,
      notification: {
        title: '🎉 Report Resolved!',
        body: `Your report "${reportTitle || 'Community Issue'}" has been resolved by our team.`,
      },
      data: {
        type: 'report_resolved',
        reportId: reportId.toString(),
        userId: userId.toString(),
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#FF6B35',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    };

    // Send notification using Firebase Admin SDK
    const response = await admin.messaging().send(notificationPayload);
    console.log('Notification sent successfully:', response);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

// Send bulk notifications (for multiple users)
router.post('/notifications/bulk', async (req, res) => {
  try {
    const { userIds, title, body, data } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    // Get FCM tokens for all users
    // const fcmTokens = await getFCMTokensForUsers(userIds);

    // For demo purposes, using placeholder tokens
    const fcmTokens = ['token1', 'token2', 'token3'];

    if (fcmTokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No FCM tokens found for the provided users'
      });
    }

    const message = {
      notification: {
        title: title || 'JanSetu Notification',
        body: body || 'You have a new update',
      },
      data: data || {},
      tokens: fcmTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('Bulk notification sent:', response);

    res.json({
      success: true,
      message: 'Bulk notification sent successfully',
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    console.error('Error sending bulk notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk notification',
      error: error.message
    });
  }
});

export default router;

// Database helper functions (you need to implement these based on your database)
/*
async function storeFCMToken(fcmToken, platform) {
  // Store token in your database
  // Implementation depends on your database (MySQL, MongoDB, etc.)
}

async function updateUserFCMToken(userId, fcmToken, platform) {
  // Update user's FCM token in database
  // Implementation depends on your database
}

async function getUserFCMToken(userId) {
  // Get user's FCM token from database
  // Return the token or null if not found
}

async function getFCMTokensForUsers(userIds) {
  // Get FCM tokens for multiple users
  // Return array of tokens
}
*/