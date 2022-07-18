import { ChannelType, CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { getPeaks, getPrefix, getGuildCounter, setGuildCounter, createGuildCounter } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { logger } from "../utils/logger";

const cmd = new Command("membercount", "create an updating member count channel for your server", Categories.ADMIN)
    .setAliases(["counter"])
    .setPermissions(["MANAGE_SERVER"]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
        }
        return;
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage channels` permission for this command to work")],
        });
    }

    let profile = await getGuildCounter(message.guild);
    if (!profile) {
        await createGuildCounter(message.guild);
        profile = await getGuildCounter(message.guild);
    }
    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(
            message.member,
            `**enabled** \`${profile.enabled}\`\n**filter bots** \`${profile.filterBots}\`\n**channel** \`${profile.channel}\`\n**format** \`${profile.format}\``
        )
            .setHeader("member count")
            .setFooter({ text: `use ${prefix}counter help to view additional commands` });

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "help") {
        const embed = new CustomEmbed(
            message.member,
            `${prefix}**counter enable** *enables the counter and creates a channel with the current format*\n` +
                `${prefix}**counter disable** *disables the counter and does NOT delete the channel*\n` +
                `${prefix}**counter format** *view/change the current channel format*\n` +
                `${prefix}**counter filterbots** *view/change the setting to filter bots*\n` +
                `${prefix}**counter channel** *set a channel as the channel to be used*`
        )
            .setHeader("member count")
            .setFooter({ text: "channel will be updated every 10 minutes" });

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "enable") {
        if (profile.enabled) {
            return message.channel.send({ embeds: [new ErrorEmbed("already enabled")] });
        }

        const role = message.guild.roles.cache.find((r) => r.name == "@everyone");

        let memberCount = await message.guild.members.fetch();

        if (profile.filterBots) {
            memberCount = memberCount.filter((m) => !m.user.bot);
        }

        let format = "";

        format = profile.format.split("%count%").join(memberCount.size.toLocaleString());
        format = format.split("%peak%").join((await getPeaks(message.guild)).toLocaleString());

        let fail = false;

        const channel = await message.guild.channels
            .create({
                name: format,
                type: ChannelType.GuildVoice,
                permissionOverwrites: [
                    {
                        id: role.id,
                        deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages],
                    },
                ],
            })
            .catch(() => {
                fail = true;
                return message.channel.send({ embeds: [new ErrorEmbed("error creating channel")] });
            });

        if (fail) return;

        profile.enabled = true;
        profile.channel = channel.id;

        await setGuildCounter(message.guild, profile);

        const embed = new CustomEmbed(message.member, "✅ channel successfully created")
            .setHeader("member count")
            .setFooter({ text: "channel will be updated every 10 minutes" });

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "disable") {
        if (!profile.enabled) {
            return message.channel.send({ embeds: [new ErrorEmbed("already disabled")] });
        }

        profile.enabled = false;
        profile.channel = "none";

        await setGuildCounter(message.guild, profile);

        const embed = new CustomEmbed(message.member, "✅ counter successfully disabled").setHeader("member count");

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "format") {
        if (args.length == 1) {
            const embed = new CustomEmbed(
                message.member,
                "this is how your channel will appear\n %count% is replaced with the member count\n%peak% is replaced with the total member peak"
            )
                .setHeader("member count")
                .addField("current format", "`" + profile.format + "`")
                .addField("help", `to change this format, do ${prefix}**counter format <new format>**`);

            return message.channel.send({ embeds: [embed] });
        }

        args.shift();

        const newFormat = args.join(" ");

        if (!newFormat.includes("%count%") && !newFormat.includes("%peak%")) {
            return message.channel.send({
                embeds: [new ErrorEmbed("format must include `%count%` or `%peak%` or both")],
            });
        }

        if (newFormat.length > 30) {
            return message.channel.send({ embeds: [new ErrorEmbed("cannot be longer than 30 characers")] });
        }

        profile.format = newFormat;

        await setGuildCounter(message.guild, profile);

        const embed = new CustomEmbed(message.member, "✅ format updated - will update channel on next interval")
            .setHeader("member count")
            .addField("new format", "`" + newFormat + "`");

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "filterbots") {
        if (args.length == 1) {
            const embed = new CustomEmbed(
                message.member,
                "if this is true, bots will not be counted towards the member count"
            )
                .setHeader("member count")
                .addField("current value", "`" + profile.filterBots + "`")
                .addField("help", `to change this option, do ${prefix}**counter filterbots <new value (true/false)>**`);

            return message.channel.send({ embeds: [embed] });
        }

        if (args[1].toLowerCase() != "true" && args[1].toLowerCase() != "false") {
            return message.channel.send({ embeds: [new ErrorEmbed("value must either be true or false")] });
        }

        if (args[1].toLowerCase() == "true") {
            profile.filterBots = true;
        } else {
            profile.filterBots = false;
        }

        await setGuildCounter(message.guild, profile);

        const embed = new CustomEmbed(message.member, "✅ value updated - will update channel on next interval")
            .setHeader("member count")
            .addField("new value", "`" + profile.filterBots + "`");

        return message.channel.send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "channel") {
        if (args.length == 1) {
            const embed = new CustomEmbed(
                message.member,
                "by setting the channel it will change the channel that is used to display the counter"
            )
                .setHeader("member count")
                .addField("current value", "`" + profile.channel + "`")
                .addField("help", `to change this value, do ${prefix}**counter channel <channel id>**`);

            return message.channel.send({ embeds: [embed] });
        }

        let channel;

        if (args[1].length != 18) {
            if (message.mentions.channels.first()) {
                channel = message.mentions.channels.first();
            } else {
                return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
            }
        } else {
            const c = message.guild.channels.cache.find((c) => c.id == args[1]);

            if (!c) {
                return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
            } else {
                channel = c;
            }
        }

        if (profile.channel == channel.id) {
            return message.channel.send({
                embeds: [new ErrorEmbed("channel must be different to current channel")],
            });
        }

        profile.channel = channel.id;

        await setGuildCounter(message.guild, profile);

        let memberCount = await message.guild.members.fetch();

        if (profile.filterBots) {
            memberCount = memberCount.filter((m) => !m.user.bot);
        }

        let format = "";

        format = profile.format.split("%count%").join(memberCount.size.toLocaleString());
        format = format.split("%peak%").join((await getPeaks(message.guild)).toString());

        const old = channel.name;

        let fail = false;

        await channel
            .edit({ name: format })
            .then(() => {
                logger.log({
                    level: "auto",
                    message: "counter updated for '" + message.guild.name + "' ~ '" + old + "' -> '" + format + "'",
                });
            })
            .catch(() => {
                logger.error("error updating counter in " + message.guild.name);
                fail = true;
            });

        if (fail) {
            profile.enabled = false;
            profile.channel = "none";
            await setGuildCounter(message.guild, profile);
            return message.channel.send({ embeds: [new ErrorEmbed("error updating channel")] });
        }

        const embed = new CustomEmbed(message.member, "✅ channel updated")
            .setHeader("member count")
            .addField("new value", "`" + profile.channel + "`");

        return message.channel.send({ embeds: [embed] });
    } else {
        const embed = new CustomEmbed(
            message.member,
            `${prefix}**counter enable** *enables the counter and creates a channel with the current format*\n` +
                `${prefix}**counter disable** *disables the counter and does NOT delete the channel*\n` +
                `${prefix}**counter format** *view/change the current channel format*\n` +
                `${prefix}**counter filterbots** *view/change the setting to filter bots*`
        )
            .setHeader("member count")
            .setFooter({ text: "member count will be updated every 10 minutes" });

        return message.channel.send({ embeds: [embed] });
    }
}

cmd.setRun(run);

module.exports = cmd;
