import { Router } from "express";
import {
    getAssignedReports,
    getReportDetails,
    startWork,
    addProgressUpdate,
    completeReport,
    getDashboardStats,
    getTodayReports,
    uploadWorkPhoto,
    updateAdminLocation,
    getTeamLocations
} from '../controllers/fieldAdmin.controllers.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = Router();

// Report management routes
router.get('/reports/:adminId', getAssignedReports);
router.get('/reports/:reportId/details', getReportDetails);
router.get('/reports/:adminId/today', getTodayReports);

// Work status routes
router.post('/reports/:reportId/start', startWork);
router.post('/reports/:reportId/update', upload.array('photos', 5), addProgressUpdate);
router.post('/reports/:reportId/complete', upload.array('resolvedPhotos', 5), completeReport);

// Dashboard routes
router.get('/dashboard/:adminId', getDashboardStats);

// Media upload
router.post('/upload-work-photo', upload.single('mediaFile'), uploadWorkPhoto);

// Location tracking routes
router.post('/location/update', updateAdminLocation);
router.get('/team-locations', getTeamLocations);

export default router;
