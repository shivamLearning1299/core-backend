import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Relies on the 'jwt' passport strategy (JwtStrategy) having been registered
// somewhere in the app graph — currently via AuthModule's providers.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
