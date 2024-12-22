import { Client, GatewayIntentBits } from "discord.js";
import * as dotenv from "dotenv";
import chalk from "chalk";

dotenv.config();

const Logger = {
  formatMessage: (type, msg) => `[${new Date().toISOString()}] ${type} ${msg}`,
  info: (msg) => console.log(chalk.blue(Logger.formatMessage("INFO", msg))),
  command: (msg) => console.log(chalk.green(Logger.formatMessage("CMD", msg))),
  warn: (msg) => console.log(chalk.yellow(Logger.formatMessage("WARN", msg))),
  error: (msg) => console.log(chalk.red(Logger.formatMessage("ERROR", msg))),
};

const STAGE_CHANNEL_ID = "1315169123147317299";
const MAINVC_CHANNEL_ID = "1309266911703334956";
const STAFF_ROLES = ["1309271313398894643", "1309284427553312769"];
const WARGAMES_TEAM_VCS = [
  "1315081114540310559",
  "1315081154453311540",
  "1315081197285802004",
  "1315081224527675392",
];
const WARGAMES_LOBBY_VC = "1315080996516921344";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const hasStaffRole = (member) =>
  STAFF_ROLES.some((role) => member.roles.cache.has(role));

client.on("ready", () => {
  Logger.info(`Bot logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!hasStaffRole(interaction.member)) {
    await interaction.reply({
      content: "You don't have permission to use this command",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (interaction.commandName === "endwargames") {
      const targetChannel =
        interaction.guild.channels.cache.get(WARGAMES_LOBBY_VC);
      if (!targetChannel) throw new Error("Target channel not found");

      let moved = 0,
        failed = 0;

      for (const channelId of WARGAMES_TEAM_VCS) {
        const sourceChannel = interaction.guild.channels.cache.get(channelId);
        if (!sourceChannel) continue;

        for (const [, member] of sourceChannel.members) {
          try {
            await member.voice.setChannel(targetChannel);
            moved++;
          } catch {
            failed++;
          }
        }
      }

      Logger.command(`War games ended: ${moved} moved, ${failed} failed`);
      await interaction.editReply({
        content: `✅ War games ended:\n- ${moved} members moved${
          failed ? `\n- ${failed} members failed to move` : ""
        }`,
      });
    }

    if (interaction.commandName === "endstage") {
      const stageChannel =
        interaction.guild.channels.cache.get(STAGE_CHANNEL_ID);
      const targetChannel =
        interaction.guild.channels.cache.get(MAINVC_CHANNEL_ID);

      if (!stageChannel || !targetChannel)
        throw new Error("Stage channel or target channel not found");

      const voiceMembers = stageChannel.members.filter(
        (member) => member.voice.channelId === STAGE_CHANNEL_ID
      );

      if (!voiceMembers.size) throw new Error("No members in stage channel");

      let moved = 0,
        failed = 0;
      let stageInstance;

      for (const [, member] of voiceMembers) {
        try {
          await member.voice.setChannel(targetChannel);
          moved++;
        } catch {
          failed++;
        }
      }

      try {
        stageInstance = stageChannel.stageInstance;
        if (stageInstance) await stageInstance.delete();
      } catch (error) {
        Logger.error(`Failed to delete stage instance: ${error}`);
      }

      Logger.command(
        `Stage ended: ${moved} moved, ${failed} failed, stage ${
          stageInstance ? "closed" : "unchanged"
        }`
      );
      await interaction.editReply({
        content: `✅ Stage ended:\n- ${moved} members moved${
          failed ? `\n- ${failed} members failed to move` : ""
        }\n- Stage channel ${stageInstance ? "closed" : "unchanged"}`,
      });
    }

    if (interaction.commandName === "movetowarroom") {
      const sourceChannel =
        interaction.guild.channels.cache.get(MAINVC_CHANNEL_ID);
      const targetChannel =
        interaction.guild.channels.cache.get(STAGE_CHANNEL_ID);

      if (!sourceChannel || !targetChannel)
        throw new Error("Source channel or target channel not found");

      const voiceMembers = sourceChannel.members.filter(
        (member) => member.voice.channelId === MAINVC_CHANNEL_ID
      );

      if (!voiceMembers.size)
        throw new Error("No members in main voice channel");

      let moved = 0,
        failed = 0;

      for (const [, member] of voiceMembers) {
        try {
          await member.voice.setChannel(targetChannel);
          moved++;
        } catch {
          failed++;
        }
      }

      Logger.command(`Moved to war room: ${moved} moved, ${failed} failed`);
      await interaction.editReply({
        content: `✅ Moved to war room:\n- ${moved} members moved${
          failed ? `\n- ${failed} members failed to move` : ""
        }`,
      });
    }
  } catch (error) {
    Logger.error(`Error in ${interaction.commandName} command: ${error}`);
    await interaction.editReply({
      content: "An error occurred. Please try again or contact an admin.",
    });
  }
});

client.login(process.env.TOKEN);
