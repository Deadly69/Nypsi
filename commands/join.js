const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getMember, getColor, formatDate } = require("../utils/utils")

const cmd = new Command("join", "information about when you joined the server", categories.INFO).setAliases(["joined"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    let member;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = getMember(message, args[0]);
        } else {
            member = message.mentions.members.first();
        }
    }

    if (!member) {
        return message.channel.send("❌ invalid user");
    }

    const color = getColor(member);

    const joinedServer = formatDate(member.joinedAt).toLowerCase()
    const daysAgo = timeSince(new Date(member.joinedAt))

    const members = message.guild.members.cache
    let membersSorted = []

    members.forEach(m => {
        if (m.joinedTimestamp) {
            membersSorted.push(m.id)
        }
    })

    membersSorted.sort(function(a, b) {
        return members.find(m => m.id == a).joinedAt - members.find(m => m.id == b).joinedAt
    })
    
    let joinPos = membersSorted.indexOf(member.id) + 1

    if (joinPos == 0) joinPos = "invalid"

    const embed = new MessageEmbed()
        .setTitle(member.user.tag)
        .setDescription("joined on **" + joinedServer + "**\n" +
            " - **" + daysAgo.toLocaleString() + "** days ago\n" +
            "join position is **" + joinPos + "**")
        .setFooter("bot.tekoh.wtf")
        .setColor(color)
        .setThumbnail(member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))
    return message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}