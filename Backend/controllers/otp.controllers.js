import { generateOTP, storeOTP, verifyOTP, sendOTP, sendTestOtp, getStoredOTPs } from "../services/sendSms.js";
import { query, transaction } from "../db/utils.js";
import redisService from "../services/redis.js";

// Send OTP to phone number
export const sendOTPController = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    console.log('Request body:', req.body);
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }
    
    // Rate limiting: 5 OTP requests per hour per phone number
    const rateLimitResult = await redisService.checkRateLimit(
      `otp_send:${phoneNumber}`, 
      5, 
      3600 // 1 hour
    );
    
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Please try again later.",
        resetTime: rateLimitResult.resetTime
      });
    }
    
    // Generate 6-digit OTP
    const otp = generateOTP();
    
    // Store OTP in Redis (expires in 5 minutes) and memory as fallback
    await redisService.cacheOTP(phoneNumber, otp, 300);
    storeOTP(phoneNumber, otp);
    
    // Send OTP via SMS
    const result = await sendOTP(phoneNumber, otp);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        messageSid: result.messageSid
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to send OTP",
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Error in sendOTPController:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Verify OTP
export const verifyOTPController = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    
    console.log('🔍 Verify OTP request:', req.body);
    
    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required"
      });
    }
    
    // First try to verify OTP from Redis cache
    const cachedOTP = await redisService.getCachedOTP(phoneNumber);
    let result;
    
    if (cachedOTP && cachedOTP === otp) {
      result = { success: true };
      // Invalidate OTP after successful verification
      await redisService.invalidateOTP(phoneNumber);
    } else {
      // Fallback to memory-based verification
      result = verifyOTP(phoneNumber, otp);
    }
    
    if (result.success) {
      console.log('✅ OTP verified, creating/logging in user...');
      
      // OTP is valid - create or login user in database using transaction
      try {
        const user = await transaction(async (client) => {
          // Check if user already exists
          const checkUserQuery = `SELECT * FROM users WHERE phone_number = $1`;
          const existingUser = await client.query(checkUserQuery, [phoneNumber]);
          
          let userData;
          let isNewUser = false;
          let requiresProfileSetup = false;
          
          if (existingUser.rows.length > 0) {
            // User exists - update last_login and return user data
            userData = existingUser.rows[0];
            const updateLoginQuery = `
              UPDATE users 
              SET last_login = CURRENT_TIMESTAMP, 
                  updated_at = CURRENT_TIMESTAMP 
              WHERE id = $1 
              RETURNING *
            `;
            const updatedUser = await client.query(updateLoginQuery, [userData.id]);
            userData = updatedUser.rows[0];
            isNewUser = false;
            requiresProfileSetup = !userData.full_name || !userData.email;
            
            console.log('✅ Existing user logged in:', userData.id);
          } else {
            // New user - create with UUID and minimal data
            const insertQuery = `
              INSERT INTO users (
                phone_number, 
                email, 
                full_name, 
                profile_image_url, 
                is_verified,
                total_reports,
                resolved_reports
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING *
            `;
            
            const newUserResult = await client.query(insertQuery, [
              phoneNumber,
              '', // Empty email initially
              '', // Empty full_name initially  
              '', // Empty profile_image_url initially
              true, // is_verified = true after OTP
              0, // total_reports = 0
              0  // resolved_reports = 0
            ]);
            
            userData = newUserResult.rows[0];
            isNewUser = true;
            requiresProfileSetup = true;
            
            console.log('✅ New user created:', userData.id);
          }
          
          return { userData, isNewUser, requiresProfileSetup };
        });
        
        // Return successful response with user data
        res.status(200).json({
          success: true,
          message: result.message,
          user: {
            id: user.userData.id,
            phoneNumber: user.userData.phone_number,
            email: user.userData.email,
            fullName: user.userData.full_name,
            profileImageUrl: user.userData.profile_image_url,
            isVerified: user.userData.is_verified,
            totalReports: user.userData.total_reports,
            resolvedReports: user.userData.resolved_reports,
            createdAt: user.userData.created_at ? new Date(user.userData.created_at).toISOString() : null,
            updatedAt: user.userData.updated_at ? new Date(user.userData.updated_at).toISOString() : null,
            lastLogin: user.userData.last_login ? new Date(user.userData.last_login).toISOString() : null
          },
          isNewUser: user.isNewUser,
          requiresProfileSetup: user.requiresProfileSetup
        });
        
      } catch (dbError) {
        console.error('❌ Database error after OTP verification:', dbError);
        // Still return success for OTP verification, but note the DB error
        res.status(200).json({
          success: true,
          message: result.message,
          warning: "OTP verified but user creation failed",
          dbError: dbError.message
        });
      }
      
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
  } catch (error) {
    console.error('❌ Error in verifyOTPController:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Send test OTP (for testing with your verified number)
export const sendTestOTPController = async (req, res) => {
  try {
    const otp = generateOTP();
    
    // Store OTP for the test number
    storeOTP(process.env.TEST_TO, otp);
    
    const result = await sendTestOtp(otp);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: "Test OTP sent successfully",
        messageSid: result.messageSid,
        // For testing purposes, return the OTP (remove in production)
        testOTP: otp
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to send test OTP",
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Error in sendTestOTPController:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Debug endpoint to check stored OTPs
export const getStoredOTPsController = async (req, res) => {
  try {
    const storedOTPs = getStoredOTPs();
    res.status(200).json({
      success: true,
      message: "Current stored OTPs",
      data: storedOTPs
    });
  } catch (error) {
    console.error('Error in getStoredOTPsController:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};