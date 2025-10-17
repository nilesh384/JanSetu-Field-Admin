import { Router } from "express";
import { sendOTPController, verifyOTPController, sendTestOTPController, getStoredOTPsController } from "../controllers/otp.controllers.js";

const router = Router();

// Send OTP to any phone number
router.post("/send", sendOTPController);

// Verify OTP
router.post("/verify", verifyOTPController);

// Send test OTP to your verified number (for testing)
router.post("/send-test", sendTestOTPController);

// Debug endpoint to see stored OTPs
router.get("/debug", getStoredOTPsController);

export default router;