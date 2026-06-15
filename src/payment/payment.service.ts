import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');

@Injectable()
export class PaymentService {
  private razorpay: any;
  private readonly KEY_ID: string;
  private readonly KEY_SECRET: string;

  constructor(private readonly configService: ConfigService) {
    this.KEY_ID = this.configService.get<string>('RAZORPAY_KEY_ID') || '';
    this.KEY_SECRET = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

    this.razorpay = new Razorpay({
      key_id: this.KEY_ID,
      key_secret: this.KEY_SECRET,
    });
  }

  /**
   * Creates a Razorpay order
   * @param amount - amount in INR (will be converted to paise)
   * @param currency - defaults to INR
   * @param receipt - unique receipt identifier
   */
  async createOrder(amount: number, currency = 'INR', receipt: string) {
    try {
      const amountInPaise = Math.round(amount * 100);
      const options = {
        amount: amountInPaise,
        currency,
        receipt,
        payment_capture: 1, // Auto-capture payment
      };

      const order = await this.razorpay.orders.create(options);
      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        keyId: this.KEY_ID, // Return key_id to frontend for Razorpay checkout
      };
    } catch (error) {
      throw new HttpException(
        { message: 'Failed to create Razorpay order', details: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Verifies the Razorpay payment signature after successful payment
   * This prevents tampering from the client side
   */
  verifyPayment(
    razorpay_order_id: string,
    razorpay_payment_id: string,
    razorpay_signature: string,
  ): boolean {
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.KEY_SECRET)
      .update(body)
      .digest('hex');

    return expectedSignature === razorpay_signature;
  }

  /**
   * Initiates a full refund for a given Razorpay payment ID
   */
  async processRefund(paymentId: string, amount: number, notes?: any) {
    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: Math.round(amount * 100), // convert to paise
        notes: notes || { reason: 'Automated refund' }
      });
      return { success: true, refundId: refund.id, status: refund.status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
