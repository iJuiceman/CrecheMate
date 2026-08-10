export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: "admin" | "educator";
}
