export class RegisterMerchantDto {
  email!: string;
  password!: string;
  name?: string;
  websiteUrl!: string;
  callbackUrl!: string;
}

export class LoginMerchantDto {
  email!: string;
  password!: string;
}

export class UpdateMerchantProfileDto {
  websiteUrl?: string;
  callbackUrl?: string;
}

export class UpdateMerchantPermissionsDto {
  allowDeposit?: boolean;
  allowWithdrawal?: boolean;
}

export class AddPhoneWhitelistDto {
  phoneNumber!: string;
  direction!: 'DEPOSIT' | 'WITHDRAW';
}

export class CreateMerchantApplicationDto {
  name!: string;
  websiteUrl!: string;
  callbackUrl!: string;
}

export class UpdateMerchantApplicationDto {
  name?: string;
  websiteUrl?: string;
  callbackUrl?: string;
  isActive?: boolean;
}

export class MerchantMoneyDto {
  amount!: number;
  currency?: string;
  reference?: string;
  description?: string;
}
