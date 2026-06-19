import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async onModuleInit() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL') || 'vineetvineet8006@gmail.com';
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD') || 'vineet123';

    const existingAdmin = await this.userModel.findOne({ email: adminEmail });
    if (!existingAdmin) {
      console.log(`Seeding Admin User: ${adminEmail}...`);
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await this.userModel.create({
        email: adminEmail,
        password: hashedPassword,
        isVerified: true,
      });
      console.log('Admin user seeded successfully!');
    } else {
      if (!existingAdmin.isVerified) {
        existingAdmin.isVerified = true;
        await existingAdmin.save();
        console.log('Admin user verification status updated to true.');
      } else {
        console.log('Admin user already exists and is verified.');
      }
    }
  }

  async validateUser(loginDto: LoginDto): Promise<any> {
    const { email, password } = loginDto;
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { 
      id: user._id, 
      email: user.email, 
      firstName: user.firstName, 
      lastName: user.lastName, 
      mobile: user.mobile 
    };
  }

  async login(user: any) {
    // Only allow login if email is verified
    const dbUser = await this.userModel.findById(user.id);
    if (dbUser && dbUser.isVerified === false) {
      throw new UnauthorizedException('Please verify your email before logging in.');
    }

    const payload = { email: user.email, sub: user.id };
    
    // Trigger login notification asynchronously (fire and forget)
    this.mailService.sendLoginNotification(user.email).catch(console.error);

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        _id: user.id,
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
      },
    };
  }

  async register(registerDto: any) {
    const { email, password, firstName, lastName, mobile } = registerDto;
    
    const existingUser = await this.userModel.findOne({ email });
    const hashedPassword = await bcrypt.hash(password, 10);
    // Generate 6-digit OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins expiry

    // LOG OTP FOR DEVELOPMENT PURPOSES
    console.log(`\n\n========================================`);
    console.log(`🔐 OTP for ${email}: ${otp}`);
    console.log(`========================================\n\n`);

    if (existingUser) {
      if (existingUser.isVerified) {
        throw new UnauthorizedException('Email is already registered and verified. Please login.');
      } else {
        // User exists but is not verified. Update their details and send a new OTP.
        existingUser.password = hashedPassword;
        existingUser.firstName = firstName;
        existingUser.lastName = lastName;
        existingUser.mobile = mobile;
        existingUser.otp = otp;
        existingUser.otpExpiry = otpExpiry;
        await existingUser.save();

        this.mailService.sendVerificationOTP(email, otp).catch(console.error);
        return { message: 'OTP sent to your email. Please verify.', userId: existingUser._id, otp: otp };
      }
    }

    const newUser = await this.userModel.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      mobile,
      otp,
      otpExpiry,
      isVerified: false,
    });

    // Send Verification Email asynchronously
    this.mailService.sendVerificationOTP(email, otp).catch(console.error);
    // Optionally also send a welcome email now, or wait until verified.
    // this.mailService.sendWelcomeEmail(email, firstName || 'Traveller').catch(console.error);

    return { message: 'User registered successfully. Please verify your email.', userId: newUser._id, otp: otp };
  }

  async verifyEmail(verifyDto: any) {
    const { email, otp } = verifyDto;
    
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isVerified) {
      return { message: 'Email already verified' };
    }

    if (!user.otp || !user.otpExpiry || user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (user.otpExpiry < new Date()) {
      throw new UnauthorizedException('OTP has expired. Please request a new one.');
    }

    // OTP is valid, mark verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return { message: 'Email verified successfully! You can now log in.' };
  }

  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      // Return a generic message even if user not found to prevent email enumeration
      return { message: 'If that email is registered, an OTP has been sent.' };
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // LOG OTP FOR DEVELOPMENT PURPOSES
    console.log(`\n\n========================================`);
    console.log(`🔐 Forgot Password OTP for ${email}: ${otp}`);
    console.log(`========================================\n\n`);

    // Save OTP to user (in a real production app, hash the OTP before saving)
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP email asynchronously
    this.mailService.sendPasswordResetOTP(email, otp).catch(console.error);

    return { message: 'If that email is registered, an OTP has been sent.', otp: otp };
  }

  async resetPassword(resetDto: any) {
    const { email, otp, newPassword } = resetDto;
    
    const user = await this.userModel.findOne({ email });
    if (!user || !user.otp || !user.otpExpiry) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (user.otpExpiry < new Date()) {
      throw new UnauthorizedException('OTP has expired');
    }

    // OTP is valid, reset password
    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return { message: 'Password reset successfully' };
  }
}
