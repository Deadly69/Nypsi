import { EconomyWorker, EconomyWorkerUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import { logger } from "../../logger";
import { getBalance, updateBalance } from "./balance";
import { getBoosters } from "./boosters";
import { getBaseUpgrades, getBaseWorkers, getItems } from "./utils";

export async function getWorkers(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economyWorker.findMany({
    where: {
      userId: id,
    },
    include: {
      upgrades: true,
    },
  });

  return query;
}

export async function addWorker(member: GuildMember, id: string) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  const baseWorkers = getBaseWorkers();

  if (!baseWorkers[id]) return logger.warn(`unknown worker: ${id}`);

  await prisma.economyWorker
    .create({
      data: {
        userId: memberID,
        workerId: id,
      },
    })
    .catch(() => {});
}

export async function emptyWorkersStored(member: GuildMember | string) {
  let memberID: string;
  if (member instanceof GuildMember) {
    memberID = member.user.id;
  } else {
    memberID = member;
  }

  await prisma.economyWorker.updateMany({
    where: {
      userId: memberID,
    },
    data: {
      stored: 0,
    },
  });
}

export async function calcWorkerValues(
  worker: EconomyWorker & {
    upgrades: EconomyWorkerUpgrades[];
  }
) {
  const baseUpgrades = getBaseUpgrades();
  const baseWorkers = getBaseWorkers();

  const boosters = await getBoosters(worker.userId);
  const items = getItems();

  let perIntervalBonus = 0;
  let perItemBonus = 0;
  let maxStoredBonus = 0;

  for (const upgrade of worker.upgrades) {
    switch (baseUpgrades[upgrade.upgradeId].upgrades) {
      case 0:
        perItemBonus += baseUpgrades[upgrade.upgradeId].effect * upgrade.amount * baseWorkers[worker.workerId].base.per_item;
        break;
      case 1:
        perIntervalBonus +=
          baseUpgrades[upgrade.upgradeId].effect * upgrade.amount * baseWorkers[worker.workerId].base.per_interval;
        break;
      case 2:
        maxStoredBonus +=
          baseUpgrades[upgrade.upgradeId].effect * upgrade.amount * baseWorkers[worker.workerId].base.max_storage;
        break;
    }
  }

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].role != "booster") return;

    switch (items[boosterId].boosterEffect.boosts[0]) {
      case "per_interval":
        perIntervalBonus +=
          items[boosterId].boosterEffect.effect *
          boosters.get(boosterId).length *
          (perIntervalBonus + baseWorkers[worker.workerId].base.per_interval);
        break;
    }
  }

  return {
    perInterval: Math.floor(baseWorkers[worker.workerId].base.per_interval + perIntervalBonus),
    perItem: Math.floor(baseWorkers[worker.workerId].base.per_item + perItemBonus),
    maxStorage: Math.floor(baseWorkers[worker.workerId].base.max_storage + maxStoredBonus),
  };
}

export async function addWorkerUpgrade(member: GuildMember, workerId: string, upgradeId: string) {
  await prisma.economyWorkerUpgrades.upsert({
    where: {
      userId_workerId_upgradeId: {
        upgradeId: upgradeId,
        userId: member.user.id,
        workerId: workerId,
      },
    },
    update: {
      amount: { increment: 1 },
    },
    create: {
      upgradeId: upgradeId,
      userId: member.user.id,
      workerId: workerId,
      amount: 1,
    },
  });
}

export async function claimFromWorkers(userId: string): Promise<string> {
  const baseWorkers = getBaseWorkers();
  const userWorkers = await getWorkers(userId);

  let amountEarned = 0;
  const earnedBreakdown: string[] = [];
  const amounts = new Map<string, number>();

  for (const worker of userWorkers) {
    if (worker.stored == 0) continue;
    const baseWorker = baseWorkers[worker.workerId];

    const { perItem } = await calcWorkerValues(worker);

    amountEarned += Math.floor(perItem * worker.stored);
    earnedBreakdown.push(
      `${baseWorker.name} +$${Math.floor(perItem * worker.stored).toLocaleString()} (${worker.stored.toLocaleString()} ${
        baseWorker.item_emoji
      })`
    );
    amounts.set(
      `${baseWorker.name} +$${Math.floor(perItem * worker.stored).toLocaleString()} (${worker.stored.toLocaleString()} ${
        baseWorker.item_emoji
      })`,
      perItem * worker.stored
    );
  }

  inPlaceSort(earnedBreakdown).desc((x) => amounts.get(x));

  if (amountEarned == 0) {
    return "you have no money to claim from your workers";
  }

  await emptyWorkersStored(userId);
  await updateBalance(userId, (await getBalance(userId)) + amountEarned);

  return `+$**${amountEarned.toLocaleString()}**\n\n${earnedBreakdown.join("\n")}`;
}
