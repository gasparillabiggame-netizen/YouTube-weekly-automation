#!/usr/bin/env node

const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const VIDIQ_API_BASE = 'https://api.vidiq.com/v2';
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const VIDIQ_API_KEY = process.env.VIDIQ_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Create reports directory
const reportsDir = 'reports';
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir);
}

const reportDate = new Date().toISOString().split('T')[0];
const pdfPath = path.join(reportsDir, `youtube-report-${reportDate}.pdf`);

/**
 * Fetch channel analytics from vidIQ
 */
async function getChannelAnalytics() {
  try {
    console.log('🎬 Fetching channel analytics...');
    const response = await axios.get(
      `${VIDIQ_API_BASE}/channels/${YOUTUBE_CHANNEL_ID}/analytics`,
      {
        headers: { 'Authorization': `Bearer ${VIDIQ_API_KEY}` }
      }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching channel analytics:', error.message);
    return null;
  }
}

/**
 * Fetch recent videos with performance metrics
 */
async function getRecentVideos() {
  try {
    console.log('📹 Fetching recent videos...');
    const response = await axios.get(
      `${VIDIQ_API_BASE}/channels/${YOUTUBE_CHANNEL_ID}/videos?limit=10&sort=-published_at`,
      {
        headers: { 'Authorization': `Bearer ${VIDIQ_API_KEY}` }
      }
    );
    return response.data.videos || [];
  } catch (error) {
    console.error('❌ Error fetching videos:', error.message);
    return [];
  }
}

/**
 * Fetch Shorts performance
 */
async function getShortsPerformance() {
  try {
    console.log('⚡ Fetching Shorts analytics...');
    const response = await axios.get(
      `${VIDIQ_API_BASE}/channels/${YOUTUBE_CHANNEL_ID}/videos?format=shorts&limit=10&sort=-published_at`,
      {
        headers: { 'Authorization': `Bearer ${VIDIQ_API_KEY}` }
      }
    );
    return response.data.videos || [];
  } catch (error) {
    console.error('❌ Error fetching Shorts:', error.message);
    return [];
  }
}

/**
 * Track competitor channels (Riley's Marine, etc.)
 */
async function getCompetitorData() {
  const competitorIds = [
    'UCwyGPi9T6ogYTPcx32q93Gg' // Riley's Marine
  ];

  const competitors = [];
  for (const channelId of competitorIds) {
    try {
      const response = await axios.get(
        `${VIDIQ_API_BASE}/channels/${channelId}`,
        {
          headers: { 'Authorization': `Bearer ${VIDIQ_API_KEY}` }
        }
      );
      competitors.push(response.data);
    } catch (error) {
      console.error(`❌ Error fetching competitor ${channelId}:`, error.message);
    }
  }
  return competitors;
}

/**
 * Generate insights using Claude API
 */
async function generateInsights(channelData, videosData, shortsData, competitorData) {
  try {
    console.log('🤖 Generating AI insights...');

    const prompt = `You are a YouTube optimization expert. Analyze this channel data and provide actionable insights.

CHANNEL OVERVIEW:
${JSON.stringify(channelData, null, 2)}

RECENT VIDEOS (Last 10):
${JSON.stringify(videosData, null, 2)}

SHORTS PERFORMANCE (Last 10):
${JSON.stringify(shortsData, null, 2)}

COMPETITOR BENCHMARKS:
${JSON.stringify(competitorData, null, 2)}

Provide a structured analysis with:
1. Key Performance Indicators (KPIs) summary
2. Top performing content pillars
3. Underperforming videos with specific improvement recommendations
4. Shorts strategy assessment
5. Competitor positioning analysis
6. Actionable next steps prioritized by impact

Format as a professional report suitable for a YouTube creator.`;

    const response = await axios.post(
      `${ANTHROPIC_API_BASE}/messages`,
      {
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data.content[0].text;
  } catch (error) {
    console.error('❌ Error generating insights:', error.message);
    return 'Unable to generate AI insights at this time.';
  }
}

/**
 * Generate PDF report
 */
async function generatePDFReport(channelData, videosData, shortsData, insights) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('📄 Generating PDF report...');

      // Import PDFKit
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({
        size: 'letter',
        margin: 50
      });

      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('YouTube Channel Report', { align: 'center' });
      doc.fontSize(11).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown();

      // Channel Overview
      doc.fontSize(16).font('Helvetica-Bold').text('Channel Overview');
      doc.fontSize(11).font('Helvetica');
      if (channelData) {
        doc.text(`Subscribers: ${channelData.subscribers?.toLocaleString() || 'N/A'}`);
        doc.text(`Total Views: ${channelData.total_views?.toLocaleString() || 'N/A'}`);
        doc.text(`Videos: ${channelData.video_count || 'N/A'}`);
      }
      doc.moveDown();

      // Recent Videos Performance
      doc.fontSize(16).font('Helvetica-Bold').text('Recent Videos Performance');
      doc.fontSize(10).font('Helvetica');
      
      if (videosData && videosData.length > 0) {
        const topVideos = videosData.slice(0, 5);
        topVideos.forEach((video, index) => {
          doc.text(`${index + 1}. ${video.title || 'Untitled'}`);
          doc.text(`   Views: ${video.views?.toLocaleString() || 0} | Watch Time: ${video.watch_time_hours || 0}h | CTR: ${video.ctr || 'N/A'}%`, { indent: 20 });
        });
      }
      doc.moveDown();

      // Shorts Performance
      doc.fontSize(16).font('Helvetica-Bold').text('Shorts Performance');
      doc.fontSize(10).font('Helvetica');
      
      if (shortsData && shortsData.length > 0) {
        const topShorts = shortsData.slice(0, 5);
        topShorts.forEach((short, index) => {
          doc.text(`${index + 1}. ${short.title || 'Untitled Short'}`);
          doc.text(`   Views: ${short.views?.toLocaleString() || 0} | Likes: ${short.likes?.toLocaleString() || 0}`, { indent: 20 });
        });
      } else {
        doc.text('No Shorts data available');
      }
      doc.moveDown();

      // AI Insights
      doc.fontSize(16).font('Helvetica-Bold').text('AI-Generated Insights & Recommendations');
      doc.fontSize(10).font('Helvetica');
      
      // Split long text properly
      const lines = insights.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          doc.text(line, { align: 'left' });
        }
      });

      doc.moveDown();
      doc.fontSize(8).font('Helvetica').text('Report generated by Outboards Only YouTube Automation', { align: 'center', color: '#666666' });

      doc.end();

      stream.on('finish', () => {
        console.log(`✅ PDF report generated: ${pdfPath}`);
        resolve(pdfPath);
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Send report via iCloud email
 */
async function sendEmailReport(pdfPath) {
  try {
    console.log('📧 Sending email report via iCloud...');

    const transporter = nodemailer.createTransport({
      host: 'smtp.mail.icloud.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.ICLOUD_EMAIL,
        pass: process.env.ICLOUD_APP_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.ICLOUD_EMAIL,
      to: process.env.ICLOUD_EMAIL,
      subject: `YouTube Channel Report - ${new Date().toLocaleDateString()}`,
      html: `
        <h2>Your Weekly YouTube Optimization Report</h2>
        <p>Hi Orion,</p>
        <p>Your automated YouTube channel analysis report is ready. See attached PDF for:</p>
        <ul>
          <li>Channel performance metrics</li>
          <li>Top performing videos & Shorts</li>
          <li>Underperforming content with improvement ideas</li>
          <li>Competitor benchmarking</li>
          <li>AI-generated optimization recommendations</li>
        </ul>
        <p>Best regards,<br>Outboards Only YouTube Automation</p>
      `,
      attachments: [
        {
          filename: path.basename(pdfPath),
          path: pdfPath
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully via iCloud');
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting YouTube optimization report generation...\n');

  try {
    // Fetch all data
    const channelData = await getChannelAnalytics();
    const videosData = await getRecentVideos();
    const shortsData = await getShortsPerformance();
    const competitorData = await getCompetitorData();

    // Generate insights
    const insights = await generateInsights(channelData, videosData, shortsData, competitorData);

    // Generate PDF
    await generatePDFReport(channelData, videosData, shortsData, insights);

    // Send email
    if (process.env.ICLOUD_EMAIL && process.env.ICLOUD_APP_PASSWORD) {
      await sendEmailReport(pdfPath);
    } else {
      console.log('⚠️  iCloud credentials not configured. Skipping email.');
    }

    console.log('\n✅ Report generation complete!');
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
