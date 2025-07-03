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

const STAFF_ROLES = ["1309271313398894643", "1309284427553312769"];
const COMMAND_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
const commandCooldowns = new Map();

// War reminder configuration
const WAR_REMINDERS_ENABLED = false; // Set to false to disable war reminders

// Hailstorm Category (Private)
const HAILSTORM_CATEGORY_ID = "1315075287754608782";
const HAILSTORM_CREATE_VC_ID = "1376040302741291089";
const HAILSTORM_MAIN_VC_ID = "1315076035498479666";
const HAILSTORM_CONNECT_ROLE = "1315072176839327846";

// Public Category
const PUBLIC_CATEGORY_ID = "1311765614355943434";
const PUBLIC_CREATE_VC_ID = "1368646169198202981";
const PUBLIC_MAIN_VC_ID = "1311755513582583920";

// Hazardous (Member Role Restricted)
const HAZARDOUS_CREATE_VC_ID = "1376041758038691880";
const HAZARDOUS_CONNECT_ROLE = "1309573703474085908";

// GW2
const GW2_CATEGORY_ID = "1375282584497688647";
const GW2_CREATE_VC_ID = "1390432229078995035";
const GW2_MAIN_VC_ID = "1390056938502361239";
const GW2_CONNECT_ROLE = "1388217225751691465";

// Warborne
const WARBORNE_ROLE = "1366208130802782208";
const WARBORNE_REMINDER_CHANNEL = "1366818093799837806";

const PINGABLE_ROLES = [
  "1316112180298383371", // War Games
  "1316112144600662176", // PVP
  "1326419727698104320", // Runes
  "1326419959705767976", // Dungeons
  "1328922478617296976", // Contracts
  "1331673372127399977", // Island
];
const PING_PERMISSION_HOURS = {
  start: { hour: 16, minute: 30 }, // 4:30 PM EST
  end: { hour: 1, minute: 0 }, // 1:00 AM EST (midnight)
};

const WAR_REMINDER_CONFIG = {
  channelId: WARBORNE_REMINDER_CHANNEL, // Channel to send reminders in
  roleId: WARBORNE_ROLE,
  reminders: [
    { hour: 14, minute: 30 }, // 2:30 PM EST
    { hour: 19, minute: 30 }, // 7:30 PM EST
  ],
  messageTemplate: "War at {time} {relative} -- Start getting on to prep!",
};

const VC_SYSTEMS = {
  public: {
    createChannelId: PUBLIC_CREATE_VC_ID,
    categoryId: PUBLIC_CATEGORY_ID,
    protectedChannels: [PUBLIC_CREATE_VC_ID, PUBLIC_MAIN_VC_ID],
    isRestricted: false,
  },
  hailstorm: {
    createChannelId: HAILSTORM_CREATE_VC_ID,
    categoryId: HAILSTORM_CATEGORY_ID,
    protectedChannels: [HAILSTORM_CREATE_VC_ID, HAILSTORM_MAIN_VC_ID],
    isRestricted: true,
    connectRoleId: HAILSTORM_CONNECT_ROLE,
  },
  gw2: {
    createChannelId: GW2_CREATE_VC_ID,
    categoryId: GW2_CATEGORY_ID,
    protectedChannels: [GW2_CREATE_VC_ID, GW2_MAIN_VC_ID],
    isRestricted: true,
    connectRoleId: GW2_CONNECT_ROLE,
  },
  hazardous: {
    createChannelId: HAZARDOUS_CREATE_VC_ID,
    categoryId: PUBLIC_CATEGORY_ID,
    protectedChannels: [HAZARDOUS_CREATE_VC_ID, PUBLIC_MAIN_VC_ID],
    isRestricted: true,
    connectRoleId: HAZARDOUS_CONNECT_ROLE,
  },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const hasStaffRole = (member) =>
  member.user.id === "107391298171891712" ||
  STAFF_ROLES.some((role) => member.roles.cache.has(role));

const scheduleWarReminder = () => {
  if (!WAR_REMINDERS_ENABLED) {
    Logger.info("War reminders are disabled");
    return;
  }

  const est = DateTime.now().setZone("America/New_York");
  const currentTime = est.hour * 60 + est.minute;

  // Find the next reminder time
  const nextReminder = WAR_REMINDER_CONFIG.reminders
    .map((time) => ({
      hour: time.hour,
      minute: time.minute,
      totalMinutes: time.hour * 60 + time.minute,
    }))
    .sort((a, b) => {
      const aTime = a.totalMinutes;
      const bTime = b.totalMinutes;
      const aDelay =
        aTime <= currentTime
          ? aTime + 24 * 60 - currentTime
          : aTime - currentTime;
      const bDelay =
        bTime <= currentTime
          ? bTime + 24 * 60 - currentTime
          : bTime - currentTime;
      return aDelay - bDelay;
    })[0];

  const nextReminderTime = nextReminder.totalMinutes;
  let minutesUntilReminder =
    nextReminderTime <= currentTime
      ? nextReminderTime + 24 * 60 - currentTime
      : nextReminderTime - currentTime;

  // Add 1 minute to ensure we're past the exact time
  minutesUntilReminder += 1;

  Logger.info(`Next war reminder scheduled in ${minutesUntilReminder} minutes`);

  // Schedule the next reminder
  setTimeout(async () => {
    try {
      // Calculate the war time (30 minutes after reminder)
      const warTime = DateTime.now()
        .setZone("America/New_York")
        .plus({ minutes: 30 })
        .set({
          hour: nextReminder.hour,
          minute: nextReminder.minute + 30,
        });

      // Create Discord timestamps
      const unixTimestamp = Math.floor(warTime.toSeconds());
      const timeString = `<t:${unixTimestamp}:t>`;
      const relativeString = `<t:${unixTimestamp}:R>`;

      const channel = await client.channels.fetch(
        WAR_REMINDER_CONFIG.channelId
      );
      if (channel) {
        const message = WAR_REMINDER_CONFIG.messageTemplate
          .replace("{time}", timeString)
          .replace("{relative}", relativeString);

        await channel.send(`<@&${WAR_REMINDER_CONFIG.roleId}>\n\n${message}`);
        Logger.info(`Sent war reminder in ${channel.name}`);
      }
    } catch (error) {
      Logger.error(`Failed to send war reminder: ${error.message}`);
    }
    // Schedule the next reminder
    scheduleWarReminder();
  }, minutesUntilReminder * 60 * 1000);
};

client.on("ready", () => {
  Logger.info(`Bot logged in as ${client.user.tag}`);

  // Set the bot's presence to "Radee"
  client.user.setPresence({
    activities: [{ name: "Radee" }],
    status: "online",
  });

  // Initial update
  updateRolePingPermissions(client.guilds.cache.first());

  // Schedule next updates
  scheduleNextPingUpdate();

  // Schedule war reminder
  scheduleWarReminder();
});

const scheduleNextPingUpdate = () => {
  const est = DateTime.now().setZone("America/New_York");
  const currentTime = est.hour * 60 + est.minute;
  const startTime =
    PING_PERMISSION_HOURS.start.hour * 60 + PING_PERMISSION_HOURS.start.minute;
  const endTime =
    PING_PERMISSION_HOURS.end.hour * 60 + PING_PERMISSION_HOURS.end.minute;

  let minutesUntilChange;

  // If start time is after end time (crosses midnight)
  if (PING_PERMISSION_HOURS.start.hour > PING_PERMISSION_HOURS.end.hour) {
    if (currentTime >= startTime) {
      // We're in the evening portion, wait until end time tomorrow
      minutesUntilChange = 24 * 60 - currentTime + endTime;
    } else if (currentTime < endTime) {
      // We're in the morning portion, wait until end time today
      minutesUntilChange = endTime - currentTime;
    } else {
      // We're between end time and start time, wait until start time today
      minutesUntilChange = startTime - currentTime;
    }
  } else {
    // Regular time window (doesn't cross midnight)
    if (currentTime < startTime) {
      minutesUntilChange = startTime - currentTime;
    } else if (currentTime < endTime) {
      minutesUntilChange = endTime - currentTime;
    } else {
      minutesUntilChange = 24 * 60 - currentTime + startTime;
    }
  }

  minutesUntilChange += 1;

  Logger.info(`Minutes until change: ${minutesUntilChange}`);

  // Schedule the next update
  setTimeout(() => {
    updateRolePingPermissions(client.guilds.cache.first())
      .then(() => scheduleNextPingUpdate())
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
  // Bypass cooldown for specific user
  if (userId === "107391298171891712") return;

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
    embeds: [embed],
    components: [row],
  });

  return controlMessage;
};

const createUserVC = async (member, systemKey) => {
  const config = VC_SYSTEMS[systemKey];
  if (!config) throw new Error(`Invalid VC system: ${systemKey}`);

  const guild = member.guild;
  const category = guild.channels.cache.get(config.categoryId);

  const userName = (
    member.nickname ||
    member.displayName ||
    member.user.username
  )
    .trim()
    .slice(0, 12);
  const channelName = `${userName}'s Room`;

  try {
    // Base permissions that are always needed
    const permissionOverwrites = [
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
    ];

    // Add specific permissions based on whether it's restricted or open
    if (config.isRestricted) {
      permissionOverwrites.push(
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
          ],
        },
        {
          id: config.connectRoleId,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
        }
      );
    } else {
      permissionOverwrites.push({
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.SendMessages],
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      });
    }

    const voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: category,
      permissionOverwrites,
    });

    await member.voice.setChannel(voiceChannel);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await createVCControlPanel(voiceChannel, member);

    return voiceChannel;
  } catch (error) {
    Logger.error(`Failed to create user VC in ${systemKey}: ${error.message}`);
    throw error;
  }
};

const handleEmptyChannel = async (channel) => {
  // Check if channel is in any of our managed categories
  const isInManagedCategory = Object.values(VC_SYSTEMS).some(
    (config) => channel.parentId === config.categoryId
  );
  if (!isInManagedCategory) return;

  // Check if channel is protected in any category
  const isProtected = Object.values(VC_SYSTEMS).some((config) =>
    config.protectedChannels.includes(channel.id)
  );
  if (isProtected) return;

  try {
    await channel.delete();
    Logger.info(`Deleted voice channel: ${channel.name}`);
  } catch (error) {
    Logger.error(`Failed to delete channel: ${error.message}`);
  }
};

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // Find which VC system this belongs to (if any)
    const system = Object.entries(VC_SYSTEMS).find(
      ([_, config]) => config.createChannelId === newState.channelId
    );

    if (system) {
      const [systemKey, _] = system;
      const createChannel = newState.guild.channels.cache.get(
        newState.channelId
      );
      if (!createChannel || !createChannel.members.has(newState.member.id)) {
        return;
      }
      await createUserVC(newState.member, systemKey);
    }

    if (oldState.channel && oldState.channel.members?.size === 0) {
      try {
        const channel = await oldState.guild.channels.fetch(oldState.channelId);
        if (channel) {
          await handleEmptyChannel(channel);
        }
      } catch (channelError) {
        if (channelError.code !== 10003) {
          Logger.error(`Channel handling error: ${channelError.message}`);
        }
      }
    }
  } catch (error) {
    if (!error.message.includes("Unknown Channel")) {
      Logger.error(`Voice state update error: ${error.message}`);
    }
  }
});

const isWithinPingHours = () => {
  const est = DateTime.now().setZone("America/New_York");
  const currentTime = est.hour * 60 + est.minute;
  const startTime =
    PING_PERMISSION_HOURS.start.hour * 60 + PING_PERMISSION_HOURS.start.minute;
  const endTime =
    PING_PERMISSION_HOURS.end.hour * 60 + PING_PERMISSION_HOURS.end.minute;

  // If start time is after end time, it means the window crosses midnight
  if (PING_PERMISSION_HOURS.start.hour > PING_PERMISSION_HOURS.end.hour) {
    return currentTime >= startTime || currentTime < endTime;
  } else {
    return currentTime >= startTime && currentTime < endTime;
  }
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

  addrole: async (interaction) => {
    const filterRole = interaction.options.getRole("filter_role");
    const targetRole = interaction.options.getRole("target_role");
    const shouldRemove = interaction.options.getBoolean("remove") ?? false;

    // Fetch all guild members (this may take a while for large servers)
    await interaction.guild.members.fetch();

    // Get members with the filter role
    const membersWithRole = interaction.guild.members.cache.filter((member) =>
      member.roles.cache.has(filterRole.id)
    );

    if (membersWithRole.size === 0) {
      return `No members found with the role ${filterRole.name}`;
    }

    let successCount = 0;
    let failCount = 0;

    // Process role updates
    const action = shouldRemove ? "remove" : "add";
    for (const [, member] of membersWithRole) {
      try {
        if (shouldRemove) {
          await member.roles.remove(targetRole);
        } else {
          await member.roles.add(targetRole);
        }
        successCount++;
      } catch (error) {
        Logger.error(
          `Failed to ${action} role for ${member.user.tag}: ${error.message}`
        );
        failCount++;
      }
    }

    const actionText = shouldRemove ? "removed from" : "added to";
    return `✅ Role update complete:\n- ${
      targetRole.name
    } ${actionText} ${successCount} members with ${filterRole.name}${
      failCount ? `\n- ⚠️ Failed for ${failCount} members` : ""
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

    // Verify creator
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

    // Find which system this channel belongs to
    const system = Object.values(VC_SYSTEMS).find(
      (config) => voiceChannel.parentId === config.categoryId
    );

    if (system) {
      if (system.isRestricted) {
        // Restricted behavior - toggle the specific connect role
        if (action === "lock") {
          await voiceChannel.permissionOverwrites.edit(system.connectRoleId, {
            Connect: false,
            ViewChannel: true,
          });
        } else {
          await voiceChannel.permissionOverwrites.edit(system.connectRoleId, {
            Connect: true,
            ViewChannel: true,
          });
        }
      } else {
        // Open behavior - toggle @everyone
        if (action === "lock") {
          await voiceChannel.permissionOverwrites.edit(
            voiceChannel.guild.roles.everyone,
            {
              Connect: false,
            }
          );
        } else {
          await voiceChannel.permissionOverwrites.edit(
            voiceChannel.guild.roles.everyone,
            {
              Connect: true,
            }
          );
        }
      }
    }

    await interaction.reply({
      content:
        action === "lock"
          ? "🔒 Voice channel locked!"
          : "🔓 Voice channel unlocked!",
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    Logger.error(`Button interaction error: ${error.message}`);
    await interaction.reply({
      content: "❌ An error occurred while managing the voice channel.",
      flags: MessageFlags.Ephemeral,
    });
  }
});

client.login(process.env.TOKEN);
