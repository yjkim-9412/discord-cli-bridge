import "dotenv/config";
import { DiscordCliBridge } from "./discord-bot.js";

async function main() {
  const bridge = new DiscordCliBridge();

  const stop = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    await bridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void stop("SIGINT");
  });

  process.on("SIGTERM", () => {
    void stop("SIGTERM");
  });

  await bridge.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
