import admin from 'firebase-admin';
import { queryOne } from '../db/utils.js';

// Initialize Firebase Admin SDK if not already initialized
let isInitialized = false;

const initializeFirebase = async () => {
  if (!isInitialized) {
    try {
      // Import your service account key
      const serviceAccount = await import('../config/firebase-service-account-key.json', { assert: { type: 'json' } });
      
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount.default)
        });
      }
      isInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    }
  }
};

// Get user's FCM token from database
const getUserFCMToken = async (userId) => {
  try {
    const query = `
      SELECT fcm_token 
      FROM users 
      WHERE id = $1 AND fcm_token IS NOT NULL
    `;
    const result = await queryOne(query, [userId]);
    return result?.fcm_token || null;
  } catch (error) {
    console.error('Error getting user FCM token:', error);
    return null;
  }
};

// Send notification when report is resolved
export const sendReportResolvedNotification = async (userId, reportId, reportTitle) => {
  try {
    await initializeFirebase();

    if (!admin.apps.length) {
      console.error('Firebase Admin SDK not initialized');
      return false;
    }

    // Get user's FCM token
    const fcmToken = await getUserFCMToken(userId);
    
    if (!fcmToken) {
      console.log(`No FCM token found for user ${userId}`);
      return false;
    }

    // Prepare notification payload
    const notificationPayload = {
      token: fcmToken,
      notification: {
        title: '🎉 Report Resolved!',
        body: `Your report "${reportTitle}" has been resolved by our team.`,
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
          channelId: 'report_updates',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    // Send notification
    const response = await admin.messaging().send(notificationPayload);
    console.log('✅ Report resolved notification sent successfully:', response);
    return true;

  } catch (error) {
    console.error('❌ Error sending report resolved notification:', error);
    return false;
  }
};

// Send notification for report updates
export const sendReportUpdateNotification = async (userId, reportId, reportTitle, updateMessage) => {
  try {
    await initializeFirebase();

    if (!admin.apps.length) {
      console.error('Firebase Admin SDK not initialized');
      return false;
    }

    const fcmToken = await getUserFCMToken(userId);
    
    if (!fcmToken) {
      console.log(`No FCM token found for user ${userId}`);
      return false;
    }

    const notificationPayload = {
      token: fcmToken,
      notification: {
        title: '📝 Report Update',
        body: updateMessage || `Your report "${reportTitle}" has been updated.`,
      },
      data: {
        type: 'report_update',
        reportId: reportId.toString(),
        userId: userId.toString(),
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#FF6B35',
          sound: 'default',
          channelId: 'report_updates',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(notificationPayload);
    console.log('✅ Report update notification sent successfully:', response);
    return true;

  } catch (error) {
    console.error('❌ Error sending report update notification:', error);
    return false;
  }
};

// Send bulk notifications
export const sendBulkNotifications = async (userIds, title, body, data = {}) => {
  try {
    await initializeFirebase();

    if (!admin.apps.length) {
      console.error('Firebase Admin SDK not initialized');
      return false;
    }

    // Get FCM tokens for all users
    const tokens = [];
    for (const userId of userIds) {
      const token = await getUserFCMToken(userId);
      if (token) {
        tokens.push(token);
      }
    }

    if (tokens.length === 0) {
      console.log('No FCM tokens found for provided users');
      return false;
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data,
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Bulk notification sent: ${response.successCount} successful, ${response.failureCount} failed`);
    
    return {
      successCount: response.successCount,
      failureCount: response.failureCount
    };

  } catch (error) {
    console.error('❌ Error sending bulk notifications:', error);
    return false;
  }
};

export default {
  sendReportResolvedNotification,
  sendReportUpdateNotification,
  sendBulkNotifications
};