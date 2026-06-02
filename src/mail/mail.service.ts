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
}
