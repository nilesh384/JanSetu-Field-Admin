import { Router } from "express";
import {
    createOrLoginUser,
    updateUserProfile, 
    getUserById,
    getUserByPhone,
    uploadProfileImage,
    registerUser, 
    loginUser, 
    updateUser,
    deleteUser
} from '../controllers/users.controllers.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = Router();

// New endpoints for database-first approach
router.route('/create-or-login').post(createOrLoginUser);
router.route('/update-profile').put(updateUserProfile);
router.route('/user/:id').get(getUserById);
router.route('/phone/:phoneNumber').get(getUserByPhone);
router.route('/upload-profile-image').post(upload.single('profileImage'), uploadProfileImage);
router.route('/delete').delete(deleteUser);

// Legacy endpoints (deprecated but kept for compatibility)
router.route('/registerUser').post(registerUser);
router.route('/loginUser/:id').get(loginUser);
router.route('/updateUser/:id').put(updateUser);
router.route('/delete/:id').delete(deleteUser);

export default router;