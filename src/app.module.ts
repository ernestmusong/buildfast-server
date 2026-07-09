import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MerchantsModule } from './merchants/merchants.module';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        return {
          stores: [
            new Keyv({ ttl: 60000 }),
            new KeyvRedis('redis://localhost:6379'),
          ],
        };
      },
    }),
    PrismaModule,
    AuthModule,
    MerchantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
