import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AddPhoneWhitelistDto,
  LoginMerchantDto,
  RegisterMerchantDto,
  UpdateMerchantPermissionsDto,
  UpdateMerchantProfileDto,
} from './dto/merchant.dto';
import { MerchantGuard } from './merchant.guard';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post('register')
  register(@Body() dto: RegisterMerchantDto) {
    return this.merchantsService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginMerchantDto) {
    return this.merchantsService.login(dto);
  }

  @UseGuards(AuthGuard, MerchantGuard)
  @Get('me')
  me(@AuthUser() user: AuthenticatedUser) {
    return this.merchantsService.getProfile(user.sub);
  }

  @UseGuards(AuthGuard, MerchantGuard)
  @Patch('profile')
  updateProfile(
    @AuthUser() user: AuthenticatedUser,
    @Body() dto: UpdateMerchantProfileDto,
  ) {
    return this.merchantsService.updateProfile(user.sub, dto);
  }

  @UseGuards(AuthGuard, MerchantGuard)
  @Patch('permissions')
  updatePermissions(
    @AuthUser() user: AuthenticatedUser,
    @Body() dto: UpdateMerchantPermissionsDto,
  ) {
    return this.merchantsService.updatePermissions(user.sub, dto);
  }

  @UseGuards(AuthGuard, MerchantGuard)
  @Post('phone-whitelist')
  addPhoneWhitelist(
    @AuthUser() user: AuthenticatedUser,
    @Body() dto: AddPhoneWhitelistDto,
  ) {
    return this.merchantsService.addPhoneWhitelist(user.sub, dto);
  }

  @UseGuards(AuthGuard, MerchantGuard)
  @Get('phone-whitelist')
  listPhoneWhitelist(
    @AuthUser() user: AuthenticatedUser,
    @Query('direction') direction?: string,
  ) {
    return this.merchantsService.listPhoneWhitelist(user.sub, direction);
  }

  @UseGuards(AuthGuard, MerchantGuard)
  @Delete('phone-whitelist/:id')
  removePhoneWhitelist(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.merchantsService.removePhoneWhitelist(user.sub, id);
  }
}
