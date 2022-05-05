import { CommandInteraction, Message } from "discord.js"
import { getMember } from "../utils/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getKarma } from "../utils/karma/utils"
import { getPrefix } from "../utils/guilds/utils"

const cmd = new Command("karma", "check how much karma you have", Categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let target = message.member

    if (args.length >= 1) {
        target = message.mentions.members.first()

        if (!target) {
            target = await getMember(message.guild, args.join(" "))
        }

        if (!target) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
        }
    }

    const karma = getKarma(target)

    const embed = new CustomEmbed(message.member, false)

    if (target.user.id == message.author.id) {
        embed.setHeader("your karma", message.author.avatarURL())
        embed.setDescription(`you have **${karma.toLocaleString()}** karma 🔮`)
    } else {
        embed.setHeader(`${target.user.username}'s karma`, target.user.avatarURL())
        embed.setDescription(`${target.user.username} has **${karma.toLocaleString()}** karma 🔮`)
    }

    embed.setFooter(`whats karma? do ${getPrefix(message.guild)}karmahelp`)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
