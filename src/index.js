import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import * as dotenv from "dotenv";
import chalk from "chalk";
import { createNightCycleEmbed } from "./nightCycle.js";
import { DateTime } from "luxon";

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
const CREATE_VC_ID = "1328916738133463073";
const USER_VC_CATEGORY_ID = "1315056498249830470"; // Category where the create-vc channel is
const PROTECTED_CATEGORY_CHANNELS = [
  CREATE_VC_ID,
  "1315169123147317299",
  "1309266911703334956",
  "1309270651185401938",
]; // Add IDs of channels that should never be deleted
const CONNECT_ROLE_ID = "1309573703474085908";
const PINGABLE_ROLES = [
  "1316112180298383371",
  "1316112144600662176",
  "1326419727698104320",
  "1326419959705767976",
];
const PING_PERMISSION_HOURS = {
  start: 17, // 5 PM EST
  end: 23, // 11 PM EST
};

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

  // Initial update
  updateRolePingPermissions(client.guilds.cache.first());

  // Schedule next updates
  scheduleNextPingUpdate();
});

const scheduleNextPingUpdate = () => {
  const est = DateTime.now().setZone("America/New_York");
  const currentHour = est.hour;

  // Calculate minutes until next state change
  let minutesUntilChange;
  if (currentHour < PING_PERMISSION_HOURS.start) {
    // Before start time, wait until start
    minutesUntilChange =
      (PING_PERMISSION_HOURS.start - currentHour) * 60 - est.minute;
  } else if (currentHour < PING_PERMISSION_HOURS.end) {
    // During allowed hours, wait until end
    minutesUntilChange =
      (PING_PERMISSION_HOURS.end - currentHour) * 60 - est.minute;
  } else {
    // After end time, wait until start tomorrow
    minutesUntilChange =
      (24 - currentHour + PING_PERMISSION_HOURS.start) * 60 - est.minute;
  }

  // Add 1 minute buffer to ensure we're in the next hour
  minutesUntilChange += 1;

  // Schedule the next update
  setTimeout(() => {
    updateRolePingPermissions(client.guilds.cache.first())
      .then(() => scheduleNextPingUpdate()) // Schedule next update after this one completes
      .catch((error) =>
        Logger.error(`Failed to update ping permissions: ${error.message}`)
      );
  }, minutesUntilChange * 60 * 1000);

  Logger.info(
    `Next ping permission update scheduled in ${minutesUntilChange} minutes`
  );
};

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

const createVCControlPanel = async (channel, creator) => {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lock_${channel.id}`)
      .setLabel("🔒 Lock VC")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`unlock_${channel.id}`)
      .setLabel("🔓 Unlock VC")
      .setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // Discord Blurple color
    .setTitle("🎤 Voice Channel Controls")
    .setDescription(`Only <@${creator.id}> can use these controls.`)
    .setFooter({ text: `Creator:${creator.id}` })
    .setTimestamp();

  const controlMessage = await channel.send({
    content: `<@${creator.id}>`,
    embeds: [embed],
    components: [row],
  });

  return controlMessage;
};

const createUserVC = async (member) => {
  const guild = member.guild;
  const category = guild.channels.cache.get(USER_VC_CATEGORY_ID);

  const userName = (
    member.nickname ||
    member.displayName ||
    member.user.username
  )
    .trim()
    .slice(0, 12);
  const channelName = `${userName}'s Channel`;

  try {
    const voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: category,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
          ],
        },
        {
          id: CONNECT_ROLE_ID,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ViewChannel,
          ],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
          ],
        },
      ],
    });

    // Move the user first
    await member.voice.setChannel(voiceChannel);

    // Wait a second before sending the control panel
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Then create control panel in the voice channel's text chat
    await createVCControlPanel(voiceChannel, member);

    return voiceChannel;
  } catch (error) {
    Logger.error(`Failed to create user VC: ${error.message}`);
    throw error;
  }
};

const handleEmptyChannel = async (channel) => {
  if (channel.parentId !== USER_VC_CATEGORY_ID) return;
  if (PROTECTED_CATEGORY_CHANNELS.includes(channel.id)) return;

  try {
    await channel.delete();
    Logger.info(`Deleted voice channel: ${channel.name}`);
  } catch (error) {
    Logger.error(`Failed to delete channel: ${error.message}`);
  }
};

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // If user is switching to create-vc channel
    if (newState.channelId === CREATE_VC_ID) {
      // Check if the channel still exists and user is still there
      const createChannel = newState.guild.channels.cache.get(CREATE_VC_ID);
      if (!createChannel || !createChannel.members.has(newState.member.id)) {
        return; // User already left or channel doesn't exist
      }
      await createUserVC(newState.member);
    }

    // Handle empty channels
    if (
      oldState.channel &&
      oldState.channel.members?.size === 0 &&
      !PROTECTED_CATEGORY_CHANNELS.includes(oldState.channelId)
    ) {
      // Verify channel still exists before trying to delete
      try {
        const channel = await oldState.guild.channels.fetch(oldState.channelId);
        if (channel) {
          await handleEmptyChannel(channel);
        }
      } catch (channelError) {
        // Channel was already deleted, we can ignore this error
        if (channelError.code !== 10003) {
          // 10003 is Unknown Channel error
          Logger.error(`Channel handling error: ${channelError.message}`);
        }
      }
    }
  } catch (error) {
    // Only log non-Unknown Channel errors
    if (!error.message.includes("Unknown Channel")) {
      Logger.error(`Voice state update error: ${error.message}`);
    }
  }
});

const isWithinPingHours = () => {
  const est = DateTime.now().setZone("America/New_York");
  const currentHour = est.hour;
  return (
    currentHour >= PING_PERMISSION_HOURS.start &&
    currentHour < PING_PERMISSION_HOURS.end
  );
};

const updateRolePingPermissions = async (guild) => {
  const canPing = isWithinPingHours();
  Logger.info(
    `Updating role ping permissions. Pinging ${
      canPing ? "enabled" : "disabled"
    }`
  );

  for (const roleId of PINGABLE_ROLES) {
    try {
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        Logger.error(`Role not found: ${roleId}`);
        continue;
      }

      await role.setMentionable(canPing, "Automatic ping permission update");
      Logger.info(
        `Updated role ${role.name} (${roleId}): mentionable = ${canPing}`
      );
    } catch (error) {
      Logger.error(`Failed to update role ${roleId}: ${error.message}`);
    }
  }
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

  night: async (interaction) => {
    const time = interaction.options.getString("time");
    const date = interaction.options.getString("date");
    const timezone = interaction.options.getString("timezone") || "EST";

    const embed = createNightCycleEmbed(time, timezone, date);
    await interaction.editReply({ embeds: [embed] });
    return null;
  },

  listvc: async (interaction) => {
    const channel = interaction.options.getChannel("channel");

    if (![2, 13].includes(channel.type)) {
      throw new Error("Please select a voice or stage channel");
    }

    const usernames = getMembersInVoice(channel)
      .filter((member) => !member.voice.deaf)
      .map((member) => member.user.username);

    if (usernames.length === 0) {
      return `${channel.name} is empty`;
    }

    // Split into chunks of reasonable size
    const chunks = [];
    let currentChunk = "";

    for (const username of usernames) {
      const nextChunk = currentChunk
        ? `${currentChunk}, ${username}`
        : username;

      if (nextChunk.length > 1900) {
        // Safe limit under 2000
        chunks.push(currentChunk);
        currentChunk = username;
      } else {
        currentChunk = nextChunk;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    // Send first chunk as main response
    await interaction.editReply({ content: chunks[0] });

    // Send additional chunks as follow-up messages
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({
        content: chunks[i],
        flags: MessageFlags.Ephemeral,
      });
    }

    return null;
  },
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  try {
    if (!hasStaffRole(interaction.member)) {
      throw new Error("You don't have permission to use this command");
    }

    if (commandName !== "night") {
      checkCooldown(user.id, commandName);
    }

    const command = commands[commandName];
    if (!command) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });
    const response = await command(interaction);

    // Only edit reply if there's a response
    if (response !== null) {
      await interaction.editReply({ content: response });
    }

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
        flags: MessageFlags.Ephemeral,
      });
    }

    Logger.error(`Error in ${commandName}: ${error.message}`);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, channelId] = interaction.customId.split("_");
  if (!["lock", "unlock"].includes(action)) return;

  try {
    const voiceChannel = interaction.guild.channels.cache.get(channelId);
    if (!voiceChannel) {
      await interaction.reply({
        content: "❌ Voice channel not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get the control message and extract creator ID from embed footer
    const messages = await voiceChannel.messages.fetch({ limit: 10 });
    const controlMessage = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds[0]?.title === "🎤 Voice Channel Controls"
    );

    if (!controlMessage) {
      await interaction.reply({
        content: "❌ Control panel not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const creatorId =
      controlMessage.embeds[0].footer.text.match(/Creator:(\d+)/)?.[1];

    if (creatorId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ Only the VC creator can use these controls.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "lock") {
      await voiceChannel.permissionOverwrites.edit(CONNECT_ROLE_ID, {
        Connect: false,
        ViewChannel: true, // Keep the view permission
      });
      await interaction.reply({
        content: "🔒 Voice channel locked!",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await voiceChannel.permissionOverwrites.edit(CONNECT_ROLE_ID, {
        Connect: true,
        ViewChannel: true, // Keep the view permission
      });
      await interaction.reply({
        content: "🔓 Voice channel unlocked!",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    Logger.error(`Button interaction error: ${error.message}`);
    await interaction.reply({
      content: "❌ An error occurred while managing the voice channel.",
      flags: MessageFlags.Ephemeral,
    });
  }
});

client.login(process.env.TOKEN);
