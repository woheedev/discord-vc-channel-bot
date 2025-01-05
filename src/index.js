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
const COMMAND_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
const commandCooldowns = new Map();

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

const getChannel = (guild, channelId, name = "channel") => {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) throw new Error(`${name} not found (ID: ${channelId})`);
  return channel;
};

const getMembersInVoice = (channel, requiredChannelId = null) => {
  const members = Array.from(channel.members.values());
  return requiredChannelId
    ? members.filter((m) => m.voice.channelId === requiredChannelId)
    : members;
};

const moveMembers = async (members, targetChannel) => {
  if (!members.length) {
    throw new Error("No members to move");
  }

  const moves = members.map((member) => ({
    member,
    promise: member.voice
      .setChannel(targetChannel)
      .then(() => true)
      .catch((error) => {
        Logger.warn(`Failed to move ${member.user.tag}: ${error.message}`);
        return false;
      }),
  }));

  const results = await Promise.all(moves.map((m) => m.promise));
  return {
    moved: results.filter(Boolean).length,
    failed: results.filter((r) => !r).length,
  };
};

const checkCooldown = (userId, commandName) => {
  const key = `${userId}-${commandName}`;
  const cooldownEnd = commandCooldowns.get(key);

  if (cooldownEnd && Date.now() < cooldownEnd) {
    const remainingMs = cooldownEnd - Date.now();
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.ceil((remainingMs % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    throw new Error(
      `This command was recently used. Please wait ${timeStr} before using it again.`
    );
  }

  commandCooldowns.set(key, Date.now() + COMMAND_COOLDOWN);
};

const commands = {
  endwargames: async (interaction) => {
    const targetChannel = getChannel(
      interaction.guild,
      WARGAMES_LOBBY_VC,
      "lobby"
    );

    const membersToMove = WARGAMES_TEAM_VCS.flatMap((channelId) => {
      try {
        const channel = getChannel(
          interaction.guild,
          channelId,
          "team channel"
        );
        return getMembersInVoice(channel);
      } catch (error) {
        Logger.warn(error.message);
        return [];
      }
    });

    const { moved, failed } = await moveMembers(membersToMove, targetChannel);
    return `✅ War games ended:\n- ${moved} members moved${
      failed ? `\n- ⚠️ ${failed} members failed to move` : ""
    }`;
  },

  endstage: async (interaction) => {
    const stageChannel = getChannel(
      interaction.guild,
      STAGE_CHANNEL_ID,
      "stage"
    );
    const targetChannel = getChannel(
      interaction.guild,
      MAINVC_CHANNEL_ID,
      "main VC"
    );

    const membersToMove = getMembersInVoice(stageChannel, STAGE_CHANNEL_ID);
    const { moved, failed } = await moveMembers(membersToMove, targetChannel);

    let stageStatus = "unchanged";
    try {
      const { stageInstance } = stageChannel;
      if (stageInstance) {
        await stageInstance.delete();
        stageStatus = "closed";
      }
    } catch (error) {
      Logger.error(`Failed to delete stage instance: ${error.message}`);
      stageStatus = "failed to close";
    }

    return `✅ Stage ended:\n- ${moved} members moved${
      failed ? `\n- ⚠️ ${failed} members failed to move` : ""
    }\n- Stage ${stageStatus}`;
  },

  movetowarroom: async (interaction) => {
    const sourceChannel = getChannel(
      interaction.guild,
      MAINVC_CHANNEL_ID,
      "main VC"
    );
    const targetChannel = getChannel(
      interaction.guild,
      STAGE_CHANNEL_ID,
      "stage"
    );

    const membersToMove = getMembersInVoice(sourceChannel, MAINVC_CHANNEL_ID);
    const { moved, failed } = await moveMembers(membersToMove, targetChannel);

    return `✅ Moved to war room:\n- ${moved} members moved${
      failed ? `\n- ⚠️ ${failed} members failed to move` : ""
    }`;
  },
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  try {
    if (!hasStaffRole(interaction.member)) {
      throw new Error("You don't have permission to use this command");
    }

    checkCooldown(user.id, commandName);

    const command = commands[commandName];
    if (!command) return;

    await interaction.deferReply({ ephemeral: true });
    const response = await command(interaction);
    await interaction.editReply({ content: response });

    Logger.command(`${user.tag} used /${commandName}`);
  } catch (error) {
    const errorMessage =
      error.message ||
      "An error occurred. Please try again or contact an admin.";

    if (interaction.deferred) {
      await interaction.editReply({ content: `❌ ${errorMessage}` });
    } else {
      await interaction.reply({
        content: `❌ ${errorMessage}`,
        ephemeral: true,
      });
    }

    Logger.error(`Error in ${commandName}: ${error.message}`);
  }
});

client.login(process.env.TOKEN);
