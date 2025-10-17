import { query, transaction } from '../db/utils.js';
import generateAIResponse from '../services/ai.js';

// Helper function to convert timestamps to ISO
const toISO = (val) => (val ? new Date(val).toISOString() : null);

export const sendMessage = async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Message and userId are required'
      });
    }

    const result = await transaction(async (client) => {
      // Verify user exists
      const userCheck = await client.query(
        'SELECT id FROM users WHERE id = $1',
        [userId]
      );

      if (userCheck.rows.length === 0) {
        throw new Error('User not found');
      }

      // Save user message
      await client.query(
        'INSERT INTO messages (user_id, role, message) VALUES ($1, $2, $3)',
        [userId, 'user', message]
      );

      // Fetch full chat history for this user
      const messagesResult = await client.query(
        'SELECT * FROM messages WHERE user_id = $1 ORDER BY created_at ASC',
        [userId]
      );

      const messages = messagesResult.rows.map(msg => ({
        id: msg.id,
        userId: msg.user_id,
        role: msg.role,
        message: msg.message,
        createdAt: toISO(msg.created_at)
      }));

      // Generate AI response
      const aiResponse = await generateAIResponse(messages);

      // Save AI response
      await client.query(
        'INSERT INTO messages (user_id, role, message) VALUES ($1, $2, $3)',
        [userId, 'ai', aiResponse]
      );

      return aiResponse;
    });

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      aiResponse: result
    });

  } catch (error) {
    console.error('Error in sendMessage:', error);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const result = await query(
      'SELECT * FROM messages WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    );

    const messages = result.rows.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      role: msg.role,
      message: msg.message,
      createdAt: toISO(msg.created_at)
    }));

    res.status(200).json({
      success: true,
      messages: messages
    });

  } catch (error) {
    console.error('Error in getMessages:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const deleteMessages = async (req, res) => {
  try {
    const { userId } = req.query;
    const { resetSequence } = req.query; // Optional parameter to reset sequence

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const result = await transaction(async (client) => {
      // Delete all messages for the user
      const deleteResult = await client.query(
        'DELETE FROM messages WHERE user_id = $1',
        [userId]
      );

      // Optionally reset the sequence if requested
      if (resetSequence === 'true') {
        console.log('🔄 Resetting message sequence...');
        await client.query('ALTER SEQUENCE messages_id_seq RESTART WITH 1');
        console.log('✅ Message sequence reset to 1');
      }

      return deleteResult;
    });

    const message = resetSequence === 'true'
      ? 'All messages deleted successfully and sequence reset'
      : 'All messages deleted successfully';

    console.log(`🗑️ Deleted ${result.rowCount} messages for user ${userId}`);

    res.status(200).json({
      success: true,
      message: message,
      deletedCount: result.rowCount,
      sequenceReset: resetSequence === 'true'
    });

  } catch (error) {
    console.error('Error in deleteMessages:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};