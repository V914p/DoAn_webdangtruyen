import Report from '../models/Report.js';
import Story from '../models/Story.js';
import Artwork from '../models/Artwork.js';

function getPrimaryReason(reason = '') {
  return String(reason).split(':')[0].trim();
}

// Create a new report
export async function createReport(req, res) {
  try {
    const { contentId, contentType, reason } = req.body;

    // Check if content exists
    let content;
    if (contentType === 'Story') {
      content = await Story.findById(contentId);
    } else if (contentType === 'Artwork') {
      content = await Artwork.findById(contentId);
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Content not found'
        }
      });
    }

    // Check for duplicate report
    const existingReport = await Report.findOne({
      reporter: req.user.userId,
      contentId,
      contentType
    });

    if (existingReport) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'You have already reported this content'
        }
      });
    }

    // Create report
    const report = new Report({
      reporter: req.user.userId,
      contentId,
      contentType,
      reason: String(reason).trim()
    });

    await report.save();

    // Auto-hide content if it receives multiple reports (e.g., 3 or more)
    const reportCount = await Report.countDocuments({ contentId, contentType });
    
    if (reportCount >= 3 && content.status === 'approved') {
      content.status = 'pending'; // Set to pending for admin review
      await content.save();
    }

    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: report
    });
  } catch (error) {
    console.error('Create report error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}
