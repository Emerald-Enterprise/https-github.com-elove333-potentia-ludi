// Build Intent Preview Route
import { Router } from 'express';
import { requireAuth, AuthenticatedRequest, validateRequest, success, error } from '../../client';
import { parseIntent, validateIntent } from '../../services/intentParser';
import { buildExecutionPreview } from '../../services/pipelineExecutor';
import { conversationQueries, userQueries } from '../../lib/database';

const router = Router();

// Build execution preview for intent
router.post(
  '/',
  requireAuth,
  validateRequest({
    body: {
      input: { required: true, type: 'string' },
      chainId: { required: false, type: 'number' }
    }
  }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { input, chainId } = req.body;
      const userId = req.userId!;

      // Parse intent
      const parsed = await parseIntent(input);

      if (!parsed) {
        error(res, 'Could not understand input', 400);
        return;
      }

      // Validate parsed intent
      const validation = validateIntent(parsed);
      if (!validation.valid) {
        error(res, `Invalid intent: ${validation.errors.join(', ')}`, 400);
        return;
      }

      // Get or create active conversation
      let conversation = await conversationQueries.findActive(userId);
      if (!conversation) {
        conversation = await conversationQueries.create(userId);
      }

      // Get user wallet address
      const user = await userQueries.findByAddress(userId);
      if (!user) {
        error(res, 'User not found', 404);
        return;
      }

      // Build preview without executing
      const preview = await buildExecutionPreview(parsed, {
        userId,
        conversationId: conversation.id,
        intentId: '', // No intent ID yet since we're just previewing
        walletAddress: user.wallet_address,
        chainId
      });

      if (!preview.success) {
        error(res, preview.error || 'Failed to build preview', 400);
        return;
      }

      success(res, {
        intent: {
          action: parsed.action,
          entities: parsed.entities,
          confidence: parsed.confidence,
          riskLevel: parsed.riskLevel
        },
        preview: preview.data
      });
    } catch (err) {
      console.error('Preview build error:', err);
      error(res, err instanceof Error ? err.message : 'Failed to build preview', 500);
    }
  }
);

export default router;
