/**
 * Mock Biometric Service for Smart Attendance Pro
 * In a real production app, this would send the image to a Backend API
 * that performs face matching using AWS Rekognition, Azure Face, or a custom Python engine.
 */

export const biometricService = {
  verifyFace: async (imageSrc) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock logic: randomly identify as Admin or Employee for demonstration
    // In reality, this would be based on the face match result
    const isMockAdmin = Math.random() > 0.5;

    if (isMockAdmin) {
      return {
        success: true,
        user: {
          id: 'ADM001',
          name: 'Sarah Connor',
          role: 'admin',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'
        }
      };
    } else {
      return {
        success: true,
        user: {
          id: 'EMP124',
          name: 'John Doe',
          role: 'employee',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User1'
        }
      };
    }
  }
};
