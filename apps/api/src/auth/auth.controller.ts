import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  ResendVerificationRequestSchema,
  VerifyEmailRequestSchema,
} from '@party-finder/shared';
import type {
  CsrfResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@party-finder/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CLIENT_IP } from '../common/core.module';
import type { ClientIpResolver } from '../common/client-ip';
import { Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { clientIpOf, IpRateLimited } from './auth.guards';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(CLIENT_IP) private readonly clientIp: ClientIpResolver,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(202)
  @IpRateLimited({ name: 'register:ip', limit: 3, windowSeconds: 60 * 60 })
  register(
    @Body(new ZodPipe(RegisterRequestSchema)) body: RegisterRequest,
    @Req() req: FastifyRequest,
  ): Promise<RegisterResponse> {
    return this.auth.register(body, clientIpOf(this.clientIp, req)) as Promise<RegisterResponse>;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @IpRateLimited({ name: 'verify:ip', limit: 10, windowSeconds: 60 })
  verifyEmail(
    @Body(new ZodPipe(VerifyEmailRequestSchema)) body: VerifyEmailRequest,
  ): Promise<VerifyEmailResponse> {
    return this.auth.verifyEmail(body.token) as Promise<VerifyEmailResponse>;
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  @IpRateLimited({ name: 'resend:ip', limit: 10, windowSeconds: 60 * 60 })
  resendVerification(
    @Body(new ZodPipe(ResendVerificationRequestSchema)) body: ResendVerificationRequest,
  ): Promise<ResendVerificationResponse> {
    return this.auth.resendVerification(body) as Promise<ResendVerificationResponse>;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @IpRateLimited({ name: 'login:ip', limit: 5, windowSeconds: 60 })
  async login(
    @Body(new ZodPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const { user, session } = await this.auth.login(body, req.appSession?.id);
    this.sessions.setCookie(reply, session.id);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (req.appSession) await this.auth.logout(req.appSession.id);
    this.sessions.clearCookie(reply);
  }

  @Public()
  @Get('me')
  me(@Req() req: FastifyRequest): MeResponse {
    const session = req.appSession;
    if (!session?.userId || !session.username) return { user: null };
    return { user: { id: session.userId, username: session.username } };
  }

  /** Creates an anonymous session when there is none, so public forms can carry a CSRF token. */
  @Public()
  @Get('csrf')
  async csrf(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CsrfResponse> {
    let session = req.appSession;
    if (!session) {
      session = await this.sessions.create();
      this.sessions.setCookie(reply, session.id);
    }
    return { token: session.csrf };
  }
}
