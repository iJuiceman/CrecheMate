import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Behind nginx (TLS termination + reverse proxy) we trust the first proxy hop
  // so req.ip / rate limiting see the real client via X-Forwarded-For. But when
  // the API is exposed directly (e.g. the LAN dev compose on 0.0.0.0), trusting
  // XFF lets any client spoof its IP — forging the audit trail and rotating the
  // rate-limit key. So it's opt-out via TRUST_PROXY=false for direct exposure.
  const trustProxy = process.env.TRUST_PROXY === "false" ? false : 1;
  app.getHttpAdapter().getInstance().set("trust proxy", trustProxy);
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:5001").split(",").filter(Boolean),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  const port = Number(process.env.PORT) || 5000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`CrecheMate API listening on :${port}`);
}
void bootstrap();
