import { CommandInteraction, Message } from "discord.js";
import { startRestart } from "../utils/commandhandler";
import { setCustomPresence } from "../utils/functions/presence";
import { logger } from "../utils/logger";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("restartshard", "restartshard", Categories.NONE).setPermissions(["bot owner"]);

let confirm = false;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (message.member.user.id != "672793821850894347") return;

    if (confirm == false) {
        confirm = true;
        setTimeout(() => {
            confirm = false;
        }, 120000);
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, "run command again to confirm")],
        });
    } else {
        startRestart();

        setCustomPresence("rebooting..");

        message.client.user.setPresence({
            activities: [
                {
                    name: "rebooting..",
                },
            ],
        });

        logger.info("shard shutting down soon...");

        setTimeout(() => {
            logger.info("sharrd shutting down in 10 seconds...");

            setTimeout(() => {
                logger.info("shard shutting down...");
                process.exit();
            }, 10000);
        }, 20000);

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, "✅ current shard will shut down soon")],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;
