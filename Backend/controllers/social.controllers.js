import { query, queryOne, transaction } from "../db/utils.js";
import redisService from "../services/redis.js";

// Helper to convert DB timestamp values to ISO strings (null-safe)
const toISO = (val) => (val ? new Date(val).toISOString() : null);

// Create a social post from an existing report
const createSocialPost = async (req, res) => {
    try {
        const { reportId, isPublic = true, isAnonymous = false } = req.body;
        const userId = req.userId || req.body.userId;

        if (!reportId) {
            return res.status(400).json({
                success: false,
                message: "Report ID is required"
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User authentication required"
            });
        }

        console.log('📱 Creating social post for report:', reportId, 'by user:', userId);

        const socialPost = await transaction(async (client) => {
            // Check if report exists and belongs to user
            const reportQuery = `
                SELECT id, user_id, title, description, category, priority, 
                       is_resolved, latitude, longitude, address, department
                FROM reports 
                WHERE id = $1 AND user_id = $2
            `;
            const report = await client.query(reportQuery, [reportId, userId]);

            if (report.rows.length === 0) {
                throw new Error('Report not found or access denied');
            }

            // Check if social post already exists for this report
            const existingPostQuery = `
                SELECT id FROM social_posts WHERE report_id = $1
            `;
            const existingPost = await client.query(existingPostQuery, [reportId]);

            if (existingPost.rows.length > 0) {
                throw new Error('Social post already exists for this report');
            }

            // Create social post
            const createPostQuery = `
                INSERT INTO social_posts (report_id, user_id, is_public, is_anonymous)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            
            const result = await client.query(createPostQuery, [
                reportId, 
                userId, 
                isPublic,
                isAnonymous
            ]);

            return result.rows[0];
        });

        // Invalidate cache
        await redisService.invalidatePattern('social_posts:*');

        console.log('✅ Social post created successfully:', socialPost.id);

        res.status(201).json({
            success: true,
            message: "Social post created successfully",
            post: {
                id: socialPost.id,
                reportId: socialPost.report_id,
                userId: socialPost.user_id,
                isPublic: socialPost.is_public,
                isAnonymous: socialPost.is_anonymous,
                upvotes: socialPost.upvotes,
                downvotes: socialPost.downvotes,
                totalScore: socialPost.total_score,
                commentCount: socialPost.comment_count,
                shareCount: socialPost.share_count,
                viewCount: socialPost.view_count,
                createdAt: toISO(socialPost.created_at),
                updatedAt: toISO(socialPost.updated_at)
            }
        });

    } catch (error) {
        console.error('❌ Error creating social post:', error);
        
        if (error.message === 'Report not found or access denied') {
            return res.status(404).json({
                success: false,
                message: 'Report not found or access denied'
            });
        }
        
        if (error.message === 'Social post already exists for this report') {
            return res.status(400).json({
                success: false,
                message: 'Social post already exists for this report'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while creating social post',
            error: error.message
        });
    }
};

// Get social posts with filters and pagination
const getSocialPosts = async (req, res) => {
    try {
        const {
            tab = 'all', // all, trending, nearby, my_activity
            limit = 20,
            offset = 0,
            latitude,
            longitude,
            radius = 10, // km
            category,
            priority
        } = req.query;

        // Handle userId from different sources - for GET requests, userId might come from query params
        const requestingUserId = req.userId || req.body?.userId || req.query?.userId || null;

        console.log('🔍 Fetching social posts:', { tab, limit, offset, requestingUserId, query: req.query });

        // Create cache key
        const cacheKey = `social_posts:${tab}:${limit}:${offset}:${requestingUserId || 'guest'}:${latitude || 'none'}:${longitude || 'none'}:${radius}:${category || 'all'}:${priority || 'all'}`;
        
        // Try cache first
        const cachedPosts = await redisService.getCachedReports(cacheKey);
        if (cachedPosts) {
            console.log('📦 Returning cached social posts');
            return res.status(200).json({
                success: true,
                posts: cachedPosts.posts,
                pagination: cachedPosts.pagination,
                cached: true
            });
        }

        let baseQuery = `
            SELECT 
                sp.id,
                sp.report_id,
                sp.user_id,
                sp.is_public,
                sp.is_anonymous,
                sp.upvotes,
                sp.downvotes,
                sp.total_score,
                sp.comment_count,
                sp.share_count,
                sp.view_count,
                sp.is_trending,
                sp.is_featured,
                sp.created_at,
                sp.updated_at,
                r.title,
                r.description,
                r.category,
                r.priority,
                r.is_resolved,
                r.latitude,
                r.longitude,
                r.address,
                r.department,
                r.media_urls,
                r.created_at as report_created_at,
                u.full_name as user_name,
                u.phone_number as user_phone,
                u.profile_image_url as user_profile_image_url,
                CASE 
                    WHEN sv.vote_type = 'upvote' THEN 'upvote'
                    WHEN sv.vote_type = 'downvote' THEN 'downvote'
                    ELSE NULL
                END as user_vote
            FROM social_posts sp
            LEFT JOIN reports r ON sp.report_id = r.id
            LEFT JOIN users u ON sp.user_id = u.id
        `;

        const queryParams = [];
        let paramIndex = 1;

        // Only add the LEFT JOIN for votes if we have a requesting user
        if (requestingUserId) {
            baseQuery += ` LEFT JOIN social_votes sv ON sp.id = sv.post_id AND sv.user_id = $${paramIndex}`;
            queryParams.push(requestingUserId);
            paramIndex++;
        }

        baseQuery += ` WHERE sp.is_public = true`;

        // Apply filters based on tab
        if (tab === 'trending') {
            baseQuery += ` AND (sp.total_score > 5 OR sp.comment_count > 3 OR sp.view_count > 50)`;
        } else if (tab === 'my_activity' && requestingUserId) {
            baseQuery += ` AND sp.user_id = $${paramIndex}`;
            queryParams.push(requestingUserId);
            paramIndex++;
        } else if (tab === 'nearby' && latitude && longitude) {
            baseQuery += ` AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
                AND (
                    6371 * acos(
                        cos(radians($${paramIndex})) * cos(radians(r.latitude)) *
                        cos(radians(r.longitude) - radians($${paramIndex + 1})) +
                        sin(radians($${paramIndex})) * sin(radians(r.latitude))
                    ) <= $${paramIndex + 2}
                )`;
            queryParams.push(parseFloat(latitude), parseFloat(longitude), parseFloat(radius));
            paramIndex += 3;
        }

        // Apply category filter
        if (category) {
            baseQuery += ` AND r.category = $${paramIndex}`;
            queryParams.push(category);
            paramIndex++;
        }

        // Apply priority filter
        if (priority) {
            baseQuery += ` AND r.priority = $${paramIndex}`;
            queryParams.push(priority);
            paramIndex++;
        }

        // Add ordering and pagination
        if (tab === 'trending') {
            baseQuery += ` ORDER BY sp.total_score DESC, sp.created_at DESC`;
        } else {
            baseQuery += ` ORDER BY sp.created_at DESC`;
        }

        baseQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await query(baseQuery, queryParams);

        const posts = result.rows.map(post => ({
            id: post.id,
            reportId: post.report_id,
            userId: post.user_id,
            title: post.title || 'Untitled Post',
            content: post.description || '',
            createdAt: post.created_at,
            updatedAt: post.updated_at,
            upvoteCount: post.upvotes || 0,
            downvoteCount: post.downvotes || 0,
            commentCount: post.comment_count || 0,
            viewCount: post.view_count || 0,
            userVote: post.user_vote,
            report: {
                category: post.category,
                priority: post.priority,
                status: post.is_resolved ? 'Resolved' : 'Submitted',
                latitude: post.latitude,
                longitude: post.longitude,
                address: post.address,
                department: post.department,
                mediaUrls: post.media_urls || []
            },
            user: {
                id: post.user_id,
                fullName: post.is_anonymous ? 'Anonymous' : (post.user_name || 'User'),
                profileImageUrl: post.is_anonymous ? null : post.user_profile_image_url
            }
        }));

        const responseData = {
            posts: posts,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: posts.length === parseInt(limit),
                total: posts.length
            }
        };

        // Cache results for 5 minutes
        await redisService.cacheReports(cacheKey, responseData, 300);

        console.log(`✅ Found ${posts.length} social posts for tab: ${tab}`);

        res.status(200).json({
            success: true,
            ...responseData
        });

    } catch (error) {
        console.error('❌ Error fetching social posts:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching social posts',
            error: error.message
        });
    }
};

// Vote on a post (upvote/downvote)
const voteOnPost = async (req, res) => {
    try {
        const { postId } = req.params;
        const { voteType } = req.body; // 'upvote' or 'downvote'
        const userId = req.userId || req.body.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User authentication required"
            });
        }

        if (!['upvote', 'downvote'].includes(voteType)) {
            return res.status(400).json({
                success: false,
                message: "Vote type must be 'upvote' or 'downvote'"
            });
        }

        console.log('🗳️ User', userId, 'voting', voteType, 'on post', postId);

        const voteResult = await transaction(async (client) => {
            // Check if post exists
            const postQuery = `SELECT id FROM social_posts WHERE id = $1`;
            const post = await client.query(postQuery, [postId]);

            if (post.rows.length === 0) {
                throw new Error('Post not found');
            }

            // Check existing vote
            const existingVoteQuery = `
                SELECT vote_type FROM social_votes 
                WHERE post_id = $1 AND user_id = $2
            `;
            const existingVote = await client.query(existingVoteQuery, [postId, userId]);

            let upvoteChange = 0;
            let downvoteChange = 0;
            let actionTaken = '';

            if (existingVote.rows.length > 0) {
                const currentVote = existingVote.rows[0];
                
                if (currentVote.vote_type === voteType) {
                    // Remove vote (toggle off)
                    await client.query(
                        `DELETE FROM social_votes WHERE post_id = $1 AND user_id = $2`,
                        [postId, userId]
                    );
                    
                    if (voteType === 'upvote') {
                        upvoteChange = -1;
                        actionTaken = 'removed_upvote';
                    } else {
                        downvoteChange = -1;
                        actionTaken = 'removed_downvote';
                    }
                } else {
                    // Change vote
                    await client.query(
                        `UPDATE social_votes SET vote_type = $1, created_at = CURRENT_TIMESTAMP 
                         WHERE post_id = $2 AND user_id = $3`,
                        [voteType, postId, userId]
                    );
                    
                    if (voteType === 'upvote') {
                        upvoteChange = 1;
                        downvoteChange = -1;
                        actionTaken = 'changed_to_upvote';
                    } else {
                        upvoteChange = -1;
                        downvoteChange = 1;
                        actionTaken = 'changed_to_downvote';
                    }
                }
            } else {
                // New vote
                await client.query(
                    `INSERT INTO social_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)`,
                    [postId, userId, voteType]
                );
                
                if (voteType === 'upvote') {
                    upvoteChange = 1;
                    actionTaken = 'added_upvote';
                } else {
                    downvoteChange = 1;
                    actionTaken = 'added_downvote';
                }
            }

            // Update post vote counts
            const updateQuery = `
                UPDATE social_posts 
                SET upvotes = upvotes + $1,
                    downvotes = downvotes + $2,
                    total_score = (upvotes + $1) - (downvotes + $2),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING upvotes, downvotes, total_score
            `;
            const updateResult = await client.query(updateQuery, [upvoteChange, downvoteChange, postId]);

            return {
                ...updateResult.rows[0],
                actionTaken
            };
        });

        // Invalidate cache
        await redisService.invalidatePattern('social_posts:*');

        console.log('✅ Vote recorded:', voteResult.actionTaken);

        // Determine final user vote state
        let finalUserVote = null;
        if (voteResult.actionTaken === 'added_upvote' || voteResult.actionTaken === 'changed_to_upvote') {
            finalUserVote = 'upvote';
        } else if (voteResult.actionTaken === 'added_downvote' || voteResult.actionTaken === 'changed_to_downvote') {
            finalUserVote = 'downvote';
        }

        res.status(200).json({
            success: true,
            message: `Vote ${voteResult.actionTaken.replace('_', ' ')} successfully`,
            upvoteCount: voteResult.upvotes,
            downvoteCount: voteResult.downvotes,
            userVote: finalUserVote,
            post: {
                id: postId,
                upvotes: voteResult.upvotes,
                downvotes: voteResult.downvotes,
                totalScore: voteResult.total_score
            },
            action: voteResult.actionTaken
        });

    } catch (error) {
        console.error('❌ Error voting on post:', error);
        
        if (error.message === 'Post not found') {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while voting',
            error: error.message
        });
    }
};

// Add comment to a post
const addComment = async (req, res) => {
    try {
        const { postId } = req.params;
        const { content, parentCommentId, isAnonymous = false } = req.body;
        const userId = req.userId || req.body.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User authentication required"
            });
        }

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Comment content is required"
            });
        }

        console.log('💬 Adding comment to post:', postId, 'by user:', userId);

        const comment = await transaction(async (client) => {
            // Check if post exists
            const postQuery = `SELECT id FROM social_posts WHERE id = $1`;
            const post = await client.query(postQuery, [postId]);

            if (post.rows.length === 0) {
                throw new Error('Post not found');
            }

            // If parent comment is specified, check if it exists
            if (parentCommentId) {
                const parentQuery = `SELECT id FROM social_comments WHERE id = $1 AND post_id = $2`;
                const parent = await client.query(parentQuery, [parentCommentId, postId]);
                
                if (parent.rows.length === 0) {
                    throw new Error('Parent comment not found');
                }
            }

            // Add comment
            const insertQuery = `
                INSERT INTO social_comments (post_id, user_id, parent_comment_id, content, is_anonymous)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            const result = await client.query(insertQuery, [
                postId,
                userId,
                parentCommentId || null,
                content.trim(),
                isAnonymous
            ]);

            // Update comment count on post
            await client.query(
                `UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = $1`,
                [postId]
            );

            return result.rows[0];
        });

        // Invalidate cache
        await redisService.invalidatePattern('social_posts:*');
        await redisService.invalidatePattern('social_comments:*');

        console.log('✅ Comment added successfully:', comment.id);

        res.status(201).json({
            success: true,
            message: "Comment added successfully",
            comment: {
                id: comment.id,
                postId: comment.post_id,
                userId: comment.user_id,
                parentCommentId: comment.parent_comment_id,
                content: comment.content,
                isAnonymous: comment.is_anonymous,
                upvotes: comment.upvotes,
                downvotes: comment.downvotes,
                createdAt: toISO(comment.created_at),
                updatedAt: toISO(comment.updated_at)
            }
        });

    } catch (error) {
        console.error('❌ Error adding comment:', error);
        
        if (error.message === 'Post not found') {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }
        
        if (error.message === 'Parent comment not found') {
            return res.status(404).json({
                success: false,
                message: 'Parent comment not found'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error while adding comment',
            error: error.message
        });
    }
};

// Get comments for a post
const getPostComments = async (req, res) => {
    try {
        const { postId } = req.params;
        const {
            page = 1,
            limit = 20,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        console.log('💬 Fetching comments for post:', postId, 'page:', page, 'limit:', limit);

        // Convert page to offset
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Validate sort parameters
        const allowedSortFields = ['created_at', 'upvotes', 'downvotes'];
        const allowedSortOrders = ['asc', 'desc'];

        const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
        const validSortOrder = allowedSortOrders.includes(sortOrder) ? sortOrder : 'desc';

        // Create cache key
        const cacheKey = `social_comments:${postId}:${page}:${limit}:${validSortBy}:${validSortOrder}`;

        // Try cache first
        const cachedComments = await redisService.getCachedReports(cacheKey);
        if (cachedComments) {
            console.log('📦 Returning cached comments');
            return res.status(200).json({
                success: true,
                comments: cachedComments.comments,
                totalCount: cachedComments.totalCount,
                currentPage: parseInt(page),
                totalPages: cachedComments.totalPages,
                hasMore: cachedComments.hasMore,
                cached: true
            });
        }

        // Get total count first
        const countQuery = `SELECT COUNT(*) as total FROM social_comments WHERE post_id = $1`;
        const countResult = await query(countQuery, [postId]);
        const totalCount = parseInt(countResult.rows[0].total);

        const commentsQuery = `
            SELECT
                sc.*,
                u.full_name as user_name,
                u.profile_image_url as user_profile_image_url
            FROM social_comments sc
            LEFT JOIN users u ON sc.user_id = u.id
            WHERE sc.post_id = $1
            ORDER BY sc.${validSortBy} ${validSortOrder.toUpperCase()}
            LIMIT $2 OFFSET $3
        `;

        const result = await query(commentsQuery, [postId, parseInt(limit), offset]);

        const comments = result.rows.map(comment => ({
            id: comment.id,
            postId: comment.post_id,
            userId: comment.user_id,
            user: comment.is_anonymous ? null : {
                id: comment.user_id,
                fullName: comment.user_name || 'User',
                profileImageUrl: comment.user_profile_image_url
            },
            parentCommentId: comment.parent_comment_id,
            content: comment.content,
            isAnonymous: comment.is_anonymous,
            upvotes: comment.upvotes,
            downvotes: comment.downvotes,
            createdAt: toISO(comment.created_at),
            updatedAt: toISO(comment.updated_at)
        }));

        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const hasMore = parseInt(page) < totalPages;

        const responseData = {
            comments: comments,
            totalCount: totalCount,
            currentPage: parseInt(page),
            totalPages: totalPages,
            hasMore: hasMore
        };

        // Cache results for 10 minutes
        await redisService.cacheReports(cacheKey, responseData, 600);

        console.log(`✅ Found ${comments.length} comments for post (total: ${totalCount})`);

        res.status(200).json({
            success: true,
            ...responseData
        });

    } catch (error) {
        console.error('❌ Error fetching comments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching comments',
            error: error.message
        });
    }
};

// Get social feed statistics
const getSocialStats = async (req, res) => {
    try {
        console.log('📊 Fetching social feed statistics');
        
        const cacheKey = 'social_stats';
        
        // Try cache first
        const cachedStats = await redisService.getCachedReports(cacheKey);
        if (cachedStats) {
            console.log('📦 Returning cached social stats');
            return res.status(200).json({
                success: true,
                stats: cachedStats,
                cached: true
            });
        }

        const statsQuery = `
            SELECT 
                COUNT(sp.id) as total_posts,
                COUNT(CASE WHEN sp.created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as posts_today,
                COUNT(CASE WHEN sp.created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as posts_this_week,
                SUM(sp.upvotes) as total_upvotes,
                SUM(sp.downvotes) as total_downvotes,
                SUM(sp.comment_count) as total_comments,
                SUM(sp.share_count) as total_shares,
                SUM(sp.view_count) as total_views,
                COUNT(CASE WHEN sp.total_score > 0 THEN 1 END) as positive_posts,
                COUNT(CASE WHEN sp.is_trending = true THEN 1 END) as trending_posts,
                COUNT(DISTINCT sp.user_id) as active_users,
                COUNT(CASE WHEN r.is_resolved = true THEN 1 END) as resolved_issues,
                AVG(sp.total_score) as avg_score
            FROM social_posts sp
            LEFT JOIN reports r ON sp.report_id = r.id
            WHERE sp.is_public = true
        `;

        const result = await queryOne(statsQuery);

        const stats = {
            totalPosts: parseInt(result.total_posts) || 0,
            postsToday: parseInt(result.posts_today) || 0,
            postsThisWeek: parseInt(result.posts_this_week) || 0,
            totalUpvotes: parseInt(result.total_upvotes) || 0,
            totalDownvotes: parseInt(result.total_downvotes) || 0,
            totalComments: parseInt(result.total_comments) || 0,
            totalShares: parseInt(result.total_shares) || 0,
            totalViews: parseInt(result.total_views) || 0,
            positivePosts: parseInt(result.positive_posts) || 0,
            trendingPosts: parseInt(result.trending_posts) || 0,
            activeUsers: parseInt(result.active_users) || 0,
            resolvedIssues: parseInt(result.resolved_issues) || 0,
            avgScore: parseFloat(result.avg_score) || 0,
            engagementRate: result.total_posts > 0 ? 
                ((parseInt(result.total_upvotes) + parseInt(result.total_comments)) / parseInt(result.total_posts) * 100).toFixed(2) : 0
        };

        // Cache for 15 minutes
        await redisService.cacheReports(cacheKey, stats, 900);

        console.log('✅ Social statistics fetched successfully');

        res.status(200).json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('❌ Error fetching social statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching statistics',
            error: error.message
        });
    }
};

// Track post view
const trackPostView = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId || req.body.userId;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        console.log('👁️ Tracking view for post:', postId);

        await transaction(async (client) => {
            // Check if post exists
            const postQuery = `SELECT id FROM social_posts WHERE id = $1`;
            const post = await client.query(postQuery, [postId]);

            if (post.rows.length === 0) {
                throw new Error('Post not found');
            }

            // Check if view already exists (to prevent duplicate views)
            if (userId) {
                const existingViewQuery = `
                    SELECT id FROM social_views 
                    WHERE post_id = $1 AND user_id = $2
                `;
                const existingView = await client.query(existingViewQuery, [postId, userId]);
                
                if (existingView.rows.length > 0) {
                    // View already exists, don't increment
                    return;
                }
            }

            // Add view record
            await client.query(`
                INSERT INTO social_views (post_id, user_id, ip_address, user_agent)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (post_id, user_id) DO NOTHING
            `, [postId, userId, ipAddress, userAgent]);

            // Update view count on post
            await client.query(`
                UPDATE social_posts 
                SET view_count = view_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [postId]);
        });

        // Invalidate cache
        await redisService.invalidatePattern('social_posts:*');

        res.status(200).json({
            success: true,
            message: "View tracked successfully"
        });

    } catch (error) {
        console.error('❌ Error tracking view:', error);
        
        if (error.message === 'Post not found') {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }
        
        // Don't fail the request for view tracking errors
        res.status(200).json({
            success: false,
            message: 'View tracking failed but request succeeded'
        });
    }
};

// Get social statistics for a specific report
const getReportSocialStats = async (req, res) => {
    try {
        const { reportId } = req.params;
        
        if (!reportId) {
            return res.status(400).json({
                success: false,
                message: "Report ID is required"
            });
        }

        console.log('📊 Fetching social stats for report:', reportId);
        
        const cacheKey = `report_social_stats:${reportId}`;
        
        // Try cache first
        const cachedStats = await redisService.getCachedReports(cacheKey);
        if (cachedStats) {
            console.log('📦 Returning cached report social stats');
            return res.status(200).json({
                success: true,
                stats: cachedStats,
                cached: true
            });
        }

        // Query to get social stats for the specific report
        const statsQuery = `
            SELECT 
                sp.id as social_post_id,
                sp.report_id,
                sp.upvotes,
                sp.downvotes,
                sp.total_score,
                sp.comment_count,
                sp.share_count,
                sp.view_count,
                sp.is_trending,
                sp.is_featured,
                sp.created_at as social_post_created_at,
                r.title as report_title,
                r.category as report_category,
                r.is_resolved as report_is_resolved
            FROM social_posts sp
            LEFT JOIN reports r ON sp.report_id = r.id
            WHERE sp.report_id = $1 AND sp.is_public = true
            LIMIT 1
        `;

        const result = await queryOne(statsQuery, [reportId]);

        if (!result) {
            // Report exists but no social post - return default stats
            return res.status(200).json({
                success: true,
                stats: {
                    reportId: reportId,
                    hasSocialPost: false,
                    upvotes: 0,
                    downvotes: 0,
                    totalScore: 0,
                    commentCount: 0,
                    shareCount: 0,
                    viewCount: 0,
                    isTrending: false,
                    isFeatured: false,
                    socialPostCreatedAt: null
                }
            });
        }

        const stats = {
            reportId: result.report_id,
            socialPostId: result.social_post_id,
            hasSocialPost: true,
            upvotes: parseInt(result.upvotes) || 0,
            downvotes: parseInt(result.downvotes) || 0,
            totalScore: parseInt(result.total_score) || 0,
            commentCount: parseInt(result.comment_count) || 0,
            shareCount: parseInt(result.share_count) || 0,
            viewCount: parseInt(result.view_count) || 0,
            isTrending: result.is_trending || false,
            isFeatured: result.is_featured || false,
            socialPostCreatedAt: toISO(result.social_post_created_at),
            reportTitle: result.report_title,
            reportCategory: result.report_category,
            reportIsResolved: result.report_is_resolved
        };

        // Cache for 5 minutes
        await redisService.cacheReports(cacheKey, stats, 300);

        console.log('✅ Report social statistics fetched successfully');

        res.status(200).json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('❌ Error fetching report social statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching report social statistics',
            error: error.message
        });
    }
};

export {
    createSocialPost,
    getSocialPosts,
    voteOnPost,
    addComment,
    getPostComments,
    getSocialStats,
    trackPostView,
    getReportSocialStats
};
