import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ProgressLog } from '@prisma/client';
import { client } from '../prisma';
import { client as bot } from '../index';
import {
  enumStringsToChoice,
  getAnnoucementsChannel,
  getPrimaryGuild,
  getUpdatesChannel,
} from '../util';
import { ChannelType, EmbedBuilder } from 'discord.js';
import {
  CommandContext,
  CommandOptionType,
  Member,
  SlashCommand,
  SlashCreator,
} from 'slash-create';

dayjs.extend(isoWeek);
dayjs.extend(utc);

enum Product {
  TAUOS,
  HOMEPAGE,
  PHOTON_BROWSER,
  INTERNAL,
  RABONEKO,
  ANDAMAN,
  TERRA,
  OTHER,
}

const productToString: Map<Product, string> = new Map([
  [Product.TAUOS, 'tauOS'],
  [Product.HOMEPAGE, 'Homepage'],
  [Product.PHOTON_BROWSER, 'photonBrowser'],
  [Product.INTERNAL, 'InternalTools'],
  [Product.RABONEKO, 'Raboneko (me :3)'],
  [Product.ANDAMAN, 'Andaman'],
  [Product.TERRA, 'Terra'],
  [Product.OTHER, 'Other'],
]);

const _stringToProduct: Map<string, Product> = new Map(
  [...productToString.entries()].map(([k, v]) => [v, k]),
);

enum LogType {
  MILESTONE,
  BLOCKER,
  RELEASE,
  FEATURE,
  BUG_FIX,
  OTHER,
  IMPROVEMENT,
}

const logTypeToString: Map<LogType, string> = new Map([
  [LogType.MILESTONE, 'Milestone'],
  [LogType.BLOCKER, 'Blocker'],
  [LogType.RELEASE, 'Release'],
  [LogType.FEATURE, 'Feature'],
  [LogType.IMPROVEMENT, 'Improvement'],
  [LogType.BUG_FIX, 'Bug Fix'],
  [LogType.OTHER, 'Other'],
]);

const stringToLogType: Map<string, LogType> = new Map(
  [...logTypeToString.entries()].map(([k, v]) => [v, k]),
);

const logTypeToEmoji: Map<LogType, string> = new Map([
  [LogType.MILESTONE, ':bookmark:'],
  [LogType.BLOCKER, ':octagonal_sign:'],
  [LogType.RELEASE, ':rocket:'],
  [LogType.FEATURE, ':sparkles:'],
  [LogType.IMPROVEMENT, ':hammer:'],
  [LogType.BUG_FIX, ':bug:'],
  [LogType.OTHER, ':notepad_spiral:'],
]);

const groupLogs = (logs: ProgressLog[]): Record<string, ProgressLog[]> =>
  logs.reduce((prev, l) => {
    const productString = productToString.get(l.product)!;

    if (!(productString in prev)) {
      prev[productString] = [];
    }

    prev[productString].push(l);

    return prev;
  }, {} as Record<string, ProgressLog[]>);

const partitionStringsByLength = (strings: string[], maxLength: number): string[][] => {
  const final: string[][] = [[]];
  let sub = final[0];

  strings.forEach((string) => {
    const lengthAfterPush = sub.reduce((acc, curr) => acc + curr.length, 0) + string.length;
    if (lengthAfterPush <= maxLength) {
      sub.push(string);
    } else {
      sub = [];
      final.push(sub);
      sub.push(string);
    }
  });

  return final;
};

const generateFields = (
  grouped: Record<string, ProgressLog[]>,
): Promise<Array<{ name: string; value: string }>> =>
  Promise.all(
    Object.entries(grouped).map(async ([product, logs]) => {
      const formatted = await Promise.all(
        [...logs]
          .sort((l1, l2) => l1.createdAt.valueOf() - l2.createdAt.valueOf())
          .map(async (l) => {
            const guild = await getPrimaryGuild();
            let memberName;
            try {
              memberName = (await guild.members.fetch(l.userID)).displayName;
            } catch {
              memberName = (await bot.users.fetch(l.userID)).username;
            }

            const emoji = logTypeToEmoji.get(l.type);

            return `${memberName} • ${emoji} ${l.summary}`;
          }),
      );

      const paritioned = partitionStringsByLength(formatted, 1024);

      return paritioned.map((parition, i) => ({
        name: i != 0 ? `${product} (continued)` : product,
        value: parition.join('\n'),
      }));
    }),
  ).then((fields) => fields.flat());

export const generateFinalReport = async (): Promise<void> => {
  const lastWeek = dayjs.utc().isoWeekday(-1);
  const startOfWeek = lastWeek.startOf('isoWeek');
  const endOfWeek = lastWeek.endOf('isoWeek');

  const logs = await client.progressLog.findMany({
    where: {
      createdAt: {
        gte: startOfWeek.toDate(),
        lte: endOfWeek.toDate(),
      },
    },
  });

  const grouped = groupLogs(logs);
  const fields = await generateFields(grouped);
  const embed = new EmbedBuilder()
    .addFields(fields)
    .setDescription(fields.length > 0 ? null : '*No progress this week.*');

  const announcementsChannel = await getAnnoucementsChannel();

  if (announcementsChannel?.type !== ChannelType.GuildText) {
    throw new Error('Announcements channel is not a text channel.');
  }

  let content = `Here is the final report for the week of ${startOfWeek.format(
    'MMMM D, YYYY',
  )} to ${endOfWeek.format('MMMM D, YYYY')}. Great work everyone!`;
  if (Math.random() < 0.05)
    content = "New face filters on Instagram today. This one's my favorite so far. Nice job team!";
  await announcementsChannel.send({
    content,
    embeds: [embed.data],
  });
};

export default class Progress extends SlashCommand {
  public constructor(creator: SlashCreator) {
    super(creator, {
      name: 'progress',
      description: 'Track progress for Fyra projects, per week',
      dmPermission: false,
      options: [
        {
          type: CommandOptionType.STRING,
          name: 'product',
          description: 'The product the log is for',
          choices: enumStringsToChoice(productToString),
          required: true,
        },
        {
          type: CommandOptionType.STRING,
          name: 'type',
          description: 'The type of progress log',
          choices: enumStringsToChoice(logTypeToString),
          required: true,
        },
        {
          type: CommandOptionType.STRING,
          name: 'summary',
          description: 'The summary of your progress',
          required: true,
        },
      ],
    });
  }

  public async run(ctx: CommandContext): Promise<void> {
    if (!(ctx.member instanceof Member)) {
      await ctx.sendFollowUp("Sorry, I couldn't understand your request for some reason >_<");
      return;
    }

    const type = parseInt(ctx.options.type, 10) as LogType;
    const product = parseInt(ctx.options.product, 10) as Product;

    const log = await client.progressLog.create({
      data: {
        userID: ctx.user.id,
        type,
        product,
        summary: ctx.options.summary,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('Progress Log Submitted')
      .setColor('#00ff00')
      .setFooter({
        text: `ID: #${log.id.toString()}`,
      })
      .setAuthor({
        name: ctx.member.displayName,
        iconURL: ctx.member.avatarURL,
      })
      .setDescription(ctx.options.summary)
      .setFields([
        { name: 'Product', value: productToString.get(product)!, inline: true },
        { name: 'Type', value: logTypeToString.get(type)!, inline: true },
      ]).data;

    await ctx.sendFollowUp({
      content:
        "Thanks for submitting your progress log! I'll add it to our weekly report :3\nFor now, here's a preview of your log:",
      embeds: [embed],
    });

    const updatesChannel = await getUpdatesChannel();

    if (updatesChannel?.type !== ChannelType.GuildText) {
      throw new Error('Updates channel is not a text channel.');
    }

    await updatesChannel.send({
      content: 'Yay, a progress log just got submitted~',
      embeds: [embed],
    });
  }
}
