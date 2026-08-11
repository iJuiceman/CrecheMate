import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Behind nginx (TLS termination + reverse proxy): trust the first proxy hop
  // so req.ip / rate limiting see the real client address via X-Forwarded-For.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
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
