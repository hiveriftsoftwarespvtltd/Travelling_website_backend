import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  // In-memory store: IP -> { count, resetTime }
  private static attempts = new Map<string, RateLimitRecord>();

  // Max 15 attempts per 15 minutes window
  private readonly maxAttempts = 15;
  private readonly windowMs = 15 * 60 * 1000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown-ip';

    const now = Date.now();
    const record = AuthRateLimitGuard.attempts.get(clientIp);

    if (!record || now > record.resetTime) {
      AuthRateLimitGuard.attempts.set(clientIp, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      const waitMinutes = Math.ceil((record.resetTime - now) / 60000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many attempts from this IP. Please try again after ${waitMinutes} minute(s).`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;

    // Prune stale records periodically if map size exceeds 500
    if (AuthRateLimitGuard.attempts.size > 500) {
      for (const [ip, r] of AuthRateLimitGuard.attempts.entries()) {
        if (now > r.resetTime) {
          AuthRateLimitGuard.attempts.delete(ip);
        }
      }
    }

    return true;
  }
}
