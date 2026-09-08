import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    const emailUser = process.env.EMAIL_USER;
    
    if (emailUser && emailUser !== 'your-email@gmail.com') {
      // Use Real SMTP credentials from .env
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
      this.logger.log('MailService initialized with real SMTP credentials.');
    } else {
      // Fallback: Use Ethereal fake SMTP for instant testing out-of-the-box
      this.logger.log('No valid SMTP credentials found in .env. Generating Ethereal test account...');
      nodemailer.createTestAccount((err, account) => {
        if (err) {
          this.logger.error('Failed to create a testing account. ' + err.message);
          return;
        }
        this.transporter = nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth: {
            user: account.user,
            pass: account.pass,
          },
        });
        this.logger.log(`Ethereal test account generated successfully. Emails will be logged to console.`);
      });
    }
  }

  // Wrapper to log Ethereal URL if using test account
  private logPreviewUrl(info: any) {
    if (nodemailer.getTestMessageUrl(info)) {
      console.log(`\n📧 Email sent! View it here: ${nodemailer.getTestMessageUrl(info)}\n`);
    }
  }

  async sendLoginNotification(email: string) {
    try {
      if (!this.transporter) return;
      const info = await this.transporter.sendMail({
        from: `"Jiyo Life Travels" <${process.env.EMAIL_USER || 'noreply@jiyolifetravels.com'}>`,
        to: email,
        subject: 'New Login to Your Account',
        text: `Hello,\n\nWe noticed a new login to your Jiyo Life Travels account.\n\nIf this was you, you can safely ignore this email. If not, please reset your password immediately.\n\nRegards,\nThe Jiyo Life Travels Team`,
        html: `<p>Hello,</p><p>We noticed a new login to your Jiyo Life Travels account.</p><p>If this was you, you can safely ignore this email. If not, please reset your password immediately.</p><br/><p>Regards,<br/>The Jiyo Life Travels Team</p>`,
      });
      this.logger.log(`Login notification email sent to ${email}`);
      this.logPreviewUrl(info);
    } catch (error) {
      this.logger.error(`Failed to send login notification to ${email}`, error.stack);
    }
  }

  async sendPasswordResetOTP(email: string, otp: string) {
    try {
      if (!this.transporter) return;
      const info = await this.transporter.sendMail({
        from: `"Jiyo Life Travels" <${process.env.EMAIL_USER || 'noreply@jiyolifetravels.com'}>`,
        to: email,
        subject: 'Your Password Reset OTP',
        text: `Hello,\n\nYou requested to reset your password. Your OTP is: ${otp}\nThis OTP is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nRegards,\nThe Jiyo Life Travels Team`,
        html: `<p>Hello,</p><p>You requested to reset your password. Your OTP is: <strong>${otp}</strong></p><p>This OTP is valid for 10 minutes.</p><p>If you did not request this, please ignore this email.</p><br/><p>Regards,<br/>The Jiyo Life Travels Team</p>`,
      });
      this.logger.log(`Password reset OTP sent to ${email}`);
      this.logPreviewUrl(info);
    } catch (error) {
      this.logger.error(`Failed to send password reset OTP to ${email}`, error.stack);
    }
  }

  async sendWelcomeEmail(email: string, name: string) {
    try {
      if (!this.transporter) return;
      const info = await this.transporter.sendMail({
        from: `"Jiyo Life Travels" <${process.env.EMAIL_USER || 'noreply@jiyolifetravels.com'}>`,
        to: email,
        subject: 'Welcome to Jiyo Life Travels!',
        text: `Hello ${name},\n\nWelcome to Jiyo Life Travels! Your account has been successfully created.\n\nStart planning your next journey with us today.\n\nRegards,\nThe Jiyo Life Travels Team`,
        html: `<p>Hello <strong>${name}</strong>,</p><p>Welcome to Jiyo Life Travels! Your account has been successfully created.</p><p>Start planning your next journey with us today.</p><br/><p>Regards,<br/>The Jiyo Life Travels Team</p>`,
      });
      this.logger.log(`Welcome email sent to ${email}`);
      this.logPreviewUrl(info);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error.stack);
    }
  }

  async sendVerificationOTP(email: string, otp: string) {
    try {
      if (!this.transporter) return;
      const info = await this.transporter.sendMail({
        from: `"Jiyo Life Travels" <${process.env.EMAIL_USER || 'noreply@jiyolifetravels.com'}>`,
        to: email,
        subject: 'Verify Your Email Account',
        text: `Hello,\n\nWelcome to Jiyo Life Travels! Please verify your email address.\n\nYour OTP is: ${otp}\nThis OTP is valid for 10 minutes.\n\nRegards,\nThe Jiyo Life Travels Team`,
        html: `<p>Hello,</p><p>Welcome to Jiyo Life Travels! Please verify your email address.</p><p>Your OTP is: <strong>${otp}</strong></p><p>This OTP is valid for 10 minutes.</p><br/><p>Regards,<br/>The Jiyo Life Travels Team</p>`,
      });
      this.logger.log(`Verification OTP sent to ${email}`);
      this.logPreviewUrl(info);
    } catch (error) {
      this.logger.error(`Failed to send verification OTP to ${email}`, error.stack);
    }
  }

  async sendHotelBookingConfirmation(email: string, bookingDetails: any) {
    try {
      if (!this.transporter) return;
      const { bookingId, pnr, bookingDate, hotelName, roomName, checkIn, checkOut, guestName, totalAmount } = bookingDetails;
      
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #e8151b 0%, #a80f13 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">Booking Confirmed!</h1>
              <p style="color: #ffcccc; margin: 10px 0 0 0; font-size: 16px;">Pack your bags, ${guestName}. Your stay is ready.</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              
              <!-- Quick Info Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px; text-align: center; border-right: 1px solid #e2e8f0; width: 33%;">
                    <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Booking ID</p>
                    <p style="margin: 6px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 700;">${bookingId}</p>
                  </td>
                  <td style="padding: 20px; text-align: center; border-right: 1px solid #e2e8f0; width: 33%;">
                    <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">PNR / Conf No.</p>
                    <p style="margin: 6px 0 0 0; font-size: 15px; color: #0ea5e9; font-weight: 700;">${pnr}</p>
                  </td>
                  <td style="padding: 20px; text-align: center; width: 33%;">
                    <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Date</p>
                    <p style="margin: 6px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 700;">${bookingDate}</p>
                  </td>
                </tr>
              </table>

              <!-- Hotel Details Title -->
              <h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 18px; font-weight: 700; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">Hotel Itinerary</h3>
              
              <!-- Hotel Details Content -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 25px;">
                <tr>
                  <td style="padding: 0 0 12px 0;">
                    <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 600;">Hotel Name</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #0f172a; font-weight: 700;">${hotelName}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 0 15px 0;">
                    <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 600;">Room Type</p>
                    <p style="margin: 4px 0 0 0; font-size: 15px; color: #334155; font-weight: 500;">${roomName}</p>
                  </td>
                </tr>
              </table>

              <!-- Check IN/OUT -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="width: 48%; background-color: #f0fdf4; border-radius: 10px; padding: 15px; border: 1px solid #bbf7d0; text-align: left;">
                    <p style="margin: 0; font-size: 12px; color: #166534; font-weight: 700; text-transform: uppercase;">Check-in</p>
                    <p style="margin: 6px 0 0 0; font-size: 16px; color: #14532d; font-weight: 700;">${checkIn}</p>
                  </td>
                  <td style="width: 4%;"></td>
                  <td style="width: 48%; background-color: #fef2f2; border-radius: 10px; padding: 15px; border: 1px solid #fecaca; text-align: left;">
                    <p style="margin: 0; font-size: 12px; color: #991b1b; font-weight: 700; text-transform: uppercase;">Check-out</p>
                    <p style="margin: 6px 0 0 0; font-size: 16px; color: #7f1d1d; font-weight: 700;">${checkOut}</p>
                  </td>
                </tr>
              </table>
              
              <!-- Payment Info -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 2px dashed #e2e8f0; padding-top: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 14px; color: #475569; font-weight: 600;">Total Amount Paid:</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; font-size: 22px; color: #e8151b; font-weight: 800;">₹${Number(totalAmount).toLocaleString('en-IN')}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 14px; color: #64748b; font-weight: 600;">Thank you for choosing Jiyo Life Travels!</p>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #94a3b8;">If you have any questions, please reply to this email or contact our support team.</p>
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 12px; color: #cbd5e1;">&copy; ${new Date().getFullYear()} Jiyo Life Travels. All rights reserved.</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      const info = await this.transporter.sendMail({
        from: `"Jiyo Life Travels" <${process.env.EMAIL_USER || 'noreply@jiyolifetravels.com'}>`,
        to: email,
        subject: `Booking Confirmed: ${hotelName}`,
        text: `Hello ${guestName},\n\nYour hotel booking is confirmed!\n\nBooking ID: ${bookingId}\nPNR: ${pnr}\nHotel: ${hotelName}\nRoom: ${roomName}\nCheck-in: ${checkIn}\nCheck-out: ${checkOut}\nAmount Paid: ₹${totalAmount}\n\nThank you for choosing Jiyo Life Travels!\n\nRegards,\nThe Jiyo Life Travels Team`,
        html: htmlContent,
      });
      this.logger.log(`Hotel booking confirmation email sent to ${email}`);
      this.logPreviewUrl(info);
    } catch (error) {
      this.logger.error(`Failed to send hotel booking confirmation to ${email}`, error.stack);
    }
  }
}
