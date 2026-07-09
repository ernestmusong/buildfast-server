export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: string;
};

export type AuthenticatedUser = AuthTokenPayload;
