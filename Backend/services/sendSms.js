import Twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Generate a 6-digit OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000);
}

// In-memory OTP storage (in production, use Redis or database)
const otpStorage = new Map();

// Store OTP with expiration (5 minutes)
export function storeOTP(phoneNumber, otp) {
  const expirationTime = Date.now() + 5 * 60 * 1000; // 5 minutes
  console.log(`🔐 Storing OTP for ${phoneNumber}: ${otp}, expires at: ${new Date(expirationTime)}`);
  otpStorage.set(phoneNumber, {
    otp: otp,
    expiresAt: expirationTime
  });
  console.log(`📚 Current OTP storage:`, Array.from(otpStorage.entries()));
}

// Verify OTP
export function verifyOTP(phoneNumber, providedOtp) {
  console.log(`🔍 Verifying OTP for ${phoneNumber}: ${providedOtp}`);
  console.log(`📚 Current OTP storage:`, Array.from(otpStorage.entries()));
  
  const storedData = otpStorage.get(phoneNumber);
  console.log(`📱 Stored data for ${phoneNumber}:`, storedData);
  
  if (!storedData) {
    console.log(`❌ No OTP found for ${phoneNumber}`);
    return { success: false, message: "OTP not found or expired" };
  }
  
  if (Date.now() > storedData.expiresAt) {
    console.log(`⏰ OTP expired for ${phoneNumber}`);
    otpStorage.delete(phoneNumber);
    return { success: false, message: "OTP expired" };
  }
  
  console.log(`🔢 Comparing OTPs: stored=${storedData.otp} vs provided=${providedOtp}`);
  if (storedData.otp.toString() === providedOtp.toString()) {
    console.log(`✅ OTP verified successfully for ${phoneNumber}`);
    otpStorage.delete(phoneNumber);
    return { success: true, message: "OTP verified successfully" };
  }
  
  console.log(`❌ OTP mismatch for ${phoneNumber}`);
  return { success: false, message: "Invalid OTP" };
}

// Debug function to check stored OTPs
export function getStoredOTPs() {
  return Array.from(otpStorage.entries()).map(([phone, data]) => ({
    phoneNumber: phone,
    otp: data.otp,
    expiresAt: new Date(data.expiresAt).toISOString()
  }));
}

// Send OTP to any phone number
export async function sendOTP(phoneNumber, otp) {
  let messageOptions = {
    body: `Your HammerTime OTP is: ${otp}. This code will expire in 5 minutes.`,
    from: process.env.TWILIO_FROM,
    to: phoneNumber,
  }

  try {
    const message = await client.messages.create(messageOptions); 
    console.log("SMS sent successfully:", message.sid);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error("Error sending SMS:", error);
    return { success: false, error: error.message };
  }
}

// Send test OTP (for testing purposes)
export async function sendTestOtp(otp) {
  let messageOptions = {
    body: `Your test OTP is ${otp}`,
    from: process.env.TWILIO_FROM,
    to: process.env.TEST_TO,
  }

  try {
    const message = await client.messages.create(messageOptions); 
    console.log("Test SMS sent:", message.sid);  
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error("Error sending test SMS:", error);
    return { success: false, error: error.message };
  }
}
