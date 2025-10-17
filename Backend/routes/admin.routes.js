import express from "express";
import { 
    adminLogin, 
    sendAdminOTP, 
    verifyAdminOTP, 
    getAdminProfile, 
    getAllAdmins,
    createAdmin,
    updateAdmin,
    deleteAdmin,
    restoreAdmin,
    getAdminActivityLogs
} from "../controllers/admin.controllers.js";

const router = express.Router();

// Admin OTP routes
router.post("/send-otp", sendAdminOTP);
router.post("/verify-otp", verifyAdminOTP);

// Admin login route (legacy - kept for backward compatibility)
router.post("/login", adminLogin);

// Get admin profile by ID
router.get("/profile/:adminId", getAdminProfile);

// Get all active admins with flexible role filtering (super_admin can filter by specific roles)
router.post("/all", getAllAdmins);

// Admin management routes (Super Admin only)
router.post("/create", createAdmin);                    // Create new admin
router.put("/:adminId", updateAdmin);                   // Update admin details  
router.delete("/:adminId", deleteAdmin);               // Delete (deactivate) admin
router.put("/:adminId/restore", restoreAdmin);         // Restore deleted admin
router.post("/activity-logs", getAdminActivityLogs);   // View admin activity logs

export default router;