import { query, queryOne, transaction } from "../db/utils.js";
import { uploadOnCloudinary } from "../services/cloudinary.js";
import redisService from "../services/redis.js";
import { sendReportResolvedNotification } from "../services/notificationService.js";

// Helper to convert DB timestamp values to ISO strings (null-safe)
const toISO = (val) => (val ? new Date(val).toISOString() : null);

// Helper to ensure PostgreSQL array is properly converted to JavaScript array
const parseArrayField = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  // If it's a string representation of PostgreSQL array, parse it
  if (typeof val === 'string') {
    // PostgreSQL array format: {item1,item2} or {"item1","item2"}
    const cleaned = val.replace(/^{|}$/g, '').trim();
    if (!cleaned) return [];
    // Split by comma and clean up quotes
    return cleaned.split(',').map(item => item.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }
  return [];
};


/**
 * Compute automatic priority based on:
 *  - number of unresolved reports in the area (radiusMeters)
 *  - recency window (days)
 *  - category severity weight
 *
 * Returns: 'low' | 'medium' | 'high' | 'critical'
 */
const computeAutoPriority = async (client, latitude, longitude, category = '', days = 30, radiusMeters = 500) => {
  try {
    console.log(`🔍 Computing auto-priority for category "${category}" at (${latitude}, ${longitude})`);
    
    // Use haversine distance formula to find nearby unresolved reports
    const nearbyQuery = `
      SELECT COUNT(*) AS cnt
      FROM reports
      WHERE is_resolved = false
        AND created_at >= NOW() - ($3 || ' days')::interval
        AND (
          6371000 * acos(
            LEAST(1, cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
            + sin(radians($1)) * sin(radians(latitude)))
          )
        ) <= $4
    `;
    
    const result = await client.query(nearbyQuery, [latitude, longitude, days, radiusMeters]);
    const nearbyCount = parseInt(result.rows[0]?.cnt || 0, 10);
    
    // Category severity weights - critical categories get higher priority
    const highSeverityCategories = [
      'Public Safety & Emergency',
      'Water Supply & Sewerage', 
      'Traffic & Transport',
      'Municipal Urban Planning & Encroachment Removal'
    ];
    
    const mediumSeverityCategories = [
      'Street Lighting & Electrical',
      'Roads & Infrastructure',
      'Public Health & Hygiene'
    ];
    
    let severityWeight = 1;
    if (highSeverityCategories.includes(category)) {
      severityWeight = 3;
    } else if (mediumSeverityCategories.includes(category)) {
      severityWeight = 2;
    }
    
    // Calculate final score
    const score = nearbyCount * severityWeight;
    
    let computedPriority;
    if (score >= 15) {
      computedPriority = 'critical';
    } else if (score >= 8) {
      computedPriority = 'high';
    } else if (score >= 3) {
      computedPriority = 'medium';
    } else {
      computedPriority = 'low';
    }
    
    console.log(`📊 Auto-priority: nearby=${nearbyCount}, severity=${severityWeight}, score=${score} → ${computedPriority}`);
    return computedPriority;
    
  } catch (error) {
    console.warn('⚠️ Priority auto-compute failed, falling back to medium:', error);
    return 'medium';
  }
};

// Create a new report
const createReport = async (req, res) => {
    try {
        const {
            userId,
            title,
            description,
            category,
            priority,
            mediaUrls = [],
            audioUrl,
            latitude,
            longitude,
            address,
            department
        } = req.body;

        // Use either format for userId
        const actualUserId = userId;
        // Use either format for mediaUrls
        const actualMediaUrls = mediaUrls.length > 0 ? mediaUrls : [];
        // Use either format for audioUrl
        const actualAudioUrl = audioUrl || null;

        // Validation
        if (!actualUserId || !title) {
            return res.status(400).json({
                success: false,
                message: "User ID and title are required"
            });
        }

        console.log('📝 Creating new report for user:', actualUserId);

        const newReport = await transaction(async (client) => {
            // Check if user exists
            const userCheckQuery = `SELECT id FROM users WHERE id = $1`;
            const userExists = await client.query(userCheckQuery, [actualUserId]);

            if (userExists.rows.length === 0) {
                throw new Error('User not found');
            }

            // Compute priority - use auto-priority if priority is 'auto' or missing
            let finalPriority = priority || 'auto';
            if (finalPriority === 'auto') {
                try {
                    finalPriority = await computeAutoPriority(
                        client,
                        latitude || 0,
                        longitude || 0,
                        category || '',
                        30,      // window in days
                        500      // radius in meters to consider "nearby area"
                    );
                    console.log('✅ Auto-priority computed as:', finalPriority);
                } catch (err) {
                    console.warn('⚠️ Priority auto-compute failed, falling back to medium:', err);
                    finalPriority = 'medium';
                }
            }

            // Create the report
            const insertQuery = `
                INSERT INTO reports (
                    user_id,
                    title,
                    description,
                    category,
                    priority,
                    media_urls,
                    audio_url,
                    latitude,
                    longitude,
                    address,
                    department
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `;

            const result = await client.query(insertQuery, [
                actualUserId,
                title,
                description || '',
                category || 'other',
                finalPriority,
                actualMediaUrls,
                actualAudioUrl || null,
                latitude || null,
                longitude || null,
                address || '',
                department || 'General'
            ]);

            const createdReport = result.rows[0];

            // Update user's total_reports count
            const updateUserQuery = `
                UPDATE users 
                SET total_reports = total_reports + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `;
            await client.query(updateUserQuery, [actualUserId]);

            return createdReport;
        });

        console.log('✅ Report created successfully:', newReport.id);

        // Auto-create social post for the report (make it public by default)
        try {
            console.log('📱 Auto-creating social post for report:', newReport.id);
            
            // Create social post entry directly without importing (to avoid circular dependency)
            const socialPostQuery = `
                INSERT INTO social_posts (
                    report_id,
                    user_id,
                    is_public,
                    is_anonymous,
                    upvotes,
                    downvotes,
                    total_score,
                    comment_count,
                    share_count,
                    view_count,
                    is_trending,
                    is_featured,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
            `;
            
            const socialPostResult = await query(socialPostQuery, [
                newReport.id,
                actualUserId,
                true,  // is_public = true by default
                false  // is_anonymous = false by default
            ]);

            console.log('✅ Social post auto-created:', socialPostResult.rows[0]?.id);
        } catch (socialError) {
            console.warn('⚠️ Auto-creation of social post failed (report still created):', socialError.message);
            // Don't fail the report creation if social post creation fails
        }

        // Invalidate relevant caches after creating a new report
        try {
            // Invalidate admin report caches since a new report was added
            await redisService.invalidateAdminReports();
            
            // Also invalidate social posts cache since we created a social post
            await redisService.invalidatePattern('social_posts:*');
            
            // Invalidate user reports cache for this user
            const userCachePattern = `reports:user_reports:${actualUserId}:*`;
            const userKeys = await redisService.scanKeys(userCachePattern);
            if (userKeys.length > 0) {
                await redisService.del(userKeys);
                console.log(`🗑️ Invalidated ${userKeys.length} user report cache entries`);
            }
            
            // If location is provided, invalidate nearby reports cache
            if (newReport.latitude && newReport.longitude) {
                // Invalidate nearby reports (use a broader pattern to catch location-based caches)
                const nearbyPattern = `reports:nearby_reports:*:*:*:*:*:${actualUserId}`;
                const nearbyKeys = await redisService.scanKeys(nearbyPattern);
                if (nearbyKeys.length > 0) {
                    await redisService.del(nearbyKeys);
                    console.log(`🗑️ Invalidated ${nearbyKeys.length} nearby report cache entries`);
                }
            }
            
            console.log('🧹 Cache invalidation completed for new report');
        } catch (cacheError) {
            console.warn('⚠️ Cache invalidation failed:', cacheError.message);
            // Don't fail the request if cache invalidation fails
        }

        // Map database fields to camelCase
        const mappedReport = {
            id: newReport.id,
            userId: newReport.user_id,
            title: newReport.title,
            description: newReport.description,
            category: newReport.category,
            priority: newReport.priority,
            mediaUrls: newReport.media_urls,
            audioUrl: newReport.audio_url,
            latitude: newReport.latitude,
            longitude: newReport.longitude,
            address: newReport.address,
            department: newReport.department,
            isResolved: newReport.is_resolved,
            createdAt: toISO(newReport.created_at),
            resolvedAt: toISO(newReport.resolved_at),
            resolvedMediaUrls: newReport.resolved_media_urls,
            resolutionNotes: newReport.resolution_note,
            resolvedByAdminId: newReport.resolved_by_admin_id,
            timeTakenToResolve: newReport.time_taken_to_resolve
        };

        res.status(201).json({
            success: true,
            message: 'Report created successfully',
            report: mappedReport
        });

    } catch (error) {
        console.error('❌ Error creating report:', error);
        
        if (error.message === 'User not found') {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while creating report',
            error: error.message
        });
    }
};

// Get all reports for a specific user
const getUserReports = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isResolved, category, priority, limit = 50, offset = 0 } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        console.log('🔍 Fetching reports for user:', userId);

        // Create cache key based on all parameters
        const cacheKey = `user_reports:${userId}:${isResolved || 'all'}:${category || 'all'}:${priority || 'all'}:${limit}:${offset}`;
        
        // Try to get from Redis cache first
        const cachedReports = await redisService.getCachedReports(cacheKey);
        if (cachedReports) {
            console.log('📦 Returning cached user reports');
            return res.status(200).json({
                success: true,
                reports: cachedReports.reports,
                pagination: cachedReports.pagination,
                cached: true
            });
        }

        // Build dynamic query based on filters
        let baseQuery = `
            SELECT 
                r.*,
                admins.full_name as resolved_by,
                admins.role as resolved_by_role
            FROM reports r
            LEFT JOIN admins ON r.resolved_by_admin_id = admins.id
            WHERE r.user_id = $1
        `;
        const queryParams = [userId];
        let paramIndex = 2;

        if (isResolved !== undefined) {
            baseQuery += ` AND is_resolved = $${paramIndex}`;
            queryParams.push(isResolved === 'true');
            paramIndex++;
        }

        if (category) {
            baseQuery += ` AND category = $${paramIndex}`;
            queryParams.push(category);
            paramIndex++;
        }

        if (priority) {
            baseQuery += ` AND priority = $${paramIndex}`;
            queryParams.push(priority);
            paramIndex++;
        }

        baseQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await query(baseQuery, queryParams);

        // Map all reports to camelCase
        const mappedReports = result.rows.map(report => ({
            id: report.id,
            userId: report.user_id,
            title: report.title,
            description: report.description,
            category: report.category,
            priority: report.priority,
            mediaUrls: report.media_urls,
            audioUrl: report.audio_url,
            latitude: report.latitude,
            longitude: report.longitude,
            address: report.address,
            department: report.department,
            isResolved: report.is_resolved,
            createdAt: toISO(report.created_at),
            resolvedAt: toISO(report.resolved_at),
            resolvedMediaUrls: report.resolved_media_urls,
            resolutionNotes: report.resolution_note,
            resolvedByAdminId: report.resolved_by_admin_id,
            resolvedBy: report.resolved_by,
            resolvedByRole: report.resolved_by_role,
            timeTakenToResolve: report.time_taken_to_resolve
        }));

        console.log(`✅ Found ${mappedReports.length} reports for user`);

        const responseData = {
            reports: mappedReports,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: mappedReports.length
            }
        };

        // Cache the results for 5 minutes
        await redisService.cacheReports(cacheKey, responseData, 300);

        res.status(200).json({
            success: true,
            ...responseData
        });

    } catch (error) {
        console.error('❌ Error fetching user reports:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching reports',
            error: error.message
        });
    }
};

// Get a specific report by ID
const getReportById = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { userId } = req.query; // Optional: to ensure user owns the report

        if (!reportId) {
            return res.status(400).json({
                success: false,
                message: "Report ID is required"
            });
        }

        console.log('🔍 Fetching report:', reportId);

        let reportQuery = `
            SELECT
                r.*,
                users.full_name as user_name,
                users.email as user_email,
                users.phone_number as user_phone,
                resolved_admin.full_name as resolved_by,
                resolved_admin.role as resolved_by_role,
                assigned_admin.id as assigned_admin_id,
                assigned_admin.full_name as assigned_admin_name,
                assigned_admin.email as assigned_admin_email,
                assigned_admin.role as assigned_admin_role,
                COALESCE(sp.upvotes, 0) as upvotes,
                COALESCE(sp.downvotes, 0) as downvotes,
                COALESCE(sp.view_count, 0) as view_count,
                COALESCE(sp.share_count, 0) as share_count
            FROM reports r
            LEFT JOIN users ON r.user_id = users.id
            LEFT JOIN admins resolved_admin ON r.resolved_by_admin_id = resolved_admin.id
            LEFT JOIN admins assigned_admin ON r.assigned_admin_id = assigned_admin.id
            LEFT JOIN social_posts sp ON r.id = sp.report_id
            WHERE r.id = $1
        `;
        const queryParams = [reportId];

        // If userId is provided, ensure the report belongs to the user
        if (userId) {
            reportQuery += ` AND r.user_id = $2`;
            queryParams.push(userId);
        }

        const report = await queryOne(reportQuery, queryParams);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }

        // Map to camelCase
        const mappedReport = {
            id: report.id,
            userId: report.user_id,
            userName: report.user_name,
            userEmail: report.user_email,
            userPhone: report.user_phone,
            title: report.title,
            description: report.description,
            category: report.category,
            priority: report.priority,
            mediaUrls: report.media_urls,
            audioUrl: report.audio_url,
            latitude: report.latitude,
            longitude: report.longitude,
            address: report.address,
            department: report.department,
            isResolved: report.is_resolved,
            status: report.status,
            assignedAdminId: report.assigned_admin_id,
            assignedAdminName: report.assigned_admin_name,
            assignedAdminEmail: report.assigned_admin_email,
            assignedAdminRole: report.assigned_admin_role,
            createdAt: toISO(report.created_at),
            updatedAt: toISO(report.updated_at),
            resolvedAt: toISO(report.resolved_at),
            resolvedMediaUrls: parseArrayField(report.resolved_media_urls),
            resolvedPhotos: parseArrayField(report.resolved_media_urls),
            resolutionNotes: report.resolution_note,
            resolvedByAdminId: report.resolved_by_admin_id,
            resolvedBy: report.resolved_by,
            resolvedByRole: report.resolved_by_role,
            timeTakenToResolve: report.time_taken_to_resolve,
            upvotes: report.upvotes,
            downvotes: report.downvotes,
            viewCount: report.view_count,
            shareCount: report.share_count,
            user: {
                fullName: report.user_name,
                email: report.user_email,
                phoneNumber: report.user_phone
            }
        };

        console.log('✅ Report found:', reportId);

        res.status(200).json({
            success: true,
            data: mappedReport,
            report: mappedReport,
            message: "Report fetched successfully"
        });

    } catch (error) {
        console.error('❌ Error fetching report:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching report',
            error: error.message
        });
    }
};

// Update a report
const updateReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const {
            title,
            description,
            category,
            priority,
            mediaUrls,
            audioUrl,
            latitude,
            longitude,
            address,
            department,
            userId // To ensure user owns the report
        } = req.body;

        if (!reportId) {
            return res.status(400).json({
                success: false,
                message: "Report ID is required"
            });
        }

        console.log('📝 Updating report:', reportId);

        const updatedReport = await transaction(async (client) => {
            // Check if report exists and belongs to user (if userId provided)
            let checkQuery = `SELECT * FROM reports WHERE id = $1`;
            const checkParams = [reportId];

            if (userId) {
                checkQuery += ` AND user_id = $2`;
                checkParams.push(userId);
            }

            const existingReport = await client.query(checkQuery, checkParams);

            if (existingReport.rows.length === 0) {
                throw new Error('Report not found or access denied');
            }

            // Check if report is already resolved
            if (existingReport.rows[0].is_resolved) {
                throw new Error('Cannot update a resolved report');
            }

            // Build dynamic update query
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            if (title !== undefined) {
                updateFields.push(`title = $${paramIndex}`);
                updateValues.push(title);
                paramIndex++;
            }

            if (description !== undefined) {
                updateFields.push(`description = $${paramIndex}`);
                updateValues.push(description);
                paramIndex++;
            }

            if (category !== undefined) {
                updateFields.push(`category = $${paramIndex}`);
                updateValues.push(category);
                paramIndex++;
            }

            if (priority !== undefined) {
                updateFields.push(`priority = $${paramIndex}`);
                updateValues.push(priority);
                paramIndex++;
            }

            if (mediaUrls !== undefined) {
                updateFields.push(`media_urls = $${paramIndex}`);
                updateValues.push(mediaUrls);
                paramIndex++;
            }

            if (audioUrl !== undefined) {
                updateFields.push(`audio_url = $${paramIndex}`);
                updateValues.push(audioUrl);
                paramIndex++;
            }

            if (latitude !== undefined) {
                updateFields.push(`latitude = $${paramIndex}`);
                updateValues.push(latitude);
                paramIndex++;
            }

            if (longitude !== undefined) {
                updateFields.push(`longitude = $${paramIndex}`);
                updateValues.push(longitude);
                paramIndex++;
            }

            if (address !== undefined) {
                updateFields.push(`address = $${paramIndex}`);
                updateValues.push(address);
                paramIndex++;
            }

            if (department !== undefined) {
                updateFields.push(`department = $${paramIndex}`);
                updateValues.push(department);
                paramIndex++;
            }

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            const updateQuery = `
                UPDATE reports 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            updateValues.push(reportId);

            const result = await client.query(updateQuery, updateValues);
            return result.rows[0];
        });

        // Map to camelCase
        const mappedReport = {
            id: updatedReport.id,
            userId: updatedReport.user_id,
            title: updatedReport.title,
            description: updatedReport.description,
            category: updatedReport.category,
            priority: updatedReport.priority,
            mediaUrls: updatedReport.media_urls,
            audioUrl: updatedReport.audio_url,
            latitude: updatedReport.latitude,
            longitude: updatedReport.longitude,
            address: updatedReport.address,
            department: updatedReport.department,
            isResolved: updatedReport.is_resolved,
            createdAt: toISO(updatedReport.created_at),
            resolvedAt: toISO(updatedReport.resolved_at),
            resolvedMediaUrls: updatedReport.resolved_media_urls,
            resolutionNotes: updatedReport.resolution_note,
            resolvedByAdminId: updatedReport.resolved_by_admin_id,
            timeTakenToResolve: updatedReport.time_taken_to_resolve
        };

        console.log('✅ Report updated successfully:', reportId);

        // Invalidate admin report caches since report was updated
        try {
            await redisService.invalidateAdminReports();
        } catch (cacheError) {
            console.warn('⚠️ Failed to invalidate admin report caches:', cacheError.message);
        }

        res.status(200).json({
            success: true,
            message: 'Report updated successfully',
            report: mappedReport
        });

    } catch (error) {
        console.error('❌ Error updating report:', error);
        
        if (error.message === 'Report not found or access denied') {
            return res.status(404).json({
                success: false,
                message: 'Report not found or access denied'
            });
        }
        
        if (error.message === 'Cannot update a resolved report') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update a resolved report'
            });
        }
        
        if (error.message === 'No fields to update') {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while updating report',
            error: error.message
        });
    }
};

// Mark report as resolved (Admin only)
const resolveReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { adminId, adminRole, resolutionNotes } = req.body;

        // Get uploaded files
        const resolvedPhotos = req.files && req.files.resolvedPhotos ? req.files.resolvedPhotos.map(file => file.path) : [];

        if (!reportId) {
            return res.status(400).json({
                success: false,
                message: "Report ID is required"
            });
        }

        if (!adminId || !adminRole) {
            return res.status(400).json({
                success: false,
                message: "Admin ID and role are required"
            });
        }

        // Validate admin role
        const validRoles = ['viewer', 'admin', 'super_admin'];
        if (!validRoles.includes(adminRole.toLowerCase())) {
            return res.status(403).json({
                success: false,
                message: "Invalid admin role"
            });
        }

        // Limit to maximum 2 photos
        if (resolvedPhotos.length > 2) {
            return res.status(400).json({
                success: false,
                message: "Maximum 2 photos allowed for resolution"
            });
        }

        console.log('✅ Resolving report:', reportId, 'by admin:', adminId, 'with', resolvedPhotos.length, 'photos');

        const resolvedReport = await transaction(async (client) => {
            // Verify admin exists and is active
            const adminCheckQuery = `SELECT id, role FROM admins WHERE id = $1 AND is_active = true`;
            const adminResult = await client.query(adminCheckQuery, [adminId]);

            if (adminResult.rows.length === 0) {
                throw new Error('Admin not found or inactive');
            }

            const admin = adminResult.rows[0];
            if (admin.role.toLowerCase() !== adminRole.toLowerCase()) {
                throw new Error('Admin role mismatch');
            }

            // Check if report exists
            const reportCheckQuery = `SELECT * FROM reports WHERE id = $1`;
            const existingReport = await client.query(reportCheckQuery, [reportId]);

            if (existingReport.rows.length === 0) {
                throw new Error('Report not found');
            }

            if (existingReport.rows[0].is_resolved) {
                throw new Error('Report is already resolved');
            }

            // Upload photos to Cloudinary if any
            let resolvedMediaUrls = [];
            if (resolvedPhotos.length > 0) {
                console.log('📤 Uploading resolved photos to Cloudinary...');
                for (const photoPath of resolvedPhotos) {
                    try {
                        console.log('📤 Uploading file:', photoPath);
                        const cloudinaryResult = await uploadOnCloudinary(photoPath);
                        if (cloudinaryResult && cloudinaryResult.url) {
                            resolvedMediaUrls.push(cloudinaryResult.url);
                            console.log('✅ Successfully uploaded:', cloudinaryResult.url);
                            
                            // Additional cleanup check - ensure file is deleted
                            try {
                                const fs = await import('fs');
                                if (fs.existsSync(photoPath)) {
                                    fs.unlinkSync(photoPath);
                                    console.log('🧹 Extra cleanup completed for:', photoPath);
                                } else {
                                    console.log('📁 File already cleaned up by uploadOnCloudinary:', photoPath);
                                }
                            } catch (extraCleanupError) {
                                console.error('⚠️ Extra cleanup failed (but upload succeeded):', photoPath, extraCleanupError);
                            }
                        } else {
                            console.error('❌ Upload failed for:', photoPath);
                            // Cleanup failed upload
                            try {
                                const fs = await import('fs');
                                if (fs.existsSync(photoPath)) {
                                    fs.unlinkSync(photoPath);
                                    console.log('🧹 Cleaned up failed upload file:', photoPath);
                                }
                            } catch (cleanupError) {
                                console.error('❌ Failed to cleanup failed upload file:', photoPath, cleanupError);
                            }
                        }
                    } catch (uploadError) {
                        console.error('❌ Error uploading photo:', photoPath, uploadError);
                        // The uploadOnCloudinary function should handle cleanup, but let's be extra safe
                        try {
                            const fs = await import('fs');
                            if (fs.existsSync(photoPath)) {
                                fs.unlinkSync(photoPath);
                                console.log('🧹 Manually cleaned up file after upload error:', photoPath);
                            }
                        } catch (cleanupError) {
                            console.error('❌ Failed to cleanup file:', photoPath, cleanupError);
                        }
                    }
                }
                console.log('✅ Uploaded', resolvedMediaUrls.length, 'resolved photos out of', resolvedPhotos.length);
            }

            // Mark as resolved with photos
            const resolveQuery = `
                UPDATE reports
                SET is_resolved = true,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_media_urls = $2,
                    resolution_note = $3,
                    resolved_by_admin_id = $4,
                    time_taken_to_resolve = AGE(CURRENT_TIMESTAMP, created_at)
                WHERE id = $1
                RETURNING *
            `;

            const result = await client.query(resolveQuery, [
                reportId,
                resolvedMediaUrls.length > 0 ? resolvedMediaUrls : null,
                resolutionNotes || null,
                adminId
            ]);
            const resolved = result.rows[0];

            // Update user's resolved_reports count
            const updateUserQuery = `
                UPDATE users
                SET resolved_reports = resolved_reports + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `;
            await client.query(updateUserQuery, [resolved.user_id]);

            // Send notification to user about report resolution
            try {
                await sendReportResolvedNotification(resolved.user_id, resolved.id, resolved.title || 'Your Report');
                console.log('✅ Notification sent to user for resolved report:', reportId);
            } catch (notificationError) {
                console.error('⚠️ Failed to send notification, but report was resolved:', notificationError);
                // Don't fail the entire operation if notification fails
            }

            // Invalidate Redis cache for this report
            try {
                const cacheKey = `report:${reportId}`;
                await redisService.delete(cacheKey);
                console.log('✅ Redis cache invalidated for resolved report:', reportId);
                
                // Also invalidate any list caches that might contain this report
                const listCachePatterns = [
                    'reports:*',
                    'nearby:*',
                    'user_reports:*',
                    'social_posts:*'
                ];
                
                for (const pattern of listCachePatterns) {
                    await redisService.deletePattern(pattern);
                }
                console.log('✅ Report list caches invalidated');
            } catch (cacheError) {
                console.error('⚠️ Failed to invalidate Redis cache:', cacheError);
                // Don't fail the operation if cache invalidation fails
            }

            return { resolved, uploadedPhotosCount: resolvedMediaUrls.length };
        });

        // Final cleanup - ensure all uploaded files are removed
        if (resolvedPhotos && resolvedPhotos.length > 0) {
            console.log('🧹 Final cleanup check for resolved photos...');
            const fs = await import('fs');
            for (const photoPath of resolvedPhotos) {
                try {
                    if (fs.existsSync(photoPath)) {
                        fs.unlinkSync(photoPath);
                        console.log('🧹 Final cleanup removed:', photoPath);
                    }
                } catch (finalCleanupError) {
                    console.error('❌ Final cleanup failed for:', photoPath, finalCleanupError);
                }
            }
        }

        // Map to camelCase
        const mappedReport = {
            id: resolvedReport.resolved.id,
            userId: resolvedReport.resolved.user_id,
            title: resolvedReport.resolved.title,
            description: resolvedReport.resolved.description,
            category: resolvedReport.resolved.category,
            priority: resolvedReport.resolved.priority,
            mediaUrls: resolvedReport.resolved.media_urls,
            audioUrl: resolvedReport.resolved.audio_url,
            latitude: resolvedReport.resolved.latitude,
            longitude: resolvedReport.resolved.longitude,
            address: resolvedReport.resolved.address,
            department: resolvedReport.resolved.department,
            isResolved: resolvedReport.resolved.is_resolved,
            createdAt: toISO(resolvedReport.resolved.created_at),
            resolvedAt: toISO(resolvedReport.resolved.resolved_at),
            resolvedMediaUrls: resolvedReport.resolved.resolved_media_urls,
            resolutionNotes: resolvedReport.resolved.resolution_note,
            resolvedByAdminId: resolvedReport.resolved.resolved_by_admin_id,
            timeTakenToResolve: resolvedReport.resolved.time_taken_to_resolve
        };

        console.log('✅ Report resolved successfully by admin:', adminId);

        // Invalidate admin report caches since report status changed
        try {
            await redisService.invalidateAdminReports();
        } catch (cacheError) {
            console.warn('⚠️ Failed to invalidate admin report caches:', cacheError.message);
        }

        res.status(200).json({
            success: true,
            message: 'Report marked as resolved',
            report: mappedReport,
            uploadedPhotos: resolvedReport.uploadedPhotosCount
        });

    } catch (error) {
        console.error('❌ Error resolving report:', error);
        
        if (error.message === 'Admin not found or inactive') {
            return res.status(403).json({
                success: false,
                message: "Admin not found or inactive"
            });
        }
        
        if (error.message === 'Admin role mismatch') {
            return res.status(403).json({
                success: false,
                message: "Admin role mismatch"
            });
        }
        
        if (error.message === 'Report not found') {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }
        
        if (error.message === 'Report is already resolved') {
            return res.status(400).json({
                success: false,
                message: 'Report is already resolved'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while resolving report',
            error: error.message
        });
    }
};

// Delete a report
const deleteReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { userId } = req.query; // Get from query params (optional for authorization)

        if (!reportId) {
            return res.status(400).json({
                success: false,
                message: "Report ID is required"
            });
        }

        console.log('🗑️ Deleting report:', reportId, userId ? `by user: ${userId}` : '(admin delete)');

        const deleteResult = await transaction(async (client) => {
            // First, get the report to check ownership and get user_id
            const getReportQuery = `SELECT * FROM reports WHERE id = $1`;
            const reportResult = await client.query(getReportQuery, [reportId]);

            if (reportResult.rows.length === 0) {
                throw new Error('Report not found');
            }

            const report = reportResult.rows[0];

            // If userId is provided, check if user owns the report
            if (userId && report.user_id !== userId) {
                throw new Error('Access denied: You can only delete your own reports');
            }

            // Delete the report
            const deleteQuery = `DELETE FROM reports WHERE id = $1 RETURNING *`;
            const result = await client.query(deleteQuery, [reportId]);

            // Update user's total_reports count
            const updateUserQuery = `
                UPDATE users 
                SET total_reports = GREATEST(total_reports - 1, 0),
                    resolved_reports = CASE 
                        WHEN $2 THEN GREATEST(resolved_reports - 1, 0)
                        ELSE resolved_reports 
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `;
            await client.query(updateUserQuery, [report.user_id, report.is_resolved]);

            return { reportId, userId: report.user_id, wasResolved: report.is_resolved };
        });

        console.log('✅ Report deleted successfully:', reportId);

        // Invalidate admin report caches since report was deleted
        try {
            await redisService.invalidateAdminReports();
        } catch (cacheError) {
            console.warn('⚠️ Failed to invalidate admin report caches:', cacheError.message);
        }

        res.status(200).json({
            success: true,
            message: 'Report deleted successfully',
            deletedReportId: reportId
        });

    } catch (error) {
        console.error('❌ Error deleting report:', error);
        
        if (error.message === 'Report not found') {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }
        
        if (error.message === 'Access denied: You can only delete your own reports') {
            return res.status(403).json({
                success: false,
                message: 'Access denied: You can only delete your own reports'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while deleting report',
            error: error.message
        });
    }
};

// Get nearby reports (for social feed)
const getNearbyReports = async (req, res) => {
    try {
        const { latitude, longitude, radius = 10, limit = 20, offset = 0, userId } = req.query;
        const currentUserId = req.userId || userId; // Use userId from query if no auth middleware

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required"
            });
        }

        console.log(`🌍 Fetching reports within ${radius}km of (${latitude}, ${longitude})`);

        // Create cache key based on location and parameters (round coordinates to reduce cache variations)
        const roundedLat = parseFloat(latitude).toFixed(3);
        const roundedLng = parseFloat(longitude).toFixed(3);
        const cacheKey = `nearby_reports:${roundedLat}:${roundedLng}:${radius}:${limit}:${offset}:${currentUserId}`;
        
        // Try to get from Redis cache first
        const cachedReports = await redisService.getCachedReports(cacheKey);
        if (cachedReports) {
            console.log('📦 Returning cached nearby reports');
            return res.status(200).json({
                success: true,
                reports: cachedReports.reports,
                pagination: cachedReports.pagination,
                cached: true
            });
        }

        // Using the haversine formula to calculate distance
        let nearbyQuery, queryParams;
        
        if (currentUserId) {
            // If user is identified, exclude their own reports
            nearbyQuery = `
                SELECT r.*, u.full_name as user_name,
                    admins.full_name as resolved_by,
                    admins.role as resolved_by_role,
                    (6371 * acos(cos(radians($1)) * cos(radians(r.latitude)) * 
                    cos(radians(r.longitude) - radians($2)) + 
                    sin(radians($1)) * sin(radians(r.latitude)))) AS distance
                FROM reports r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN admins ON r.resolved_by_admin_id = admins.id
                WHERE r.latitude IS NOT NULL 
                    AND r.longitude IS NOT NULL
                    AND r.user_id != $6
                    AND (6371 * acos(cos(radians($1)) * cos(radians(r.latitude)) * 
                         cos(radians(r.longitude) - radians($2)) + 
                         sin(radians($1)) * sin(radians(r.latitude)))) <= $3
                ORDER BY distance ASC, r.created_at DESC
                LIMIT $4 OFFSET $5 
            `;
            queryParams = [
                parseFloat(latitude),
                parseFloat(longitude),
                parseFloat(radius),
                parseInt(limit),
                parseInt(offset),
                currentUserId
            ];
        } else {
            // If no user is identified, show all nearby reports
            nearbyQuery = `
                SELECT r.*, u.full_name as user_name,
                    admins.full_name as resolved_by,
                    admins.role as resolved_by_role,
                    (6371 * acos(cos(radians($1)) * cos(radians(r.latitude)) * 
                    cos(radians(r.longitude) - radians($2)) + 
                    sin(radians($1)) * sin(radians(r.latitude)))) AS distance
                FROM reports r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN admins ON r.resolved_by_admin_id = admins.id
                WHERE r.latitude IS NOT NULL 
                    AND r.longitude IS NOT NULL
                    AND (6371 * acos(cos(radians($1)) * cos(radians(r.latitude)) * 
                         cos(radians(r.longitude) - radians($2)) + 
                         sin(radians($1)) * sin(radians(r.latitude)))) <= $3
                ORDER BY distance ASC, r.created_at DESC
                LIMIT $4 OFFSET $5 
            `;
            queryParams = [
                parseFloat(latitude),
                parseFloat(longitude),
                parseFloat(radius),
                parseInt(limit),
                parseInt(offset)
            ];
        }

        const result = await query(nearbyQuery, queryParams);

        // Map reports to camelCase
        const mappedReports = result.rows.map(report => ({
            id: report.id,
            userId: report.user_id,
            userName: report.user_name,
            title: report.title,
            description: report.description,
            category: report.category,
            priority: report.priority,
            mediaUrls: report.media_urls,
            audioUrl: report.audio_url,
            latitude: report.latitude,
            longitude: report.longitude,
            address: report.address,
            department: report.department,
            isResolved: report.is_resolved,
            createdAt: toISO(report.created_at),
            resolvedAt: toISO(report.resolved_at),
            resolvedMediaUrls: report.resolved_media_urls,
            resolutionNotes: report.resolution_note,
            resolvedByAdminId: report.resolved_by_admin_id,
            resolvedBy: report.resolved_by,
            resolvedByRole: report.resolved_by_role,
            timeTakenToResolve: report.time_taken_to_resolve,
            distance: parseFloat(report.distance).toFixed(2)
        }));

        console.log(`✅ Found ${mappedReports.length} nearby reports`);

        const responseData = {
            reports: mappedReports,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: mappedReports.length
            },
            location: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                radius: parseFloat(radius)
            }
        };

        // Cache the results for 3 minutes (shorter cache for location-based data)
        await redisService.cacheReports(cacheKey, responseData, 180);

        res.status(200).json({
            success: true,
            ...responseData
        });

    } catch (error) {
        console.error('❌ Error fetching nearby reports:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching nearby reports',
            error: error.message
        });
    }
};

// Get reports statistics for a user
const getUserReportsStats = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        console.log('📊 Fetching report statistics for user:', userId);

        const statsQuery = `
            SELECT 
                COUNT(*) as total_reports,
                COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved_reports,
                COUNT(CASE WHEN is_resolved = false THEN 1 END) as pending_reports,
                COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical_reports,
                COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_reports,
                COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as reports_last_30_days,
                AVG(CASE WHEN is_resolved = true THEN 
                    EXTRACT(EPOCH FROM (resolved_at - created_at))/3600 
                END) as avg_resolution_time_hours
            FROM reports 
            WHERE user_id = $1
        `;

        const stats = await queryOne(statsQuery, [userId]);

        const mappedStats = {
            totalReports: parseInt(stats.total_reports),
            resolvedReports: parseInt(stats.resolved_reports),
            pendingReports: parseInt(stats.pending_reports),
            criticalReports: parseInt(stats.critical_reports),
            highPriorityReports: parseInt(stats.high_priority_reports),
            reportsLast30Days: parseInt(stats.reports_last_30_days),
            avgResolutionTimeHours: stats.avg_resolution_time_hours ? 
                parseFloat(stats.avg_resolution_time_hours).toFixed(2) : null
        };

        console.log('✅ Statistics fetched successfully');

        res.status(200).json({
            success: true,
            stats: mappedStats
        });

    } catch (error) {
        console.error('❌ Error fetching report statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching statistics',
            error: error.message
        });
    }
};

// Upload multiple media files for reports
const uploadReportMedia = async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        console.log('📁 Uploading report media for user:', userId);
        console.log('📄 Files received:', {
            mediaFiles: req.files?.mediaFiles?.length || 0,
            audioFile: req.files?.audioFile?.length || 0
        });

        const uploadedUrls = {
            mediaUrls: [],
            audioUrl: null
        };

        // Upload media files (images/videos)
        if (req.files?.mediaFiles) {
            console.log('📸 Uploading media files...');
            for (const mediaFile of req.files.mediaFiles) {
                try {
                    const cloudinaryResponse = await uploadOnCloudinary(mediaFile.path);
                    if (cloudinaryResponse) {
                        uploadedUrls.mediaUrls.push(cloudinaryResponse.secure_url);
                        console.log('✅ Media file uploaded:', cloudinaryResponse.secure_url);
                    } else {
                        console.error('❌ Failed to upload media file:', mediaFile.originalname);
                    }
                } catch (uploadError) {
                    console.error('❌ Error uploading media file:', uploadError);
                }
            }
        }

        // Upload audio file
        if (req.files?.audioFile && req.files.audioFile[0]) {
            console.log('🎤 Uploading audio file...');
            try {
                const audioFile = req.files.audioFile[0];
                const cloudinaryResponse = await uploadOnCloudinary(audioFile.path);
                if (cloudinaryResponse) {
                    uploadedUrls.audioUrl = cloudinaryResponse.secure_url;
                    console.log('✅ Audio file uploaded:', cloudinaryResponse.secure_url);
                } else {
                    console.error('❌ Failed to upload audio file');
                }
            } catch (uploadError) {
                console.error('❌ Error uploading audio file:', uploadError);
            }
        }

        console.log('📋 Upload summary:', uploadedUrls);

        res.status(200).json({
            success: true,
            message: 'Media files uploaded successfully',
            mediaUrls: uploadedUrls.mediaUrls,
            audioUrl: uploadedUrls.audioUrl
        });

    } catch (error) {
        console.error('❌ Error uploading report media:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while uploading media',
            error: error.message
        });
    }
};

// Upload single media file
const uploadSingleMedia = async (req, res) => {
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
                message: "No file uploaded"
            });
        }

        console.log('📁 Uploading single media for user:', userId);
        console.log('📄 File:', req.file.originalname);

        const cloudinaryResponse = await uploadOnCloudinary(req.file.path);
        
        if (!cloudinaryResponse) {
            return res.status(500).json({
                success: false,
                message: 'Failed to upload file to cloud storage'
            });
        }

        console.log('✅ File uploaded successfully:', cloudinaryResponse.secure_url);

        res.status(200).json({
            success: true,
            message: 'Media file uploaded successfully',
            mediaUrl: cloudinaryResponse.secure_url
        });

    } catch (error) {
        console.error('❌ Error uploading single media:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while uploading media',
            error: error.message
        });
    }
};

const getCommunityStats = async (req, res) => {
    try {
        console.log('📊 Fetching community statistics');

        const statsQuery = `
            SELECT
                COUNT(*) as total_reports,
                COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved_reports,
                ROUND(
                    CASE
                        WHEN COUNT(*) > 0 THEN
                            (COUNT(CASE WHEN is_resolved = true THEN 1 END)::decimal / COUNT(*)::decimal) * 100
                        ELSE 0
                    END,
                    1
                ) as resolution_rate_percentage,
                ROUND(
                    AVG(
                        CASE
                            WHEN is_resolved = true AND resolved_at IS NOT NULL THEN
                                EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400
                            ELSE NULL
                        END
                    ),
                    1
                ) as avg_resolution_time_days
            FROM reports
        `;

        const stats = await queryOne(statsQuery);

        // Format the response to match the frontend expectations
        const formattedStats = {
            totalReports: parseInt(stats.total_reports) || 0,
            resolvedReports: parseInt(stats.resolved_reports) || 0,
            resolutionRate: parseFloat(stats.resolution_rate_percentage) || 0,
            avgResponseTime: stats.avg_resolution_time_days ? `${stats.avg_resolution_time_days}` : '0.0'
        };

        console.log('✅ Community stats fetched successfully:', formattedStats);

        res.status(200).json({
            success: true,
            message: 'Community statistics fetched successfully',
            stats: formattedStats
        });

    } catch (error) {
        console.error('❌ Error fetching community statistics:', error);

        res.status(500).json({
            success: false,
            message: 'Server error while fetching community statistics',
            error: error.message
        });
    }
};

const getAdminReports = async (req, res) => {
    try {
        const { adminId } = req.params;
        const {
            isResolved,
            category,
            priority,
            department,
            limit = 50,
            offset = 0,
            status
        } = req.query;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: "Admin ID is required"
            });
        }

        console.log('🔍 Fetching reports for admin:', adminId);

        // First, get the admin's role and department
        const adminQuery = `
            SELECT role, department, is_active
            FROM admins
            WHERE id = $1 AND is_active = true
        `;
        const admin = await queryOne(adminQuery, [adminId]);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found or inactive"
            });
        }

        const adminRole = admin.role.toLowerCase();
        const adminDepartment = admin.department;

        console.log('👤 Admin role:', adminRole, 'Department:', adminDepartment);

        // Create cache key based on admin info and all parameters
        const cacheKey = `admin_reports:${adminId}:${adminRole}:${adminDepartment || 'none'}:${isResolved || 'all'}:${category || 'all'}:${priority || 'all'}:${department || 'all'}:${status || 'all'}:${limit}:${offset}`;
        
        // Try to get from Redis cache first
        const cachedReports = await redisService.getCachedReports(cacheKey);
        if (cachedReports) {
            console.log('📦 Returning cached admin reports');
            return res.status(200).json({
                success: true,
                reports: cachedReports.reports,
                pagination: cachedReports.pagination,
                adminInfo: cachedReports.adminInfo,
                message: cachedReports.message,
                cached: true
            });
        }

        // Build dynamic query based on role and filters
        let baseQuery = `
            SELECT
                r.*,
                u.full_name as user_name,
                u.phone_number as user_phone,
                assigned_admin.full_name as assigned_admin_name,
                assigned_admin.email as assigned_admin_email
            FROM reports r
            LEFT JOIN users u ON r.user_id = u.id
            LEFT JOIN admins assigned_admin ON r.assigned_admin_id = assigned_admin.id
            WHERE 1=1
        `;
        const queryParams = [];
        let paramIndex = 1;

        // Apply role-based filtering
        if (adminRole === 'viewer') {
            // Viewers can only see reports from their department
            if (!adminDepartment) {
                return res.status(403).json({
                    success: false,
                    message: "Viewer admin must have a department assigned"
                });
            }
            baseQuery += ` AND LOWER(r.department) = LOWER($${paramIndex})`;
            queryParams.push(adminDepartment);
            paramIndex++;
        }
        // Admins and super_admins can see all reports (no additional WHERE clause needed)

        // Apply additional filters
        if (isResolved !== undefined) {
            baseQuery += ` AND r.is_resolved = $${paramIndex}`;
            queryParams.push(isResolved === 'true');
            paramIndex++;
        }

        if (category) {
            baseQuery += ` AND r.category = $${paramIndex}`;
            queryParams.push(category);
            paramIndex++;
        }

        if (priority) {
            baseQuery += ` AND r.priority = $${paramIndex}`;
            queryParams.push(priority);
            paramIndex++;
        }

        if (department && adminRole !== 'viewer') {
            // Only allow department filtering for non-viewer roles
            baseQuery += ` AND LOWER(r.department) = LOWER($${paramIndex})`;
            queryParams.push(department);
            paramIndex++;
        }

        if (status) {
            baseQuery += ` AND r.status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        // Add ordering and pagination
        baseQuery += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        console.log('📋 Final query:', baseQuery);
        console.log('📋 Query params:', queryParams);

        const result = await query(baseQuery, queryParams);

        // Get total count for pagination - build separate count query
        let countQuery = `
            SELECT COUNT(*) as total
            FROM reports r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE 1=1
        `;
        const countParams = [];

        // Apply the same filters for count query
        let countParamIndex = 1;

        // Apply role-based filtering for count
        if (adminRole === 'viewer') {
            if (!adminDepartment) {
                return res.status(403).json({
                    success: false,
                    message: "Viewer admin must have a department assigned"
                });
            }
            countQuery += ` AND LOWER(r.department) = LOWER($${countParamIndex})`;
            countParams.push(adminDepartment);
            countParamIndex++;
        }

        // Apply additional filters for count
        if (isResolved !== undefined) {
            countQuery += ` AND r.is_resolved = $${countParamIndex}`;
            countParams.push(isResolved === 'true');
            countParamIndex++;
        }

        if (category) {
            countQuery += ` AND r.category = $${countParamIndex}`;
            countParams.push(category);
            countParamIndex++;
        }

        if (priority) {
            countQuery += ` AND r.priority = $${countParamIndex}`;
            countParams.push(priority);
            countParamIndex++;
        }

        if (department && adminRole !== 'viewer') {
            countQuery += ` AND LOWER(r.department) = LOWER($${countParamIndex})`;
            countParams.push(department);
            countParamIndex++;
        }

        if (status) {
            countQuery += ` AND r.status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }

        const countResult = await query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0]?.total || 0);

        // Map all reports to camelCase
        const mappedReports = result.rows.map(report => ({
            id: report.id,
            userId: report.user_id,
            userName: report.user_name,
            userPhone: report.user_phone,
            title: report.title,
            description: report.description,
            category: report.category,
            priority: report.priority,
            mediaUrls: report.media_urls,
            audioUrl: report.audio_url,
            latitude: report.latitude,
            longitude: report.longitude,
            address: report.address,
            department: report.department,
            isResolved: report.is_resolved,
            resolvedBy: report.resolved_by,
            resolutionNote: report.resolution_note,
            resolvedMediaUrls: parseArrayField(report.resolved_media_urls),
            resolvedPhotos: parseArrayField(report.resolved_media_urls),
            timeTakenToResolve: report.time_taken_to_resolve,
            status: report.status,
            assignedAdminId: report.assigned_admin_id,
            assignedAdminName: report.assigned_admin_name,
            assignedAdminEmail: report.assigned_admin_email,
            createdAt: toISO(report.created_at),
            updatedAt: toISO(report.updated_at)
        }));

        console.log(`✅ Found ${mappedReports.length} reports for admin ${adminId} (role: ${adminRole})`);

        const responseData = {
            reports: mappedReports,
            pagination: {
                total: totalCount,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
            },
            adminInfo: {
                role: adminRole,
                department: adminDepartment,
                canViewAllDepartments: adminRole !== 'viewer'
            },
            message: `Reports fetched successfully for ${adminRole}`
        };

        // Cache the results for 10 minutes (longer cache for admin data)
        await redisService.cacheReports(cacheKey, responseData, 600);

        res.status(200).json({
            success: true,
            ...responseData
        });

    } catch (error) {
        console.error('❌ Error fetching admin reports:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Assign report to field admin
const assignReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { assignedAdminId, assignedBy } = req.body;

        console.log('🔄 Assigning report:', reportId, 'to admin:', assignedAdminId);

        if (!assignedAdminId) {
            return res.status(400).json({
                success: false,
                message: "Field admin ID is required"
            });
        }

        // Verify the field admin exists and is active
        const adminCheckQuery = `
            SELECT id, email, full_name, role, is_active
            FROM admins
            WHERE id = $1
        `;
        
        const adminResult = await queryOne(adminCheckQuery, [assignedAdminId]);

        if (!adminResult) {
            return res.status(404).json({
                success: false,
                message: "Field admin not found"
            });
        }

        if (!adminResult.is_active) {
            return res.status(400).json({
                success: false,
                message: "Field admin is not active"
            });
        }

        // Check if report exists
        const reportCheckQuery = `
            SELECT id, title, is_resolved, status
            FROM reports
            WHERE id = $1
        `;
        
        const reportResult = await queryOne(reportCheckQuery, [reportId]);

        if (!reportResult) {
            return res.status(404).json({
                success: false,
                message: "Report not found"
            });
        }

        if (reportResult.is_resolved) {
            return res.status(400).json({
                success: false,
                message: "Cannot assign an already resolved report"
            });
        }

        // Update the report with assigned admin
        const updateQuery = `
            UPDATE reports
            SET 
                assigned_admin_id = $1,
                status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;

        const result = await queryOne(updateQuery, [assignedAdminId, reportId]);

        console.log('✅ Report assigned successfully:', reportId);

        // Map the result to camelCase
        const mappedReport = {
            id: result.id,
            assignedAdminId: result.assigned_admin_id,
            status: result.status,
            updatedAt: toISO(result.updated_at),
            assignedTo: {
                id: adminResult.id,
                name: adminResult.full_name,
                email: adminResult.email,
                role: adminResult.role
            }
        };

        res.status(200).json({
            success: true,
            message: `Report assigned to ${adminResult.full_name}`,
            data: mappedReport
        });

    } catch (error) {
        console.error('❌ Error assigning report:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

export {
    createReport,
    getUserReports,
    getReportById,
    updateReport,
    resolveReport,
    deleteReport,
    getNearbyReports,
    getUserReportsStats,
    getCommunityStats,
    uploadReportMedia,
    uploadSingleMedia,
    getAdminReports,
    assignReport
};
