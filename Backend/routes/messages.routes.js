import express from 'express';
import { sendMessage, getMessages, deleteMessages } from '../controllers/messages.controller.js';

const router = express.Router();

// POST /api/v1/messages - Send message and get AI response
router.post('/', sendMessage);

// GET /api/v1/messages?userId=xxx - Get chat history
router.get('/', getMessages);

// DELETE /api/v1/messages?userId=xxx - Delete all messages for user
router.delete('/', deleteMessages);

export default router;