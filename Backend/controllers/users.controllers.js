import { query, queryOne, queryMany, transaction } from "../db/utils.js";
import crypto from "crypto";
import { uploadOnCloudinary, deleteOnCloudinary, extractPublicIdFromUrl } from "../services/cloudinary.js";

// Helper to convert DB timestamp values to ISO strings (null-safe)
const toISO = (val) => (val ? new Date(val).toISOString() : null);

// Create or login user after OTP verification
const createOrLoginUser = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required"
            });
        }

        console.log('🔍 Creating/logging in user with phone:', phoneNumber);
        
        // Check if user already exists
        const checkUserQuery = `SELECT * FROM users WHERE phone_number = $1`;
        const existingUser = await query(checkUserQuery, [phoneNumber]);
        
        if (existingUser.rows.length > 0) {
            // User exists - update last_login and return user data
            const user = existingUser.rows[0];
            const updateLoginQuery = `
                UPDATE users 
                SET last_login = CURRENT_TIMESTAMP, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = $1 
                RETURNING *
            `;
            const updatedUser = await query(updateLoginQuery, [user.id]);
            const rawUser = updatedUser.rows[0];
            
            console.log('✅ Existing user logged in:', user.id);
            
            // Map database fields to camelCase
            const mappedUser = {
                id: rawUser.id,
                phoneNumber: rawUser.phone_number,
                email: rawUser.email,
                fullName: rawUser.full_name,
                profileImageUrl: rawUser.profile_image_url,
                isVerified: rawUser.is_verified,
                totalReports: rawUser.total_reports,
                resolvedReports: rawUser.resolved_reports,
                createdAt: toISO(rawUser.created_at),
                updatedAt: toISO(rawUser.updated_at),
                lastLogin: toISO(rawUser.last_login)
            };
            
            return res.status(200).json({
                success: true,
                message: 'Login successful',
                user: mappedUser,
                isNewUser: false,
                requiresProfileSetup: !user.full_name || !user.email
            });
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
                    resolved_reports,
                    last_login
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                RETURNING *
            `;
            
            const newUserResult = await query(insertQuery, [
                phoneNumber,
                '', // Empty email initially
                '', // Empty full_name initially  
                '', // Empty profile_image_url initially
                true, // is_verified = true after OTP
                0, // total_reports = 0
                0  // resolved_reports = 0
            ]);
            
            const newUser = newUserResult.rows[0];
            console.log('✅ New user created:', newUser.id);
            
            // Map snake_case to camelCase for frontend consistency
            const mappedNewUser = {
                id: newUser.id,
                phoneNumber: newUser.phone_number,
                email: newUser.email,
                fullName: newUser.full_name,
                profileImageUrl: newUser.profile_image_url,
                isVerified: newUser.is_verified,
                totalReports: newUser.total_reports,
                resolvedReports: newUser.resolved_reports,
                createdAt: toISO(newUser.created_at),
                updatedAt: toISO(newUser.updated_at),
                lastLogin: toISO(newUser.last_login)
            };
            
            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                user: mappedNewUser,
                isNewUser: true,
                requiresProfileSetup: true
            });
        }
        
    } catch (error) {
        console.error('❌ Error in createOrLoginUser:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Update user profile (called from profile-setup page)
const updateUserProfile = async (req, res) => {
    try {
        const { userId, fullName, email, profileImageUrl } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        console.log('📝 Updating user profile:', userId);

        const updateQuery = `
            UPDATE users 
            SET 
                full_name = $1,
                email = $2,
                profile_image_url = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
        `;
        
        const result = await query(updateQuery, [
            fullName || '',
            email || '', 
            profileImageUrl || '',
            userId
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        console.log('✅ Profile updated successfully:', userId);
        
        const updatedUser = result.rows[0];
        
        // Map database fields to camelCase for frontend consistency
        const mappedUser = {
            id: updatedUser.id,
            phoneNumber: updatedUser.phone_number,
            email: updatedUser.email,
            fullName: updatedUser.full_name,
            profileImageUrl: updatedUser.profile_image_url,
            isVerified: updatedUser.is_verified,
            totalReports: updatedUser.total_reports,
            resolvedReports: updatedUser.resolved_reports,
            createdAt: toISO(updatedUser.created_at),
            updatedAt: toISO(updatedUser.updated_at),
            lastLogin: toISO(updatedUser.last_login)
        };
        
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: mappedUser
        });
        
    } catch (error) {
        console.error('❌ Error in updateUserProfile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        console.log('🔍 Fetching user by ID:', id);

        const getUserQuery = `SELECT * FROM users WHERE id = $1`;
        const result = await query(getUserQuery, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = result.rows[0];
        console.log('✅ User found:', user.id);
        
        // Map database fields to camelCase for frontend consistency
        const mappedUser = {
            id: user.id,
            phoneNumber: user.phone_number,
            email: user.email,
            fullName: user.full_name,
            profileImageUrl: user.profile_image_url,
            isVerified: user.is_verified,
            totalReports: user.total_reports,
            resolvedReports: user.resolved_reports,
            createdAt: toISO(user.created_at),
            updatedAt: toISO(user.updated_at),
            lastLogin: toISO(user.last_login)
        };
        
        res.status(200).json({
            success: true,
            user: mappedUser,
            requiresProfileSetup: !user.full_name || !user.email
        });
        
    } catch (error) {
        console.error('❌ Error in getUserById:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get user by phone number
const getUserByPhone = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required"
            });
        }

        console.log('🔍 Fetching user by phone:', phoneNumber);

        const getUserQuery = `SELECT * FROM users WHERE phone_number = $1`;
        const result = await query(getUserQuery, [phoneNumber]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = result.rows[0];
        console.log('✅ User found by phone:', user.id);
        
        // Map database fields to camelCase for frontend consistency
        const mappedUser = {
            id: user.id,
            phoneNumber: user.phone_number,
            email: user.email,
            fullName: user.full_name,
            profileImageUrl: user.profile_image_url,
            isVerified: user.is_verified,
            totalReports: user.total_reports,
            resolvedReports: user.resolved_reports,
            createdAt: toISO(user.created_at),
            updatedAt: toISO(user.updated_at),
            lastLogin: toISO(user.last_login)
        };
        
        res.status(200).json({
            success: true,
            user: mappedUser,
            requiresProfileSetup: !user.full_name || !user.email
        });
        
    } catch (error) {
        console.error('❌ Error in getUserByPhone:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Upload profile image to Cloudinary
const uploadProfileImage = async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file provided"
            });
        }

        console.log('📤 Uploading profile image for user:', userId);
        console.log('📁 File info:', {
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        // Check if user exists and get current profile image
        const getUserQuery = `SELECT * FROM users WHERE id = $1`;
        const userResult = await query(getUserQuery, [userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const currentUser = userResult.rows[0];
        
        // Upload new image to Cloudinary
        const cloudinaryResponse = await uploadOnCloudinary(req.file.path);
        
        if (!cloudinaryResponse) {
            return res.status(500).json({
                success: false,
                message: 'Failed to upload image to Cloudinary'
            });
        }

        console.log('☁️ Image uploaded to Cloudinary:', cloudinaryResponse.secure_url);

        // Delete old profile image from Cloudinary if it exists
        if (currentUser.profile_image_url && currentUser.profile_image_url.includes('cloudinary')) {
            try {
                const oldPublicId = extractPublicIdFromUrl(currentUser.profile_image_url);
                await deleteOnCloudinary(oldPublicId);
                console.log('🗑️ Old profile image deleted from Cloudinary');
            } catch (deleteError) {
                console.error('⚠️ Failed to delete old image:', deleteError);
                // Don't fail the request if old image deletion fails
            }
        }

        // Update user's profile image URL in database
        const updateQuery = `
            UPDATE users 
            SET profile_image_url = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        
        const result = await query(updateQuery, [cloudinaryResponse.secure_url, userId]);
        const updatedUser = result.rows[0];
        
        console.log('✅ Profile image updated in database');
        
        // Map database fields to camelCase for frontend consistency
        const mappedUser = {
            id: updatedUser.id,
            phoneNumber: updatedUser.phone_number,
            email: updatedUser.email,
            fullName: updatedUser.full_name,
            profileImageUrl: updatedUser.profile_image_url,
            isVerified: updatedUser.is_verified,
            totalReports: updatedUser.total_reports,
            resolvedReports: updatedUser.resolved_reports,
            createdAt: toISO(updatedUser.created_at),
            updatedAt: toISO(updatedUser.updated_at),
            lastLogin: toISO(updatedUser.last_login)
        };
        
        res.status(200).json({
            success: true,
            message: 'Profile image uploaded successfully',
            user: mappedUser,
            imageUrl: cloudinaryResponse.secure_url
        });
        
    } catch (error) {
        console.error('❌ Error in uploadProfileImage:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during image upload',
            error: error.message
        });
    }
};

// Delete user
const deleteUser = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required"
            });
        }

        console.log('🗑️ Deleting user with phone:', phoneNumber);

        // Check if user exists and delete
        const result = await transaction(async (client) => {
            const getUserQuery = `SELECT * FROM users WHERE phone_number = $1`;
            const userResult = await client.query(getUserQuery, [phoneNumber]);
            
            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const deleteQuery = `DELETE FROM users WHERE phone_number = $1 RETURNING *`;
            const deleteResult = await client.query(deleteQuery, [phoneNumber]);
            return deleteResult.rows[0];
        });
        
        console.log('✅ User deleted from database');
        
        res.status(200).json({
            success: true,
            message: 'User deleted successfully',
            user: result
        });

    } catch (error) {
        console.error('❌ Error in deleteUser:', error);
        
        if (error.message === 'User not found') {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};



// Legacy functions (keeping for backward compatibility but updated responses)
const registerUser = (req, res) => {
    res.status(410).json({
        success: false,
        message: "This endpoint is deprecated. Use /create-or-login instead."
    });
};

const loginUser = (req, res) => {
    res.status(410).json({
        success: false,
        message: "This endpoint is deprecated. Use /create-or-login instead."
    });
};

const updateUser = (req, res) => {
    res.status(410).json({
        success: false,
        message: "This endpoint is deprecated. Use /update-profile instead."
    });
};



export { 
    createOrLoginUser,
    updateUserProfile, 
    getUserById,
    getUserByPhone,
    uploadProfileImage,
    deleteUser,
    registerUser, 
    loginUser, 
    updateUser 
};
