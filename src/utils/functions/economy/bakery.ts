import { BakeryUpgrade } from "@prisma/client";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getTier, isPremium } from "../premium/premium";
import { addProgress } from "./achievements";
import { addInventoryItem } from "./inventory";
import { getBakeryUpgradesData } from "./utils";
import ms = require("ms");

export async function getLastBake(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      lastBake: true,
    },
  });

  return query.lastBake;
}

export async function addBakeryUpgrade(member: GuildMember | string, itemId: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.bakeryUpgrade.upsert({
    where: {
      userId_upgradeId: {
        userId: id,
        upgradeId: itemId,
      },
    },
    update: {
      amount: { increment: 1 },
    },
    create: {
      userId: id,
      upgradeId: itemId,
      amount: 1,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`);
}

export async function getBakeryUpgrades(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`)) as BakeryUpgrade[];
  }

  const query = await prisma.bakeryUpgrade.findMany({
    where: {
      userId: id,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`, Math.floor(ms("1 hour") / 1000));

  return query;
}

async function getMaxAfkHours(member: GuildMember | string) {
  let max = 2;

  if (await isPremium(member)) {
    max += await getTier(member);
  }

  const upgrades = await getBakeryUpgrades(member).then((u) =>
    u.filter((i) => getBakeryUpgradesData()[i.upgradeId].upgrades === "maxafk")
  );

  for (const upgrade of upgrades) {
    max += getBakeryUpgradesData()[upgrade.upgradeId].value * upgrade.amount;
  }

  return max;
}

export async function runBakery(member: GuildMember) {
  const lastBaked = await getLastBake(member);
  const upgrades = await getBakeryUpgrades(member);
  const maxAfkHours = await getMaxAfkHours(member);

  let passive = 0;
  let click = 1;

  const diffMs = Date.now() - lastBaked.getTime();

  let diffHours = diffMs / 3.6e6;

  if (diffHours > maxAfkHours) diffHours = maxAfkHours;
  if (diffHours < 0) diffHours = 0;

  const earned = new Map<string, number>();

  for (const upgrade of upgrades) {
    if (getBakeryUpgradesData()[upgrade.upgradeId].upgrades === "hourly") {
      const amount = Math.round(upgrade.amount * getBakeryUpgradesData()[upgrade.upgradeId].value * diffHours);

      passive += amount;

      if (amount > 0) {
        earned.set(upgrade.upgradeId, amount);
      }
    } else {
      click += upgrade.amount * getBakeryUpgradesData()[upgrade.upgradeId].value;
    }
  }

  if (passive > 0) {
    await prisma.economy.update({
      where: {
        userId: member.user.id,
      },
      data: {
        lastBake: new Date(),
      },
    });
  }

  await addInventoryItem(member, "cookie", click + passive);

  const embed = new CustomEmbed(member).setHeader(`${member.user.username}'s bakery`, member.user.avatarURL());

  const earnedIds = Array.from(earned.keys());
  inPlaceSort(earnedIds).desc((i) => earned.get(i));
  const breakdownDesc: string[] = [];

  for (const upgradeId of earnedIds) {
    breakdownDesc.push(
      `${getBakeryUpgradesData()[upgradeId].emoji} ${getBakeryUpgradesData()[upgradeId].name} baked ${earned
        .get(upgradeId)
        .toLocaleString()} cookie${earned.get(upgradeId) > 1 ? "s" : ""}`
    );
  }

  embed.setDescription(`you baked **${(click + passive).toLocaleString()}** cookie${click + passive > 1 ? "s" : ""}!! 🍪`);

  if (breakdownDesc.length > 0) {
    embed.addField("breakdown", breakdownDesc.join("\n"));
  }

  addProgress(member.user.id, "baker", Math.round(click + passive));

  return embed;
}
