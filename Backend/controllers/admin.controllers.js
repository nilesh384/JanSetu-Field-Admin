import { query, queryOne, transaction } from '../db/utils.js';
import emailService from '../services/emailService.js';
import redisService from '../services/redis.js';

// Helper to convert DB timestamp values to ISO strings (null-safe)
const toISO = (val) => (val ? new Date(val).toISOString() : null);

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map();

// Admin email verification - sends OTP to admin email
const sendAdminOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        console.log('🔍 Sending OTP for admin email:', email);

        // Check if admin exists with the provided email
        const checkAdminQuery = `
            SELECT id, email, full_name, is_active
            FROM admins
            WHERE email = $1 AND is_active = true
        `;

        const adminResult = await queryOne(checkAdminQuery, [email.toLowerCase()]);

        if (!adminResult) {
            return res.status(401).json({
                success: false,
                message: "Admin not found or inactive"
            });
        }

        // Generate OTP
        const otp = emailService.generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store OTP with expiry
        otpStore.set(email.toLowerCase(), {
            otp,
            expiry: otpExpiry,
            adminId: adminResult.id,
            attempts: 0
        });

        // Send OTP email
        const emailResult = await emailService.sendAdminOTP(email, otp);

        if (!emailResult.success) {
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP email"
            });
        }

        console.log('✅ OTP sent successfully to admin:', email);

        return res.status(200).json({
            success: true,
            message: "OTP sent to your email address",
            data: {
                email: email.toLowerCase(),
                expiresIn: 600 // 10 minutes in seconds
            }
        });

    } catch (error) {
        console.error('❌ Error sending admin OTP:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Verify OTP and complete admin login
const verifyAdminOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }

        console.log('🔍 Verifying OTP for admin email:', email);

        const emailKey = email.toLowerCase();
        const storedOTPData = otpStore.get(emailKey);

        if (!storedOTPData) {
            return res.status(400).json({
                success: false,
                message: "OTP not found or expired. Please request a new one."
            });
        }

        // Check if OTP is expired
        if (new Date() > storedOTPData.expiry) {
            otpStore.delete(emailKey);
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one."
            });
        }

        // Check attempt limit
        if (storedOTPData.attempts >= 3) {
            otpStore.delete(emailKey);
            return res.status(400).json({
                success: false,
                message: "Too many failed attempts. Please request a new OTP."
            });
        }

        // Verify OTP
        if (storedOTPData.otp !== otp) {
            storedOTPData.attempts += 1;
            otpStore.set(emailKey, storedOTPData);
            
            return res.status(400).json({
                success: false,
                message: `Invalid OTP. ${3 - storedOTPData.attempts} attempts remaining.`
            });
        }

        // OTP verified successfully, get admin data and clear OTP
        otpStore.delete(emailKey);

        const admin = await transaction(async (client) => {
            // Get admin data
            const getAdminQuery = `
                SELECT id, email, full_name, department, role, is_active, last_login, created_at
                FROM admins
                WHERE id = $1 AND is_active = true
            `;

            const adminResult = await client.query(getAdminQuery, [storedOTPData.adminId]);

            if (adminResult.rows.length === 0) {
                throw new Error('Admin not found or inactive');
            }

            const adminData = adminResult.rows[0];

            // Update last_login timestamp
            const updateLoginQuery = `
                UPDATE admins
                SET last_login = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `;

            await client.query(updateLoginQuery, [adminData.id]);

            return adminData;
        });

        console.log('✅ Admin OTP verified and logged in successfully:', admin.id);

        // Return admin data (excluding sensitive information)
        const adminData = {
            id: admin.id,
            email: admin.email,
            fullName: admin.full_name,
            department: admin.department,
            role: admin.role,
            isActive: admin.is_active,
            lastLogin: toISO(admin.last_login),
            createdAt: toISO(admin.created_at)
        };

        return res.status(200).json({
            success: true,
            message: "Admin login successful",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error verifying admin OTP:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Legacy admin login (kept for backward compatibility)
const adminLogin = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        console.log('🔍 Checking admin login for email:', email);

        const admin = await transaction(async (client) => {
            // Check if admin exists with the provided email
            const checkAdminQuery = `
                SELECT id, email, full_name, department, role, is_active, last_login, created_at
                FROM admins
                WHERE email = $1 AND is_active = true
            `;

            const adminResult = await client.query(checkAdminQuery, [email.toLowerCase()]);

            if (adminResult.rows.length === 0) {
                throw new Error('Admin not found or inactive');
            }

            const adminData = adminResult.rows[0];

            // Update last_login timestamp
            const updateLoginQuery = `
                UPDATE admins
                SET last_login = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `;

            await client.query(updateLoginQuery, [adminData.id]);

            return adminData;
        });

        console.log('✅ Admin logged in successfully:', admin.id);

        // Return admin data (excluding sensitive information)
        const adminData = {
            id: admin.id,
            email: admin.email,
            fullName: admin.full_name,
            department: admin.department,
            role: admin.role,
            isActive: admin.is_active,
            lastLogin: toISO(admin.last_login),
            createdAt: toISO(admin.created_at)
        };

        return res.status(200).json({
            success: true,
            message: "Admin login successful",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error in admin login:', error);
        
        if (error.message === 'Admin not found or inactive') {
            console.log('❌ Admin not found or inactive:', email);
            return res.status(401).json({
                success: false,
                message: "Invalid credentials or admin account is inactive"
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Get admin profile by ID
const getAdminProfile = async (req, res) => {
    try {
        const { adminId } = req.params;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: "Admin ID is required"
            });
        }

        const getAdminQuery = `
            SELECT id, email, full_name, department, role, is_active, last_login, created_at
            FROM admins
            WHERE id = $1
        `;

        const admin = await queryOne(getAdminQuery, [adminId]);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        // Map database fields to camelCase for frontend
        const adminData = {
            adminId: admin.id,
            email: admin.email,
            fullName: admin.full_name,
            department: admin.department,
            role: admin.role,
            isActive: admin.is_active,
            lastLogin: toISO(admin.last_login),
            createdAt: toISO(admin.created_at)
        };

        return res.status(200).json({
            success: true,
            message: "Admin profile retrieved successfully",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error getting admin profile:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Get all active admins based on role hierarchy with flexible filtering
const getAllAdmins = async (req, res) => {
    try {
        const { requesterRole, requestedRoles } = req.body;

        if (!requesterRole) {
            return res.status(400).json({
                success: false,
                message: "Requester role is required"
            });
        }

        // Generate cache key based on requester role and requested roles
        const cacheKey = `admins:${requesterRole.toLowerCase()}:${requestedRoles ? requestedRoles.sort().join(',') : 'all'}`;

        // TEMPORARILY DISABLE CACHE - Remove this after testing
        const DISABLE_ADMIN_CACHE = true;
        
        // Check if we should bypass cache (after recent updates)
        const bypassCacheKey = 'admins:cache:bypass';
        let shouldBypassCache = DISABLE_ADMIN_CACHE; // Force bypass for testing
        
        if (!DISABLE_ADMIN_CACHE) {
            try {
                const bypassCache = await redisService.get(bypassCacheKey);
                shouldBypassCache = bypassCache === 'true';
                if (shouldBypassCache) {
                    console.log('⚠️ Cache bypass active - fetching fresh data from database');
                }
            } catch (error) {
                console.log('⚠️ Cache bypass check failed:', error.message);
            }
        } else {
            console.log('🚫 ADMIN CACHE DISABLED - Always fetching fresh data from database');
        }

        // Try to get from cache first (only if not bypassing)
        if (!shouldBypassCache) {
            try {
                const cachedData = await redisService.getCachedReports(cacheKey);
                if (cachedData) {
                    console.log('✅ Retrieved admins from cache for role:', requesterRole);
                    return res.status(200).json({
                        success: true,
                        ...cachedData,
                        cached: true
                    });
                }
            } catch (cacheError) {
                console.log('⚠️ Cache read failed, proceeding with database query:', cacheError.message);
            }
        }

        console.log('🔍 Getting admins for role:', requesterRole, 'requested roles:', requestedRoles);

        // Define role hierarchy and permissions
        let allowedRoles = [];
        let canFilterByRole = false;

        switch (requesterRole.toLowerCase()) {
            case 'super_admin':
                // Super admin can see all roles and can filter
                allowedRoles = ['viewer', 'admin', 'super_admin'];
                canFilterByRole = true;
                break;
            case 'admin':
                // Admin can only see viewers
                allowedRoles = ['viewer'];
                canFilterByRole = false;
                break;
            default:
                return res.status(403).json({
                    success: false,
                    message: "Invalid requester role or insufficient permissions"
                });
        }

        // If specific roles are requested, validate them against permissions
        let filterRoles = allowedRoles.map(role => role.toLowerCase());

        if (requestedRoles && Array.isArray(requestedRoles)) {
            if (!canFilterByRole) {
                return res.status(403).json({
                    success: false,
                    message: "You don't have permission to filter by specific roles"
                });
            }

            // Validate that all requested roles are within allowed roles
            const invalidRoles = requestedRoles.filter(role => !allowedRoles.includes(role.toLowerCase()));

            if (invalidRoles.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid roles requested: ${invalidRoles.join(', ')}. Allowed roles: ${allowedRoles.join(', ')}`
                });
            }

            filterRoles = requestedRoles.map(role => role.toLowerCase());
        }

        // Build placeholders for the IN clause
        const placeholders = filterRoles.map((_, index) => `$${index + 1}`).join(', ');
        
        const getAdminsQuery = `
            SELECT id, email, full_name, department, role, is_active, last_login, created_at
            FROM admins
            WHERE LOWER(role) IN (${placeholders}) AND is_active = true
            ORDER BY
                is_active DESC,
                CASE
                    WHEN LOWER(role) = 'super_admin' THEN 1
                    WHEN LOWER(role) = 'admin' THEN 2
                    WHEN LOWER(role) = 'viewer' THEN 3
                    ELSE 4
                END,
                created_at DESC
        `;

        const result = await query(getAdminsQuery, filterRoles);
        const admins = result.rows;

        const adminsData = admins.map(admin => ({
            id: admin.id,
            email: admin.email,
            fullName: admin.full_name,
            department: admin.department,
            role: admin.role,
            isActive: admin.is_active,
            lastLogin: toISO(admin.last_login),
            createdAt: toISO(admin.created_at)
        }));

        console.log(`✅ Retrieved ${admins.length} admins for ${requesterRole} with filter: ${filterRoles.join(', ')}`);

        const responseData = {
            message: `Admins retrieved successfully for ${requesterRole}`,
            data: adminsData,
            meta: {
                requesterRole: requesterRole,
                requestedRoles: requestedRoles || null,
                filteredRoles: filterRoles,
                allowedRoles: allowedRoles,
                canFilterByRole: canFilterByRole,
                totalCount: admins.length
            }
        };

        // Cache the results for 10 minutes (DISABLED DURING TESTING)
        if (!DISABLE_ADMIN_CACHE) {
            try {
                await redisService.cacheReports(cacheKey, responseData, 600);
            } catch (cacheError) {
                console.log('⚠️ Failed to cache admin data:', cacheError.message);
            }
        } else {
            console.log('🚫 ADMIN CACHE DISABLED - Not caching response data');
        }

        return res.status(200).json({
            success: true,
            ...responseData
        });

    } catch (error) {
        console.error('❌ Error getting admins:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Add new admin (Super Admin only)
const createAdmin = async (req, res) => {
    try {
        const { requesterRole } = req.body;
        const { email, fullName, department, role } = req.body;

        // Check if requester is super_admin
        if (requesterRole?.toLowerCase() !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: "Only super admins can create new admins"
            });
        }

        // Validate required fields
        if (!email || !fullName || !department || !role) {
            return res.status(400).json({
                success: false,
                message: "Email, full name, department, and role are required"
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Invalid email format"
            });
        }

        // Validate role
        const validRoles = ['viewer', 'admin', 'super_admin'];
        if (!validRoles.includes(role.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
            });
        }

        console.log('🔧 Creating new admin:', { email, fullName, department, role });

        const newAdmin = await transaction(async (client) => {
            // Check if admin with this email already exists
            const checkEmailQuery = `
                SELECT id, is_active FROM admins WHERE email = $1
            `;
            const existingAdmin = await client.query(checkEmailQuery, [email.toLowerCase()]);
            
            if (existingAdmin.rows.length > 0) {
                if (existingAdmin.rows[0].is_active) {
                    throw new Error('Admin with this email already exists');
                } else {
                    throw new Error('Admin with this email exists but is inactive');
                }
            }

            // Create new admin
            const createAdminQuery = `
                INSERT INTO admins (email, full_name, department, role, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id, email, full_name, department, role, is_active, created_at
            `;

            const result = await client.query(createAdminQuery, [
                email.toLowerCase(),
                fullName.trim(),
                department.trim(),
                role.toLowerCase()
            ]);

            return result.rows[0];
        });

        console.log('✅ Admin created successfully:', newAdmin.id);

        // Invalidate admin cache
        try {
            await redisService.invalidatePattern('admins:*');
        } catch (cacheError) {
            console.log('⚠️ Failed to invalidate admin cache:', cacheError.message);
        }

        // Send welcome email to new admin
        try {
            await emailService.sendAdminWelcomeEmail(email, fullName, role);
        } catch (emailError) {
            console.log('⚠️ Failed to send welcome email:', emailError.message);
        }

        const adminData = {
            id: newAdmin.id,
            email: newAdmin.email,
            fullName: newAdmin.full_name,
            department: newAdmin.department,
            role: newAdmin.role,
            isActive: newAdmin.is_active,
            createdAt: toISO(newAdmin.created_at)
        };

        return res.status(201).json({
            success: true,
            message: "Admin created successfully",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error creating admin:', error);
        
        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Update admin (Super Admin only)
const updateAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const { requesterRole } = req.body;
        const { fullName, department, role, isActive } = req.body;

        // Check if requester is super_admin
        if (requesterRole?.toLowerCase() !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: "Only super admins can update admin details"
            });
        }

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: "Admin ID is required"
            });
        }

        // Validate role if provided
        if (role) {
            const validRoles = ['viewer', 'admin', 'super_admin'];
            if (!validRoles.includes(role.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
                });
            }
        }

        console.log('🔧 Updating admin:', adminId, { fullName, department, role, isActive });

        const updatedAdmin = await transaction(async (client) => {
            // Check if admin exists
            const checkAdminQuery = `
                SELECT id, email, full_name, department, role, is_active 
                FROM admins WHERE id = $1
            `;
            const existingAdmin = await client.query(checkAdminQuery, [adminId]);
            
            if (existingAdmin.rows.length === 0) {
                throw new Error('Admin not found');
            }

            const currentAdmin = existingAdmin.rows[0];

            // Build dynamic update query
            let updateFields = [];
            let updateValues = [];
            let paramCount = 1;

            if (fullName !== undefined) {
                updateFields.push(`full_name = $${paramCount++}`);
                updateValues.push(fullName.trim());
            }
            
            if (department !== undefined) {
                updateFields.push(`department = $${paramCount++}`);
                updateValues.push(department.trim());
            }
            
            if (role !== undefined) {
                updateFields.push(`role = $${paramCount++}`);
                updateValues.push(role.toLowerCase());
            }
            
            if (isActive !== undefined) {
                updateFields.push(`is_active = $${paramCount++}`);
                updateValues.push(isActive);
            }

            if (updateFields.length === 0) {
                return currentAdmin; // No changes
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            updateValues.push(adminId);

            const updateAdminQuery = `
                UPDATE admins 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING id, email, full_name, department, role, is_active, updated_at
            `;

            const result = await client.query(updateAdminQuery, updateValues);
            return result.rows[0];
        });

        console.log('✅ Admin updated successfully:', updatedAdmin.id);

        // IMPORTANT: Invalidate cache BEFORE sending response to ensure fresh data on next request
        // Aggressively invalidate ALL admin-related cache - clear both list cache and individual profile cache
        try {
            console.log('🗑️ Starting cache invalidation for admin:', adminId);
            
            // Set cache bypass flag for 30 seconds to ensure fresh data is fetched
            await redisService.set('admins:cache:bypass', 'true', 30);
            console.log('✅ Cache bypass enabled for 30 seconds');
            
            // Invalidate all possible admin list cache keys
            const listCount = await redisService.invalidatePattern('admins:*');
            console.log(`✅ Invalidated ${listCount} admin list cache entries`);
            
            // Invalidate individual profile cache
            const profileCount = await redisService.invalidatePattern(`admin:profile:${adminId}`);
            console.log(`✅ Invalidated ${profileCount} admin profile cache entries`);
            
            // Also invalidate any cached admin data with this specific ID
            const adminCount = await redisService.invalidatePattern(`admin:${adminId}:*`);
            console.log(`✅ Invalidated ${adminCount} specific admin cache entries`);
            
            console.log('✅ All admin caches invalidated successfully for:', adminId);
        } catch (cacheError) {
            console.error('⚠️ Failed to invalidate admin cache:', cacheError.message);
        }

        const adminData = {
            id: updatedAdmin.id,
            email: updatedAdmin.email,
            fullName: updatedAdmin.full_name,
            department: updatedAdmin.department,
            role: updatedAdmin.role,
            isActive: updatedAdmin.is_active,
            updatedAt: toISO(updatedAdmin.updated_at)
        };

        return res.status(200).json({
            success: true,
            message: "Admin updated successfully",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error updating admin:', error);
        
        if (error.message === 'Admin not found') {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Delete admin (Super Admin only) - Soft delete by setting is_active to false
const deleteAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const { requesterRole, requesterId } = req.body;

        // Check if requester is super_admin
        if (requesterRole?.toLowerCase() !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: "Only super admins can delete admins"
            });
        }

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: "Admin ID is required"
            });
        }

        // Prevent self-deletion
        if (adminId === requesterId) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete your own admin account"
            });
        }

        console.log('🗑️ Deleting admin:', adminId);

        const deletedAdmin = await transaction(async (client) => {
            // Check if admin exists and is active
            const checkAdminQuery = `
                SELECT id, email, full_name, role, is_active 
                FROM admins WHERE id = $1
            `;
            const existingAdmin = await client.query(checkAdminQuery, [adminId]);
            
            if (existingAdmin.rows.length === 0) {
                throw new Error('Admin not found');
            }

            const adminToDelete = existingAdmin.rows[0];

            if (!adminToDelete.is_active) {
                throw new Error('Admin is already inactive');
            }

            // Check if this is the last super_admin
            if (adminToDelete.role.toLowerCase() === 'super_admin') {
                const countSuperAdminsQuery = `
                    SELECT COUNT(*) as count FROM admins 
                    WHERE role = 'super_admin' AND is_active = true AND id != $1
                `;
                const countResult = await client.query(countSuperAdminsQuery, [adminId]);
                
                if (parseInt(countResult.rows[0].count) === 0) {
                    throw new Error('Cannot delete the last active super admin');
                }
            }

            // Soft delete - set is_active to false
            const deleteAdminQuery = `
                UPDATE admins 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING id, email, full_name, department, role, is_active
            `;

            const result = await client.query(deleteAdminQuery, [adminId]);
            return result.rows[0];
        });

        console.log('✅ Admin deleted successfully:', deletedAdmin.id);

        // Aggressively invalidate ALL admin-related cache
        try {
            // Set cache bypass flag for 30 seconds
            await redisService.set('admins:cache:bypass', 'true', 30);
            console.log('✅ Cache bypass enabled for 30 seconds');
            
            await redisService.invalidatePattern('admins:*');
            await redisService.invalidatePattern(`admin:profile:${adminId}`);
            await redisService.invalidatePattern(`admin:${adminId}:*`);
            console.log('✅ All admin caches invalidated for:', adminId);
        } catch (cacheError) {
            console.log('⚠️ Failed to invalidate admin cache:', cacheError.message);
        }

        const adminData = {
            id: deletedAdmin.id,
            email: deletedAdmin.email,
            fullName: deletedAdmin.full_name,
            department: deletedAdmin.department,
            role: deletedAdmin.role,
            isActive: deletedAdmin.is_active
        };

        return res.status(200).json({
            success: true,
            message: "Admin deleted successfully",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error deleting admin:', error);
        
        if (error.message === 'Admin not found' || 
            error.message === 'Admin is already inactive' ||
            error.message === 'Cannot delete the last active super admin') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Restore deleted admin (Super Admin only)
const restoreAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const { requesterRole } = req.body;

        // Check if requester is super_admin
        if (requesterRole?.toLowerCase() !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: "Only super admins can restore admins"
            });
        }

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: "Admin ID is required"
            });
        }

        console.log('🔄 Restoring admin:', adminId);

        const restoredAdmin = await transaction(async (client) => {
            // Check if admin exists and is inactive
            const checkAdminQuery = `
                SELECT id, email, full_name, department, role, is_active 
                FROM admins WHERE id = $1
            `;
            const existingAdmin = await client.query(checkAdminQuery, [adminId]);
            
            if (existingAdmin.rows.length === 0) {
                throw new Error('Admin not found');
            }

            const adminToRestore = existingAdmin.rows[0];

            if (adminToRestore.is_active) {
                throw new Error('Admin is already active');
            }

            // Restore admin - set is_active to true
            const restoreAdminQuery = `
                UPDATE admins 
                SET is_active = true, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING id, email, full_name, department, role, is_active
            `;

            const result = await client.query(restoreAdminQuery, [adminId]);
            return result.rows[0];
        });

        console.log('✅ Admin restored successfully:', restoredAdmin.id);

        // Aggressively invalidate ALL admin-related cache
        try {
            // Set cache bypass flag for 30 seconds
            await redisService.set('admins:cache:bypass', 'true', 30);
            console.log('✅ Cache bypass enabled for 30 seconds');
            
            await redisService.invalidatePattern('admins:*');
            await redisService.invalidatePattern(`admin:profile:${adminId}`);
            await redisService.invalidatePattern(`admin:${adminId}:*`);
            console.log('✅ All admin caches invalidated for:', adminId);
        } catch (cacheError) {
            console.log('⚠️ Failed to invalidate admin cache:', cacheError.message);
        }

        const adminData = {
            id: restoredAdmin.id,
            email: restoredAdmin.email,
            fullName: restoredAdmin.full_name,
            department: restoredAdmin.department,
            role: restoredAdmin.role,
            isActive: restoredAdmin.is_active
        };

        return res.status(200).json({
            success: true,
            message: "Admin restored successfully",
            data: adminData
        });

    } catch (error) {
        console.error('❌ Error restoring admin:', error);
        
        if (error.message === 'Admin not found' || 
            error.message === 'Admin is already active') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// Get admin activity logs (Super Admin only)
const getAdminActivityLogs = async (req, res) => {
    try {
        const { requesterRole } = req.body;
        const { adminId, limit = 50, offset = 0 } = req.query;

        // Check if requester is super admin (handle different role formats)
        const roleLower = requesterRole?.toLowerCase();
        const isSuperAdmin = roleLower === 'superadmin' || roleLower === 'super_admin' || roleLower === 'super admin';
        
        if (!isSuperAdmin) {
            return res.status(403).json({
                success: false,
                message: "Only super admins can view activity logs"
            });
        }

        console.log('📊 Getting admin activity logs for:', adminId || 'all admins');

        let activityQuery = `
            SELECT 
                a.id,
                a.email,
                a.full_name,
                a.department,
                a.role,
                a.last_login,
                a.created_at,
                a.updated_at,
                a.is_active,
                COUNT(r.id) as reports_handled
            FROM admins a
            LEFT JOIN reports r ON r.resolved_by_admin_id = a.id
            WHERE 1=1
        `;

        const queryParams = [];
        let paramCount = 1;

        if (adminId) {
            activityQuery += ` AND a.id = $${paramCount++}`;
            queryParams.push(adminId);
        }

        activityQuery += `
            GROUP BY a.id, a.email, a.full_name, a.department, a.role, 
                     a.last_login, a.created_at, a.updated_at, a.is_active
            ORDER BY a.last_login DESC NULLS LAST
            LIMIT $${paramCount++} OFFSET $${paramCount++}
        `;

        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await query(activityQuery, queryParams);

        // Transform admin data into activity log format expected by frontend
        const activityLogs = [];
        
        result.rows.forEach(admin => {
            // Add login activity if last_login exists
            if (admin.last_login) {
                activityLogs.push({
                    id: `login_${admin.id}_${admin.last_login.getTime()}`,
                    adminId: admin.id,
                    adminEmail: admin.email,
                    adminName: admin.full_name,
                    adminRole: admin.role,
                    action: 'login',
                    description: `${admin.full_name} logged into the system`,
                    createdAt: toISO(admin.last_login),
                    timestamp: toISO(admin.last_login),
                    metadata: {
                        department: admin.department,
                        role: admin.role
                    }
                });
            }

            // Add account creation activity
            if (admin.created_at) {
                activityLogs.push({
                    id: `created_${admin.id}_${admin.created_at.getTime()}`,
                    adminId: admin.id,
                    adminEmail: admin.email,
                    adminName: admin.full_name,
                    adminRole: admin.role,
                    action: 'account_created',
                    description: `${admin.full_name}'s account was created`,
                    createdAt: toISO(admin.created_at),
                    timestamp: toISO(admin.created_at),
                    metadata: {
                        department: admin.department,
                        role: admin.role
                    }
                });
            }

            // Add reports handled activity if any
            if (admin.reports_handled > 0) {
                activityLogs.push({
                    id: `reports_${admin.id}_${Date.now()}`,
                    adminId: admin.id,
                    adminEmail: admin.email,
                    adminName: admin.full_name,
                    adminRole: admin.role,
                    action: 'reports_handled',
                    description: `${admin.full_name} has handled ${admin.reports_handled} reports`,
                    createdAt: toISO(admin.updated_at || admin.created_at),
                    timestamp: toISO(admin.updated_at || admin.created_at),
                    metadata: {
                        reportsCount: admin.reports_handled,
                        department: admin.department,
                        role: admin.role
                    }
                });
            }
        });

        // Sort by timestamp descending
        activityLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply pagination to the transformed logs
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(limit);
        const paginatedLogs = activityLogs.slice(startIndex, endIndex);

        console.log(`✅ Retrieved ${paginatedLogs.length} activity log entries`);

        return res.status(200).json({
            success: true,
            message: "Admin activity logs retrieved successfully",
            data: paginatedLogs,
            pagination: {
                total: activityLogs.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: endIndex < activityLogs.length
            }
        });

    } catch (error) {
        console.error('❌ Error getting admin activity logs:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

export { 
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
};