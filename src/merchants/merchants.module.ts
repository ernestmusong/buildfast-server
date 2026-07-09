import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantGuard } from './merchant.guard';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [PrismaModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, MerchantGuard],
  exports: [MerchantsService],
})
export class MerchantsModule {}
