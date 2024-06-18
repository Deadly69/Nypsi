import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import s3 from "../../../init/s3";
import Constants from "../../Constants";

export async function getMaxEvidenceBytes(guild: Guild) {
  const cache = await redis.get(`${Constants.redis.cache.guild.EVIDENCE_MAX}:${guild.id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.guildEvidenceCredit.findMany({
    where: {
      guildId: guild.id,
    },
    select: {
      bytes: true,
    },
  });

  const base = Constants.EVIDENCE_BASE;
  let total = base;

  if (query.length > 0) total += Number(query.map((a) => a.bytes).reduce((a, b) => a + b));

  await redis.set(`${Constants.redis.cache.guild.EVIDENCE_MAX}:${guild.id}`, total, "EX", 21600); // 6 hours

  return total;
}

export async function getUsedEvidenceBytes(guild: Guild) {
  const evidences = await prisma.moderationEvidence.findMany({
    where: {
      guildId: guild.id,
    },
    select: {
      bytes: true,
    },
  });

  if (evidences.length === 0) return 0;
  else return Number(evidences.map((e) => e.bytes).reduce((a, b) => a + b));
}

export async function deleteEvidence(guild: Guild, caseId: number) {
  const evidence = await prisma.moderationEvidence.delete({
    where: {
      caseId_guildId: {
        caseId,
        guildId: guild.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (evidence)
    s3.send(new DeleteObjectCommand({ Key: evidence.id, Bucket: process.env.S3_BUCKET }));
}
