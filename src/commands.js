import { REST, Routes } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

const { TOKEN, CLIENT_ID } = process.env;

if (!TOKEN) {
  throw new Error("Missing bot token in environment variables");
}

if (!CLIENT_ID) {
  throw new Error("Missing client ID in environment variables");
}

const commands = [
  {
    name: "endstage",
    description:
      "Move everyone out of the war room stage channel into a main comms vc and close the stage",
    defaultMemberPermissions: "0",
  },
  {
    name: "endwargames",
    description:
      "Move everyone out of the war game channels into a main war games vc",
    defaultMemberPermissions: "0",
  },
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

try {
  console.log("Started refreshing application (/) commands.");

  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands,
  });

  console.log("Successfully reloaded application (/) commands.");
} catch (error) {
  console.error(error);
}
