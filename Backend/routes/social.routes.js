import { Router } from "express";
import {
    createSocialPost,
    getSocialPosts,
    voteOnPost,
    addComment,
    getPostComments,
    getSocialStats,
    trackPostView,
    getReportSocialStats
} from '../controllers/social.controllers.js';

const router = Router();

// Social Post Routes
router.route('/posts').post(createSocialPost);
router.route('/posts').get(getSocialPosts);
router.route('/posts/:postId/view').post(trackPostView);

// Voting Routes
router.route('/posts/:postId/vote').post(voteOnPost);

// Comments Routes
router.route('/posts/:postId/comments').post(addComment);
router.route('/posts/:postId/comments').get(getPostComments);

// Statistics Routes
router.route('/stats/:userId').get(getSocialStats);
router.route('/reports/:reportId/stats').get(getReportSocialStats);

export default router;
