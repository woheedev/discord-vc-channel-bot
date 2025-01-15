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
  {
    name: "movetowarroom",
    description: "Move everyone from main VC to the war room stage channel",
    defaultMemberPermissions: "0",
  },
  {
    name: "night",
    description: "Check night cycle information",
    options: [
      {
        name: "time",
        description: "Check a specific time (e.g., 8:00 PM or 2000)",
        type: 3, // STRING type
        required: false,
      },
      {
        name: "date",
        description: "Specific date (MM/DD/YY)",
        type: 3, // STRING type
        required: false,
      },
      {
        name: "timezone",
        description: "US timezone (EST, CST, MST, PST)",
        type: 3, // STRING type
        required: false,
        choices: [
          { name: "Eastern (EST)", value: "EST" },
          { name: "Central (CST)", value: "CST" },
          { name: "Mountain (MST)", value: "MST" },
          { name: "Pacific (PST)", value: "PST" },
        ],
      },
    ],
  },
  {
    name: "listvc",
    description: "List all users in a voice channel",
    options: [
      {
        name: "channel",
        description: "The voice channel to list users from",
        type: 7, // CHANNEL type
        required: true,
        channel_types: [2, 13], // Voice Channel (2) and Stage Channel (13)
      },
    ],
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
