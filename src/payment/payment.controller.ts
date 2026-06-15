import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /api/payment/create-order
   * Frontend calls this to get a Razorpay order_id before showing the payment modal
   */
  @Post('create-order')
  async createOrder(@Body() body: { amount: number; receipt?: string; currency?: string }) {
    if (!body.amount || body.amount <= 0) {
      throw new HttpException(
        { message: 'Invalid amount. Amount must be greater than 0.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const receipt = body.receipt || `TOURM-${Date.now()}`;
    const currency = body.currency || 'INR';

    return this.paymentService.createOrder(body.amount, currency, receipt);
  }

  /**
   * POST /api/payment/verify
   * Frontend calls this after payment success to verify the Razorpay signature
   * This is the crucial step that prevents fraudulent payment confirmations
   */
  @Post('verify')
  async verifyPayment(
    @Body()
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new HttpException(
        { message: 'Missing required payment verification fields.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const isValid = this.paymentService.verifyPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!isValid) {
      throw new HttpException(
        { message: 'Payment verification failed. Signature mismatch. Booking aborted.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      success: true,
      message: 'Payment verified successfully. Proceeding with booking.',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    };
  }
}
