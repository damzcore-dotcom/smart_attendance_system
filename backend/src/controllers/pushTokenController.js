const prisma = require('../prismaClient');
const { getOrInitVapidKeys } = require('../services/pushNotificationService');

const { handleControllerError } = require('../middleware/validate');
/**
 * GET /api/notifications/vapid-public-key
 */
const getPublicKey = async (req, res) => {
  try {
    const { publicKey } = await getOrInitVapidKeys();
    res.json({ success: true, publicKey });
  } catch (err) {
    handleControllerError(res, err, 'pushTokenController');
  }
};

/**
 * POST /api/notifications/register-token
 */
const registerToken = async (req, res) => {
  try {
    const { subscription, platform } = req.body;
    let employeeId = req.body.employeeId;

    // Security: non-admin can only register for themselves
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      employeeId = req.user.employeeId;
    }

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee linked to this account' });
    }

    if (!subscription) {
      return res.status(400).json({ success: false, message: 'Subscription object is required' });
    }

    const subscriptionStr = typeof subscription === 'string' ? subscription : JSON.stringify(subscription);

    // Check if token already exists for this employee
    const existing = await prisma.pushToken.findFirst({
      where: {
        employeeId: Number(employeeId),
        token: subscriptionStr
      }
    });

    if (existing) {
      // Just update updatedAt
      await prisma.pushToken.update({
        where: { id: existing.id },
        data: { platform: platform || 'web' }
      });
      console.log(`[Push Token] Updated token ID ${existing.id} for employee ${employeeId}`);
    } else {
      const token = await prisma.pushToken.create({
        data: {
          employeeId: Number(employeeId),
          token: subscriptionStr,
          platform: platform || 'web'
        }
      });
      console.log(`[Push Token] Registered new token ID ${token.id} for employee ${employeeId}`);
    }

    res.json({ success: true, message: 'Device registered for push notifications successfully' });
  } catch (err) {
    handleControllerError(res, err, 'pushTokenController');
  }
};

module.exports = {
  getPublicKey,
  registerToken
};
